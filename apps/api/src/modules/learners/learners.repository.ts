import type { GuardianRelationship } from '@tps/shared';
import { type EntityManager, IsNull } from 'typeorm';
import { LearnerGuardian } from './learner-guardian.entity.js';
import { Learner } from './learner.entity.js';

/** Các cột hồ sơ con phụ huynh được ghi. */
export type LearnerData = Pick<
  Learner,
  | 'fullName'
  | 'nickname'
  | 'dateOfBirth'
  | 'gradeLevelId'
  | 'schoolName'
  | 'provinceId'
  | 'communeId'
  | 'addressLine'
  | 'notes'
>;

/** Hồ sơ kèm quan hệ của phụ huynh đang quản lý (null nếu hồ sơ tự quản lý). */
export interface LearnerWithGuardian {
  learner: Learner;
  relationship: GuardianRelationship | null;
}

/**
 * Truy cập `learners` và `learner_guardians`. KHÔNG kiểm tra quyền: service gọi learner-access trước.
 * Mọi truy vấn chỉ lấy hồ sơ chưa xóa (`deleted_at IS NULL`).
 */
export function createLearnersRepository(manager: EntityManager) {
  const learners = manager.getRepository(Learner);
  const guardians = manager.getRepository(LearnerGuardian);

  return {
    findActive(id: string, options: { lock?: boolean } = {}): Promise<Learner | null> {
      const query = learners
        .createQueryBuilder('l')
        .where('l.id = :id', { id })
        .andWhere('l.deletedAt IS NULL');
      if (options.lock) query.setLock('pessimistic_write');
      return query.getOne();
    },

    /** Phụ huynh đang quản lý hồ sơ (C9: tối đa một). */
    activeGuardian(learnerId: string): Promise<LearnerGuardian | null> {
      return guardians.findOneBy({ learnerId, endedAt: IsNull() });
    },

    /** "Con của tôi": hồ sơ chưa xóa mà người dùng đang quản lý, cũ trước mới sau. */
    async listForGuardian(guardianUserId: string): Promise<LearnerWithGuardian[]> {
      const rows = await learners
        .createQueryBuilder('l')
        .innerJoin(
          LearnerGuardian,
          'g',
          'g.learnerId = l.id AND g.endedAt IS NULL AND g.guardianUserId = :guardianUserId',
          { guardianUserId },
        )
        .addSelect('g.relationship', 'relationship')
        .where('l.deletedAt IS NULL')
        .orderBy('l.createdAt', 'ASC')
        .getRawAndEntities<{ relationship: GuardianRelationship }>();
      return rows.entities.map((learner, index) => ({
        learner,
        relationship: rows.raw[index]?.relationship ?? null,
      }));
    },

    /** Hồ sơ gắn với tài khoản học sinh này (nếu có). */
    findByAccount(accountUserId: string): Promise<Learner | null> {
      return learners.findOneBy({ accountUserId, deletedAt: IsNull() });
    },

    create(data: LearnerData & { createdBy: string }): Promise<Learner> {
      return learners.save(learners.create(data));
    },

    async addGuardian(
      learnerId: string,
      guardianUserId: string,
      relationship: GuardianRelationship,
    ): Promise<void> {
      await guardians.insert({ learnerId, guardianUserId, relationship });
    },

    async update(id: string, data: Partial<LearnerData>): Promise<void> {
      await learners.update({ id, deletedAt: IsNull() }, data);
    },

    async setRelationship(
      learnerId: string,
      guardianUserId: string,
      relationship: GuardianRelationship,
    ): Promise<void> {
      await guardians.update({ learnerId, guardianUserId, endedAt: IsNull() }, { relationship });
    },

    async softDelete(id: string): Promise<void> {
      await learners.update({ id, deletedAt: IsNull() }, { deletedAt: () => 'now()' });
    },

    /** Gắn tài khoản học sinh. False nếu hồ sơ đã có tài khoản hoặc đã xóa. */
    async linkAccount(learnerId: string, accountUserId: string): Promise<boolean> {
      const result = await learners.update(
        { id: learnerId, accountUserId: IsNull(), deletedAt: IsNull() },
        { accountUserId },
      );
      return (result.affected ?? 0) > 0;
    },
  };
}

export type LearnersRepository = ReturnType<typeof createLearnersRepository>;
