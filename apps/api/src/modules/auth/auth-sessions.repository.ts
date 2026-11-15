import type { AuthSessionRevokeReason } from '@tps/shared';
import { type EntityManager, IsNull } from 'typeorm';
import { AuthSession } from './auth-session.entity.js';

/** Truy cập `auth_sessions` (chuỗi refresh token xoay vòng). */
export function createAuthSessionsRepository(manager: EntityManager) {
  const sessions = manager.getRepository(AuthSession);

  return {
    create(data: {
      userId: string;
      familyId: string;
      refreshTokenHash: string;
      userAgent: string | null;
      ipAddress: string | null;
      expiresAt: Date;
      rememberMe: boolean;
    }): Promise<AuthSession> {
      return sessions.save(sessions.create(data));
    },

    findByTokenHash(refreshTokenHash: string): Promise<AuthSession | null> {
      return sessions.findOneBy({ refreshTokenHash });
    },

    /**
     * Đánh dấu token đã được đổi sang token mới. Trả false nếu token đã bị đổi/thu hồi trước đó
     * (hai request làm mới cùng lúc: chỉ một bên thắng).
     */
    async markRotated(id: string): Promise<boolean> {
      const result = await sessions.update(
        { id, rotatedAt: IsNull(), revokedAt: IsNull() },
        { rotatedAt: new Date() },
      );
      return (result.affected ?? 0) > 0;
    },

    async revokeFamily(familyId: string, reason: AuthSessionRevokeReason): Promise<void> {
      await sessions.update(
        { familyId, revokedAt: IsNull() },
        { revokedAt: new Date(), revokeReason: reason },
      );
    },

    /**
     * Các chuỗi phiên còn dùng được của một người: mỗi chuỗi lấy token mới nhất (chưa đổi, chưa thu hồi,
     * chưa hết hạn). `createdAt` của token đó là lần cuối phiên được làm mới.
     */
    listActive(userId: string, now: Date): Promise<AuthSession[]> {
      return sessions
        .createQueryBuilder('s')
        .where('s.userId = :userId', { userId })
        .andWhere('s.revokedAt IS NULL')
        .andWhere('s.rotatedAt IS NULL')
        .andWhere('s.expiresAt > :now', { now })
        .orderBy('s.createdAt', 'DESC')
        .getMany();
    },

    /** Thu hồi mọi chuỗi phiên của một người, trừ chuỗi `keepFamilyId` (thiết bị đang dùng). */
    async revokeAllForUserExcept(
      userId: string,
      keepFamilyId: string,
      reason: AuthSessionRevokeReason,
    ): Promise<void> {
      await sessions
        .createQueryBuilder()
        .update()
        .set({ revokedAt: () => 'now()', revokeReason: reason })
        .where('user_id = :userId', { userId })
        .andWhere('family_id <> :keepFamilyId', { keepFamilyId })
        .andWhere('revoked_at IS NULL')
        .execute();
    },

    /** Thu hồi mọi phiên của một người (đổi mật khẩu, bị khóa). */
    async revokeAllForUser(userId: string, reason: AuthSessionRevokeReason): Promise<void> {
      await sessions.update(
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date(), revokeReason: reason },
      );
    },
  };
}

export type AuthSessionsRepository = ReturnType<typeof createAuthSessionsRepository>;
