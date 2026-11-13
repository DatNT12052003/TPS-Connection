// Hồ sơ con (người học) do phụ huynh quản lý (G2 phần 4, C9, D4, D16). Mọi thao tác trên một hồ sơ cụ thể
// đi qua learner-access trước: phụ huynh chỉ thấy con mình, học sinh chỉ thấy hồ sơ của chính mình (chỉ xem).
// Không phụ thuộc Express.
import {
  CHILD_DATA_CONSENT_VERSION,
  type CreateLearnerRequest,
  type GuardianRelationship,
  type Learner as LearnerDto,
  type PendingStudentInvitation,
  type Role,
  type UpdateLearnerRequest,
} from '@tps/shared';
import type { DataSource } from 'typeorm';
import { conflict, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import { assertCatalogRefs } from '../catalog/catalog-checks.js';
import { createUsersRepository } from '../users/users.repository.js';
import { createLearnerAccess, type LearnerViewer } from './learner-access.js';
import type { Learner } from './learner.entity.js';
import { createLearnersRepository, type LearnerData } from './learners.repository.js';
import type { StudentInvitation } from './student-invitation.entity.js';
import { createStudentInvitationsRepository } from './student-invitations.repository.js';

/** Người đang gọi API (từ req.auth). */
export interface Actor {
  id: string;
  roles: Role[];
}

export const toPendingInvitationDto = (
  invitation: StudentInvitation,
): PendingStudentInvitation => ({
  id: invitation.id,
  email: invitation.email,
  expiresAt: invitation.expiresAt.toISOString(),
  createdAt: invitation.createdAt.toISOString(),
});

/**
 * DTO theo người xem. Học sinh chỉ xem (D4) và không thấy ghi chú phụ huynh viết cho gia sư, quan hệ,
 * hay lời mời.
 */
function toDto(
  learner: Learner,
  viewer: LearnerViewer,
  extra: { relationship: GuardianRelationship | null; invitation: StudentInvitation | null },
): LearnerDto {
  const guardian = viewer === 'guardian';
  return {
    id: learner.id,
    viewer,
    fullName: learner.fullName,
    nickname: learner.nickname,
    dateOfBirth: learner.dateOfBirth,
    gradeLevelId: learner.gradeLevelId,
    schoolName: learner.schoolName,
    provinceId: learner.provinceId,
    communeId: learner.communeId,
    addressLine: learner.addressLine,
    notes: guardian ? learner.notes : null,
    relationship: guardian ? extra.relationship : null,
    hasStudentAccount: learner.accountUserId !== null,
    pendingInvitation:
      guardian && extra.invitation ? toPendingInvitationDto(extra.invitation) : null,
    createdAt: learner.createdAt.toISOString(),
    updatedAt: learner.updatedAt.toISOString(),
  };
}

/** Chỉ giữ các trường client có gửi (undefined = không đổi; null = xóa giá trị). */
function definedFields<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function createLearnersService(deps: {
  dataSource: DataSource;
  logger: Logger;
  now?: () => Date;
}) {
  const { dataSource, logger } = deps;
  const now = deps.now ?? (() => new Date());

  /** Đọc một hồ sơ đã kiểm tra quyền xem. */
  async function load(actorId: string, learnerId: string): Promise<LearnerDto> {
    const manager = dataSource.manager;
    const viewer = await createLearnerAccess(manager).assertCanView(actorId, learnerId);
    const repo = createLearnersRepository(manager);
    const learner = await repo.findActive(learnerId);
    if (!learner) throw notFound('Learner');
    if (viewer === 'student')
      return toDto(learner, viewer, { relationship: null, invitation: null });

    const [guardian, [invitation]] = await Promise.all([
      repo.activeGuardian(learnerId),
      createStudentInvitationsRepository(manager).findPendingFor([learnerId], now()),
    ]);
    return toDto(learner, viewer, {
      relationship: guardian?.relationship ?? null,
      invitation: invitation ?? null,
    });
  }

  return {
    /** Phụ huynh: các con đang quản lý. Học sinh: hồ sơ của chính mình. */
    async list(actor: Actor): Promise<LearnerDto[]> {
      const manager = dataSource.manager;
      const repo = createLearnersRepository(manager);
      const items: LearnerDto[] = [];

      if (actor.roles.includes('parent')) {
        const rows = await repo.listForGuardian(actor.id);
        const invitations = await createStudentInvitationsRepository(manager).findPendingFor(
          rows.map((r) => r.learner.id),
          now(),
        );
        const byLearner = new Map(invitations.map((i) => [i.learnerId, i]));
        for (const { learner, relationship } of rows) {
          items.push(
            toDto(learner, 'guardian', {
              relationship,
              invitation: byLearner.get(learner.id) ?? null,
            }),
          );
        }
      }
      if (actor.roles.includes('student')) {
        const own = await repo.findByAccount(actor.id);
        if (own) items.push(toDto(own, 'student', { relationship: null, invitation: null }));
      }
      return items;
    },

    get: load,

    /**
     * Phụ huynh tạo hồ sơ con và trở thành người quản lý duy nhất (C9). Cùng transaction: lưu bằng chứng
     * đồng ý xử lý dữ liệu của con (phiên bản văn bản, thời điểm, IP).
     */
    async create(
      actorId: string,
      input: CreateLearnerRequest,
      ipAddress: string | null,
    ): Promise<LearnerDto> {
      await assertCatalogRefs(dataSource.manager, {
        gradeLevelId: input.gradeLevelId,
        location: { provinceId: input.provinceId ?? null, communeId: input.communeId ?? null },
      });
      const learnerId = await dataSource.transaction(async (manager) => {
        const learner = await createLearnersRepository(manager).create({
          fullName: input.fullName,
          nickname: input.nickname ?? null,
          dateOfBirth: input.dateOfBirth ?? null,
          gradeLevelId: input.gradeLevelId,
          schoolName: input.schoolName ?? null,
          provinceId: input.provinceId ?? null,
          communeId: input.communeId ?? null,
          addressLine: input.addressLine ?? null,
          notes: input.notes ?? null,
          createdBy: actorId,
        });
        await createLearnersRepository(manager).addGuardian(
          learner.id,
          actorId,
          input.relationship,
        );
        await createUsersRepository(manager).recordChildDataConsent(
          actorId,
          learner.id,
          CHILD_DATA_CONSENT_VERSION,
          ipAddress,
        );
        return learner.id;
      });
      logger.info({ userId: actorId, learnerId }, 'Learner profile created');
      return load(actorId, learnerId);
    },

    /** Chỉ phụ huynh quản lý được sửa (học sinh chỉ xem, D4). */
    async update(
      actorId: string,
      learnerId: string,
      input: UpdateLearnerRequest,
    ): Promise<LearnerDto> {
      await dataSource.transaction(async (manager) => {
        await createLearnerAccess(manager).assertParentOf(actorId, learnerId);
        const repo = createLearnersRepository(manager);
        const learner = await repo.findActive(learnerId, { lock: true });
        if (!learner) throw notFound('Learner');

        const { relationship, ...fields } = input;
        const changes: Partial<LearnerData> = definedFields(fields);
        // Đổi tỉnh mà không chọn lại xã: bỏ xã cũ (xã cũ thuộc tỉnh cũ).
        if (
          changes.provinceId !== undefined &&
          changes.communeId === undefined &&
          changes.provinceId !== learner.provinceId
        ) {
          changes.communeId = null;
        }
        const locationChanged = changes.provinceId !== undefined || changes.communeId !== undefined;
        await assertCatalogRefs(manager, {
          gradeLevelId: changes.gradeLevelId,
          location: locationChanged
            ? {
                provinceId:
                  changes.provinceId !== undefined ? changes.provinceId : learner.provinceId,
                communeId: changes.communeId !== undefined ? changes.communeId : learner.communeId,
              }
            : undefined,
        });

        if (Object.keys(changes).length > 0) await repo.update(learnerId, changes);
        if (relationship) await repo.setRelationship(learnerId, actorId, relationship);
      });
      return load(actorId, learnerId);
    },

    /**
     * Xóa mềm hồ sơ con: ẩn ngay, rút lại đồng ý xử lý dữ liệu, hủy lời mời đang mở. Dữ liệu cá nhân được
     * ẩn danh hóa sau 6 tháng bằng job (C2). Hồ sơ đã có tài khoản học sinh thì chưa xóa được ở bản này.
     */
    async remove(actorId: string, learnerId: string): Promise<void> {
      await dataSource.transaction(async (manager) => {
        await createLearnerAccess(manager).assertParentOf(actorId, learnerId);
        const repo = createLearnersRepository(manager);
        const learner = await repo.findActive(learnerId, { lock: true });
        if (!learner) throw notFound('Learner');
        if (learner.accountUserId) {
          throw conflict('Learner has a student account; it cannot be deleted yet');
        }
        await repo.softDelete(learnerId);
        await createStudentInvitationsRepository(manager).revokeOpen(learnerId);
        await createUsersRepository(manager).withdrawChildDataConsent(learnerId);
      });
      logger.info({ userId: actorId, learnerId }, 'Learner profile deleted');
    },
  };
}

export type LearnersService = ReturnType<typeof createLearnersService>;
