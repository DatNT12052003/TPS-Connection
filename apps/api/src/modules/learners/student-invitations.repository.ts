import { type EntityManager, In, IsNull, MoreThan } from 'typeorm';
import { StudentInvitation } from './student-invitation.entity.js';

/** Truy cập `student_invitations`. Không kiểm tra quyền (service làm). */
export function createStudentInvitationsRepository(manager: EntityManager) {
  const invitations = manager.getRepository(StudentInvitation);

  return {
    /** Hủy lời mời đang mở (chưa nhận, chưa hủy) của hồ sơ, kể cả lời mời đã quá hạn. */
    async revokeOpen(learnerId: string): Promise<number> {
      const result = await invitations.update(
        { learnerId, acceptedAt: IsNull(), revokedAt: IsNull() },
        { revokedAt: () => 'now()' },
      );
      return result.affected ?? 0;
    },

    create(data: {
      learnerId: string;
      email: string;
      tokenHash: string;
      invitedBy: string;
      expiresAt: Date;
    }): Promise<StudentInvitation> {
      return invitations.save(invitations.create(data));
    },

    /** Lời mời còn dùng được (chưa nhận, chưa hủy, chưa hết hạn) của các hồ sơ. */
    findPendingFor(learnerIds: string[], now: Date): Promise<StudentInvitation[]> {
      if (learnerIds.length === 0) return Promise.resolve([]);
      return invitations.findBy({
        learnerId: In(learnerIds),
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
        expiresAt: MoreThan(now),
      });
    },

    /** Tìm theo hash của token. `lock`: khóa dòng tới hết transaction (nhận lời mời đúng một lần). */
    findByTokenHash(
      tokenHash: string,
      options: { lock?: boolean } = {},
    ): Promise<StudentInvitation | null> {
      const query = invitations
        .createQueryBuilder('i')
        .where('i.tokenHash = :tokenHash', { tokenHash });
      if (options.lock) query.setLock('pessimistic_write');
      return query.getOne();
    },

    async markAccepted(id: string): Promise<boolean> {
      const result = await invitations.update(
        { id, acceptedAt: IsNull(), revokedAt: IsNull() },
        { acceptedAt: () => 'now()' },
      );
      return (result.affected ?? 0) > 0;
    },
  };
}

export type StudentInvitationsRepository = ReturnType<typeof createStudentInvitationsRepository>;
