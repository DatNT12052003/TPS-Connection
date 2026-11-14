// Hồ sơ gia sư (G2 phần 5, §3.2, B.4.1). Gia sư sửa hồ sơ của chính mình; sửa trường tự khai không đổi
// trạng thái hồ sơ. Nộp xác minh và đổi trạng thái ở modules/verification (G3). Hồ sơ công khai chỉ gồm gia sư đã xác minh danh
// tính và đang hoạt động; không có email, số điện thoại, họ tên thật (D16). Không phụ thuộc Express.
import {
  type CreateTutorCredentialRequest,
  type OwnTutorProfile,
  type PublicTutorProfile,
  type TeachingMode,
  type TutorCredential as TutorCredentialDto,
  TUTOR_PROFILE_LIMITS,
  type TutorRequiredField,
  type UpdateTutorCredentialRequest,
  type UpdateTutorProfileRequest,
  type VerificationRejectionCode,
} from '@tps/shared';
import type { DataSource } from 'typeorm';
import { AppError, conflict, invalidStateTransition, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import { assertCatalogRefs } from '../catalog/catalog-checks.js';
import type { FilesService } from '../files/files.service.js';
import type { StoredFile } from '../files/stored-file.entity.js';
import { createUsersRepository } from '../users/users.repository.js';
import type { TutorCredential } from './tutor-credential.entity.js';
import type { TutorProfile } from './tutor-profile.entity.js';
import { createVerificationRepository } from '../verification/verification.repository.js';
import { createTutorsRepository, type TutorProfileItems } from './tutors.repository.js';

function teachingModeOf(profile: TutorProfile): TeachingMode | null {
  if (profile.teachesOnline && profile.teachesInPerson) return 'hybrid';
  if (profile.teachesOnline) return 'online';
  if (profile.teachesInPerson) return 'in_person';
  return null;
}

const rateOf = (profile: TutorProfile) =>
  profile.rateAmountVnd !== null && profile.rateUnit !== null
    ? { amountVnd: Number(profile.rateAmountVnd), unit: profile.rateUnit }
    : null;

/** Các trường hồ sơ dùng chung cho bản của gia sư và bản công khai. */
function profileFields(profile: TutorProfile, items: TutorProfileItems) {
  return {
    headline: profile.headline,
    bio: profile.bio,
    occupation: profile.occupation,
    institution: profile.institution,
    major: profile.major,
    highestEducation: profile.highestEducation,
    experienceYears: profile.experienceYears,
    teachingMethod: profile.teachingMethod,
    achievements: profile.achievements,
    introVideoUrl: profile.introVideoUrl,
    teachingMode: teachingModeOf(profile),
    rate: rateOf(profile),
    acceptingStudents: profile.acceptingStudents,
    hasVerifiedDegree: profile.hasVerifiedDegree,
    ...items,
  };
}

/** Bằng cấp cho chính gia sư; `rejection` là lần bị từ chối gần nhất (chỉ hiện khi đang `rejected`). */
export function toCredentialDto(
  c: TutorCredential,
  rejection?: { code: VerificationRejectionCode; note: string | null },
): TutorCredentialDto {
  const rejected = c.verificationStatus === 'rejected' && rejection;
  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    issuer: c.issuer,
    issuedYear: c.issuedYear,
    verificationStatus: c.verificationStatus,
    rejectionCode: rejected ? rejection.code : null,
    rejectionNote: rejected ? rejection.note : null,
  };
}

/** Trường bắt buộc còn thiếu để nộp xác minh danh tính (D34). */
export function missingForVerification(
  profile: TutorProfile,
  items: TutorProfileItems,
  fullName: string | null,
): TutorRequiredField[] {
  const missing: TutorRequiredField[] = [];
  if (!fullName) missing.push('fullName');
  if (items.teachingSubjects.length === 0) missing.push('teachingSubjects');
  if (teachingModeOf(profile) === null) missing.push('teachingMode');
  if (rateOf(profile) === null) missing.push('rate');
  return missing;
}

