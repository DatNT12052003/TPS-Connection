import type { ConsentType, Locale, Role } from '@tps/shared';
import { type EntityManager, IsNull } from 'typeorm';
import { UserConsent } from './user-consent.entity.js';
import { UserRole } from './user-role.entity.js';
import { User } from './user.entity.js';

/** Người dùng kèm các vai trò đang hiệu lực. */
export interface UserWithRoles {
  user: User;
  roles: Role[];
}

/**
 * Truy cập bảng `users`, `user_roles`, `user_consents`. Nhận EntityManager để chạy được trong transaction
 * của service. Mọi truy vấn theo email đều lọc `deleted_at IS NULL` (khớp partial index `users_email_uq`).
 */
export function createUsersRepository(manager: EntityManager) {
  const users = manager.getRepository(User);
  const userRoles = manager.getRepository(UserRole);
  const consents = manager.getRepository(UserConsent);

  return {
    /** Tài khoản chưa xóa theo email. `withPassword` mới tải `password_hash`. */
    findByEmail(email: string, options: { withPassword?: boolean } = {}): Promise<User | null> {
      const query = users
        .createQueryBuilder('u')
        .where('u.email = :email', { email })
        .andWhere('u.deletedAt IS NULL');
      if (options.withPassword) query.addSelect('u.passwordHash');
      return query.getOne();
    },

    /** Tài khoản chưa xóa theo id, kèm `password_hash` (để kiểm tra mật khẩu hiện tại). */
    findByIdWithPassword(id: string): Promise<User | null> {
      return users
        .createQueryBuilder('u')
        .addSelect('u.passwordHash')
        .where('u.id = :id', { id })
        .andWhere('u.deletedAt IS NULL')
        .getOne();
    },

    findById(id: string): Promise<User | null> {
      return users.findOneBy({ id, deletedAt: IsNull() });
    },

    async findWithRoles(id: string): Promise<UserWithRoles | null> {
      const user = await users.findOneBy({ id, deletedAt: IsNull() });
      if (!user) return null;
      return { user, roles: await this.activeRoles(id) };
    },

    async activeRoles(userId: string): Promise<Role[]> {
      const rows = await userRoles.find({
        select: { roleCode: true },
        where: { userId, revokedAt: IsNull() },
        order: { roleCode: 'ASC' },
      });
      return rows.map((r) => r.roleCode);
    },

    create(data: {
      email: string;
      passwordHash: string | null;
      fullName: string;
      displayName: string;
      phone: string | null;
      locale: Locale;
    }): Promise<User> {
      return users.save(users.create(data));
    },

    async updatePendingRegistration(
      id: string,
      data: {
        passwordHash: string;
        fullName: string;
        displayName: string;
        phone: string | null;
        locale: Locale;
      },
    ): Promise<void> {
      await users.update({ id }, data);
    },

    /** Cấp vai trò (tự đăng ký: `grantedBy` null) nếu chưa có. */
    async grantRole(
      userId: string,
      roleCode: Role,
      grantedBy: string | null = null,
    ): Promise<void> {
      await userRoles
        .createQueryBuilder()
        .insert()
        .values({ userId, roleCode, grantedBy })
        .orIgnore() // ON CONFLICT DO NOTHING: đã có vai trò đang hiệu lực
        .execute();
    },

    /** Thu hồi các vai trò tự đăng ký khác `keep` (người đăng ký lại đổi ý chọn vai trò khác). */
    async revokeOtherSelfRegisteredRoles(userId: string, keep: Role): Promise<void> {
      await userRoles
        .createQueryBuilder()
        .update()
        .set({ revokedAt: () => 'now()' })
        .where('user_id = :userId', { userId })
        .andWhere('role_code <> :keep', { keep })
        .andWhere('granted_by IS NULL')
        .andWhere('revoked_at IS NULL')
        .execute();
    },

    async recordConsents(
      userId: string,
      types: ConsentType[],
      version: string,
      ipAddress: string | null,
    ): Promise<void> {
      await consents.insert(
        types.map((consentType) => ({ userId, consentType, version, ipAddress })),
      );
    },

    async markEmailVerified(id: string): Promise<void> {
      await users.update({ id, emailVerifiedAt: IsNull() }, { emailVerifiedAt: new Date() });
    },

    async setPassword(id: string, passwordHash: string): Promise<void> {
      await users.update({ id }, { passwordHash });
    },

    async recordLogin(id: string): Promise<void> {
      await users.update({ id }, { lastLoginAt: new Date() });
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
