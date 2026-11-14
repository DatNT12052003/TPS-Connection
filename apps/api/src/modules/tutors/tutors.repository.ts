import type { AvailabilitySlot, TeachingSubject } from '@tps/shared';
import type { EntityManager } from 'typeorm';
import { TutorCredential } from './tutor-credential.entity.js';
import {
  TutorAvailabilitySlot,
  TutorServiceArea,
  TutorTeachingSubject,
} from './tutor-profile-items.entity.js';
import { TutorProfile } from './tutor-profile.entity.js';

/** Các cột hồ sơ gia sư tự khai mà gia sư được ghi. */
export type TutorProfileData = Pick<
  TutorProfile,
  | 'headline'
  | 'bio'
  | 'occupation'
  | 'institution'
  | 'major'
  | 'highestEducation'
  | 'experienceYears'
  | 'teachingMethod'
  | 'achievements'
  | 'introVideoUrl'
  | 'teachesOnline'
  | 'teachesInPerson'
  | 'rateAmountVnd'
  | 'rateUnit'
  | 'acceptingStudents'
>;

export interface TutorProfileItems {
  teachingSubjects: TeachingSubject[];
  serviceAreaIds: number[];
  availability: AvailabilitySlot[];
}

/** Hồ sơ công khai kèm thông tin hiển thị từ `users` và `files`. */
export interface PublicTutorRow {
  profile: TutorProfile;
  displayName: string;
  avatarStorageKey: string | null;
}

/** "19:30:00" -> "19:30". */
const hhmm = (time: string) => time.slice(0, 5);

/** Truy cập hồ sơ gia sư và các bảng con. Không kiểm tra quyền (service làm). */
export function createTutorsRepository(manager: EntityManager) {
  const profiles = manager.getRepository(TutorProfile);
  const subjects = manager.getRepository(TutorTeachingSubject);
  const areas = manager.getRepository(TutorServiceArea);
  const slots = manager.getRepository(TutorAvailabilitySlot);
  const credentials = manager.getRepository(TutorCredential);

  return {
    /** Hồ sơ của gia sư; tạo hồ sơ trống (`incomplete`) nếu chưa có. */
    async ensureProfile(userId: string): Promise<TutorProfile> {
      await profiles.createQueryBuilder().insert().values({ userId }).orIgnore().execute();
      return profiles.findOneByOrFail({ userId });
    },

    findProfile(userId: string, options: { lock?: boolean } = {}): Promise<TutorProfile | null> {
      const query = profiles.createQueryBuilder('p').where('p.userId = :userId', { userId });
      if (options.lock) query.setLock('pessimistic_write');
      return query.getOne();
    },

    async updateProfile(userId: string, data: TutorProfileData): Promise<void> {
      await profiles.update({ userId }, data);
    },

    async items(tutorId: string): Promise<TutorProfileItems> {
      const [subjectRows, areaRows, slotRows] = await Promise.all([
        subjects.find({ where: { tutorId }, order: { subjectId: 'ASC', gradeLevelId: 'ASC' } }),
        areas.find({ where: { tutorId }, order: { areaId: 'ASC' } }),
        slots.find({ where: { tutorId }, order: { weekday: 'ASC', startTime: 'ASC' } }),
      ]);
      return {
        teachingSubjects: subjectRows.map(({ subjectId, gradeLevelId }) => ({
          subjectId,
          gradeLevelId,
        })),
        serviceAreaIds: areaRows.map((a) => a.areaId),
        availability: slotRows.map((s) => ({
          weekday: s.weekday,
          startTime: hhmm(s.startTime),
          endTime: hhmm(s.endTime),
        })),
      };
    },

    /** Thay toàn bộ môn – khối, khu vực, lịch rảnh (gọi trong transaction). */
    async replaceItems(tutorId: string, items: TutorProfileItems): Promise<void> {
      await subjects.delete({ tutorId });
      await areas.delete({ tutorId });
      await slots.delete({ tutorId });
      if (items.teachingSubjects.length > 0) {
        await subjects.insert(items.teachingSubjects.map((s) => ({ tutorId, ...s })));
      }
      if (items.serviceAreaIds.length > 0) {
        await areas.insert(items.serviceAreaIds.map((areaId) => ({ tutorId, areaId })));
      }
      if (items.availability.length > 0) {
        await slots.insert(items.availability.map((s) => ({ tutorId, ...s })));
      }
    },

    listCredentials(tutorId: string): Promise<TutorCredential[]> {
      return credentials.find({ where: { tutorId }, order: { createdAt: 'ASC' } });
    },

    countCredentials(tutorId: string): Promise<number> {
      return credentials.countBy({ tutorId });
    },

    /** Bằng cấp của đúng gia sư này (không tìm theo id trần: tránh sửa bằng cấp của người khác). */
    findCredential(tutorId: string, id: string): Promise<TutorCredential | null> {
      return credentials.findOneBy({ id, tutorId });
    },

    createCredential(
      data: Pick<TutorCredential, 'tutorId' | 'kind' | 'title' | 'issuer' | 'issuedYear'>,
    ): Promise<TutorCredential> {
      return credentials.save(credentials.create(data));
    },

    async updateCredential(
      id: string,
      data: Partial<
        Pick<TutorCredential, 'kind' | 'title' | 'issuer' | 'issuedYear' | 'verificationStatus'>
      >,
    ): Promise<void> {
      await credentials.update({ id }, data);
    },

    async deleteCredential(id: string): Promise<void> {
      await credentials.delete({ id });
    },

    /**
     * Hồ sơ hiển thị công khai (D5, C8): đã xác minh danh tính, tài khoản đang hoạt động, chưa xóa.
     * Chỉ đọc tên hiển thị và ảnh đại diện từ `users`; không đọc email, số điện thoại, họ tên thật.
     */
    async findPublic(tutorId: string): Promise<PublicTutorRow | null> {
      const result = await profiles
        .createQueryBuilder('p')
        .innerJoin('users', 'u', 'u.id = p.user_id')
        .leftJoin('files', 'f', `f.id = u.avatar_file_id AND f.status = 'ready'`)
        .addSelect('u.display_name', 'display_name')
        .addSelect('f.storage_key', 'avatar_storage_key')
        .where('p.userId = :tutorId', { tutorId })
        .andWhere(`p.profileStatus = 'verified'`)
        .andWhere(`u.status = 'active'`)
        .andWhere('u.deleted_at IS NULL')
        .getRawAndEntities<{ display_name: string; avatar_storage_key: string | null }>();
      const profile = result.entities[0];
      const raw = result.raw[0];
      if (!profile || !raw) return null;
      return {
        profile,
        displayName: raw.display_name,
        avatarStorageKey: raw.avatar_storage_key,
      };
    },
  };
}

export type TutorsRepository = ReturnType<typeof createTutorsRepository>;