/** Bằng cấp đang chờ duyệt hoặc đã xác minh thì khóa, không sửa hay xóa được (B.4.2). */
const isLocked = (c: TutorCredential) =>
  c.verificationStatus === 'pending' || c.verificationStatus === 'verified';

export function createTutorsService(deps: {
  dataSource: DataSource;
  files: FilesService;
  logger: Logger;
  /** URL công khai của tệp ở bucket public (storage.publicUrl). */
  publicFileUrl: (storageKey: string) => string;
}) {
  const { dataSource, files, logger } = deps;
  const repo = () => createTutorsRepository(dataSource.manager);

  async function getOwn(userId: string): Promise<OwnTutorProfile> {
    const tutors = repo();
    const profile = await tutors.ensureProfile(userId);
    const [items, credentials, user] = await Promise.all([
      tutors.items(userId),
      tutors.listCredentials(userId),
      createUsersRepository(dataSource.manager).findById(userId),
    ]);
    const rejections = await createVerificationRepository(
      dataSource.manager,
    ).latestCredentialRejections(
      credentials.filter((c) => c.verificationStatus === 'rejected').map((c) => c.id),
    );
    return {
      ...profileFields(profile, items),
      userId,
      profileStatus: profile.profileStatus,
      identityVerifiedAt: profile.identityVerifiedAt?.toISOString() ?? null,
      credentials: credentials.map((c) => toCredentialDto(c, rejections.get(c.id))),
      missingForVerification: missingForVerification(profile, items, user?.fullName ?? null),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  return {
    getOwn,

    /** Thay toàn bộ hồ sơ (trường tự khai, môn – khối, khu vực, lịch rảnh) trong một transaction. */
    async replaceOwn(userId: string, input: UpdateTutorProfileRequest): Promise<OwnTutorProfile> {
      await assertCatalogRefs(dataSource.manager, {
        teachingSubjects: input.teachingSubjects,
        serviceAreaIds: input.serviceAreaIds,
      });
      await dataSource.transaction(async (manager) => {
        const tutors = createTutorsRepository(manager);
        await tutors.ensureProfile(userId);
        const current = await tutors.findProfile(userId, { lock: true });
        // Nghề nghiệp quyết định giấy tờ phải nộp (C4): không đổi được khi đang chờ duyệt.
        if (
          current?.profileStatus === 'pending_verification' &&
          current.occupation !== input.occupation
        ) {
          throw new AppError('validation_failed', 'Occupation is locked while under review', [
            { path: 'occupation', code: 'locked_while_verifying', message: 'Occupation is locked' },
          ]);
        }
        const mode = input.teachingMode;
        await tutors.updateProfile(userId, {
          headline: input.headline,
          bio: input.bio,
          occupation: input.occupation,
          institution: input.institution,
          major: input.major,
          highestEducation: input.highestEducation,
          experienceYears: input.experienceYears,
          teachingMethod: input.teachingMethod,
          achievements: input.achievements,
          introVideoUrl: input.introVideoUrl,
          teachesOnline: mode === 'online' || mode === 'hybrid',
          teachesInPerson: mode === 'in_person' || mode === 'hybrid',
          rateAmountVnd: input.rate?.amountVnd ?? null,
          rateUnit: input.rate?.unit ?? null,
          acceptingStudents: input.acceptingStudents,
        });
        await tutors.replaceItems(userId, {
          teachingSubjects: input.teachingSubjects,
          serviceAreaIds: input.serviceAreaIds,
          availability: input.availability,
        });
      });
      logger.info({ userId }, 'Tutor profile saved');
      return getOwn(userId);
    },

    /** Thêm bằng cấp tự khai. Tối đa 20 mục mỗi gia sư. */
    async addCredential(
      userId: string,
      input: CreateTutorCredentialRequest,
    ): Promise<TutorCredentialDto> {
      const tutors = repo();
      await tutors.ensureProfile(userId);
      if ((await tutors.countCredentials(userId)) >= TUTOR_PROFILE_LIMITS.credentials) {
        throw conflict('Too many credentials');
      }
      const credential = await tutors.createCredential({
        tutorId: userId,
        kind: input.kind,
        title: input.title,
        issuer: input.issuer ?? null,
        issuedYear: input.issuedYear ?? null,
      });
      return toCredentialDto(credential);
    },

    /**
     * Sửa bằng cấp tự khai. Đang chờ duyệt hoặc đã xác minh: không sửa được. Sửa bằng cấp bị từ chối thì
     * quay về tự khai (gia sư có thể nộp lại ở G3).
     */
    async updateCredential(
      userId: string,
      credentialId: string,
      input: UpdateTutorCredentialRequest,
    ): Promise<TutorCredentialDto> {
      const tutors = repo();
      const credential = await tutors.findCredential(userId, credentialId);
      if (!credential) throw notFound('Credential');
      if (isLocked(credential)) {
        throw invalidStateTransition('Credential is pending review or verified');
      }
      const changes = Object.fromEntries(
        Object.entries(input).filter(([, v]) => v !== undefined),
      ) as Partial<Pick<TutorCredential, 'kind' | 'title' | 'issuer' | 'issuedYear'>>;
      await tutors.updateCredential(credentialId, {
        ...changes,
        verificationStatus: 'self_declared',
      });
      const updated = await tutors.findCredential(userId, credentialId);
      if (!updated) throw notFound('Credential');
      return toCredentialDto(updated);
    },

    /** Xóa bằng cấp tự khai hoặc bị từ chối, kèm lịch sử xác minh và ảnh giấy tờ cũ của nó. */
    async removeCredential(userId: string, credentialId: string): Promise<void> {
      const deleted = await dataSource.transaction(async (manager) => {
        const tutors = createTutorsRepository(manager);
        const credential = await tutors.findCredential(userId, credentialId, { lock: true });
        if (!credential) throw notFound('Credential');
        if (isLocked(credential)) {
          throw invalidStateTransition('Credential is pending review or verified');
        }
        const fileIds =
          await createVerificationRepository(manager).deleteForCredential(credentialId);
        await tutors.deleteCredential(credentialId);
        const marked: StoredFile[] = [];
        for (const fileId of fileIds) {
          const file = await files.markDeleted(manager, fileId);
          if (file) marked.push(file);
        }
        return marked;
      });
      await Promise.all(deleted.map((file) => files.purgeObject(file)));
    },

    /**
     * Hồ sơ công khai (khách xem được, C8). Gia sư chưa xác minh, bị khóa, bị hạn chế hoặc đã xóa: 404.
     * Bằng cấp bị từ chối không hiện; đang chờ duyệt hiện như tự khai.
     */
    async getPublic(tutorId: string): Promise<PublicTutorProfile> {
      const tutors = repo();
      const row = await tutors.findPublic(tutorId);
      if (!row) throw notFound('Tutor');
      const [items, credentials] = await Promise.all([
        tutors.items(tutorId),
        tutors.listCredentials(tutorId),
      ]);
      const { profile } = row;
      return {
        ...profileFields(profile, items),
        id: tutorId,
        displayName: row.displayName,
        avatarUrl: row.avatarStorageKey ? deps.publicFileUrl(row.avatarStorageKey) : null,
        identityVerified: true,
        credentials: credentials
          .filter((c) => c.verificationStatus !== 'rejected')
          .map((c) => ({
            kind: c.kind,
            title: c.title,
            issuer: c.issuer,
            issuedYear: c.issuedYear,
            verified: c.verificationStatus === 'verified',
          })),
        ratingAvg: profile.ratingAvg === null ? null : Number(profile.ratingAvg),
        ratingCount: profile.ratingCount,
      };
    },
  };
}

export type TutorsService = ReturnType<typeof createTutorsService>;
