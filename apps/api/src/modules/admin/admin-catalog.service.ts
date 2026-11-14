// Quản lý danh mục của Admin (G3 đợt 3): môn học và khối lớp, tên hai ngôn ngữ, thứ tự, bật/tắt. Không xóa:
// môn / khối đã có gia sư dạy hay hồ sơ con tham chiếu chỉ tắt được (tắt thì không hiện trong form mới, dữ liệu
// cũ vẫn giữ). Mã không đổi được sau khi tạo. Tỉnh và xã nạp từ bộ dữ liệu hành chính chính thức
// (`db:seed:areas`), không sửa tay ở đây. Mọi thay đổi ghi nhật ký kiểm toán.
import type {
  AdminGradeLevel,
  AdminSubject,
  CreateGradeLevelRequest,
  CreateSubjectRequest,
  UpdateSubjectRequest,
} from '@tps/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AppError, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import { createAuditRepository } from '../audit/audit.repository.js';
import { GradeLevel } from '../catalog/grade-level.entity.js';
import { Subject } from '../catalog/subject.entity.js';
import type { AdminActor } from './admin-accounts.service.js';

const codeTaken = () =>
  new AppError('validation_failed', 'Code already exists', [
    { path: 'code', code: 'catalog_code_taken', message: 'Code already exists' },
  ]);

/** Thay đổi đã gửi (bỏ trường không gửi), để ghi vào nhật ký. */
const changedFields = (input: UpdateSubjectRequest) =>
  Object.keys(input).filter((k) => input[k as keyof UpdateSubjectRequest] !== undefined);

export function createAdminCatalogService(deps: { dataSource: DataSource; logger: Logger }) {
  const { dataSource, logger } = deps;

  async function audit(
    manager: EntityManager,
    actor: AdminActor,
    action:
      | 'catalog.subject_created'
      | 'catalog.subject_updated'
      | 'catalog.grade_level_created'
      | 'catalog.grade_level_updated',
    entityType: 'subject' | 'grade_level',
    id: number,
    metadata: Record<string, unknown>,
  ) {
    await createAuditRepository(manager).record({
      actorUserId: actor.userId,
      actorRole: 'admin',
      action,
      entityType,
      entityId: String(id),
      metadata,
      ipAddress: actor.ipAddress,
    });
  }

  async function subjects(): Promise<AdminSubject[]> {
    const rows = await dataSource.query<
      {
        id: number;
        code: string;
        name_vi: string;
        name_en: string;
        sort_order: number;
        is_active: boolean;
        tutor_count: number;
      }[]
    >(
      `SELECT s.id, s.code, s.name_vi, s.name_en, s.sort_order, s.is_active,
              (SELECT count(DISTINCT t.tutor_id)::int FROM tutor_teaching_subjects t
                WHERE t.subject_id = s.id) AS tutor_count
         FROM subjects s ORDER BY s.sort_order, s.id`,
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      nameVi: r.name_vi,
      nameEn: r.name_en,
      sortOrder: r.sort_order,
      isActive: r.is_active,
      tutorCount: r.tutor_count,
    }));
  }

  async function gradeLevels(): Promise<AdminGradeLevel[]> {
    const rows = await dataSource.query<
      {
        id: number;
        code: string;
        stage: AdminGradeLevel['stage'];
        name_vi: string;
        name_en: string;
        sort_order: number;
        is_active: boolean;
        tutor_count: number;
      }[]
    >(
      `SELECT g.id, g.code, g.stage, g.name_vi, g.name_en, g.sort_order, g.is_active,
              (SELECT count(DISTINCT t.tutor_id)::int FROM tutor_teaching_subjects t
                WHERE t.grade_level_id = g.id) AS tutor_count
         FROM grade_levels g ORDER BY g.sort_order, g.id`,
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      stage: r.stage,
      nameVi: r.name_vi,
      nameEn: r.name_en,
      sortOrder: r.sort_order,
      isActive: r.is_active,
      tutorCount: r.tutor_count,
    }));
  }

  /** Thứ tự mặc định: cuối danh sách. */
  async function nextSortOrder(manager: EntityManager, table: 'subjects' | 'grade_levels') {
    const [row] = await manager.query<{ next: number }[]>(
      `SELECT coalesce(max(sort_order), 0) + 10 AS next FROM ${table}`,
    );
    return row?.next ?? 10;
  }

  return {
    subjects,
    gradeLevels,

    async createSubject(actor: AdminActor, input: CreateSubjectRequest): Promise<AdminSubject> {
      const id = await dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Subject);
        if (await repo.existsBy({ code: input.code })) throw codeTaken();
        const saved = await repo.save(
          repo.create({
            code: input.code,
            nameVi: input.nameVi,
            nameEn: input.nameEn,
            sortOrder: input.sortOrder ?? (await nextSortOrder(manager, 'subjects')),
          }),
        );
        await audit(manager, actor, 'catalog.subject_created', 'subject', saved.id, {
          code: saved.code,
        });
        return saved.id;
      });
      logger.info({ subjectId: id, adminId: actor.userId }, 'Subject created');
      const created = (await subjects()).find((s) => s.id === id);
      if (!created) throw notFound('Subject');
      return created;
    },

    async updateSubject(
      actor: AdminActor,
      id: number,
      input: UpdateSubjectRequest,
    ): Promise<AdminSubject> {
      await dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Subject);
        if (!(await repo.existsBy({ id }))) throw notFound('Subject');
        await repo.update({ id }, input);
        await audit(manager, actor, 'catalog.subject_updated', 'subject', id, {
          fields: changedFields(input),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        });
      });
      const updated = (await subjects()).find((s) => s.id === id);
      if (!updated) throw notFound('Subject');
      return updated;
    },

    async createGradeLevel(
      actor: AdminActor,
      input: CreateGradeLevelRequest,
    ): Promise<AdminGradeLevel> {
      const id = await dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(GradeLevel);
        if (await repo.existsBy({ code: input.code })) throw codeTaken();
        const saved = await repo.save(
          repo.create({
            code: input.code,
            stage: input.stage,
            nameVi: input.nameVi,
            nameEn: input.nameEn,
            sortOrder: input.sortOrder ?? (await nextSortOrder(manager, 'grade_levels')),
          }),
        );
        await audit(manager, actor, 'catalog.grade_level_created', 'grade_level', saved.id, {
          code: saved.code,
        });
        return saved.id;
      });
      logger.info({ gradeLevelId: id, adminId: actor.userId }, 'Grade level created');
      const created = (await gradeLevels()).find((g) => g.id === id);
      if (!created) throw notFound('Grade level');
      return created;
    },

    async updateGradeLevel(
      actor: AdminActor,
      id: number,
      input: UpdateSubjectRequest,
    ): Promise<AdminGradeLevel> {
      await dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(GradeLevel);
        if (!(await repo.existsBy({ id }))) throw notFound('Grade level');
        await repo.update({ id }, input);
        await audit(manager, actor, 'catalog.grade_level_updated', 'grade_level', id, {
          fields: changedFields(input),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        });
      });
      const updated = (await gradeLevels()).find((g) => g.id === id);
      if (!updated) throw notFound('Grade level');
      return updated;
    },
  };
}

export type AdminCatalogService = ReturnType<typeof createAdminCatalogService>;
