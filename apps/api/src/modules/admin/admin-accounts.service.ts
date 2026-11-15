// Quản lý tài khoản của Admin (G3 đợt 3; C1, B.9.3): tìm tài khoản, khóa / mở khóa kèm lý do, gán và gỡ vai trò
// Manager. Mọi thay đổi ghi nhật ký kiểm toán trong cùng transaction. Không phụ thuộc Express.
//   - Khóa: `users.status = 'locked'`, một dòng `account_sanctions` (lý do), thu hồi mọi phiên đăng nhập (người
//     bị khóa bị đăng xuất ngay; `authenticate` cũng chặn tài khoản bị khóa ở mỗi request).
//   - Không khóa chính mình, không khóa Admin (Admin chỉ gỡ được bằng dòng lệnh, để luôn còn người quản trị).
//   - Vai trò Admin chỉ cấp bằng dòng lệnh (`npm run users:staff`); giao diện chỉ gán / gỡ Manager.
import type {
  AdminAccountDetail,
  AdminAccountList,
  AdminAccountsQuery,
  GrantManagerRequest,
  Role,
  UserStatus,
} from '@tps/shared';
import { ADMIN_PAGE_SIZE } from '@tps/shared';
import { type DataSource, type EntityManager, IsNull } from 'typeorm';
import { AppError, conflict, forbidden, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import { createAuditRepository } from '../audit/audit.repository.js';
import { createAuthSessionsRepository } from '../auth/auth-sessions.repository.js';
import { AccountSanction } from '../users/account-sanction.entity.js';
import { UserRole } from '../users/user-role.entity.js';
import { User } from '../users/user.entity.js';
import { createUsersRepository } from '../users/users.repository.js';

/** Người thực hiện và ngữ cảnh request, để ghi nhật ký. */
export interface AdminActor {
  userId: string;
  ipAddress: string | null;
}

interface AccountRow {
  id: string;
  display_name: string;
  full_name: string | null;
  email: string | null;
  roles: Role[];
  status: UserStatus;
  deleted: boolean;
  created_at: Date;
  total?: number;
}

/** `%`, `_`, `\` trong chuỗi tìm là ký tự thường, không phải ký tự đại diện của LIKE. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

const ROLES_SQL = `coalesce((SELECT array_agg(r.role_code ORDER BY r.role_code) FROM user_roles r
                     WHERE r.user_id = u.id AND r.revoked_at IS NULL), '{}')`;

const toSummary = (r: AccountRow) => ({
  id: r.id,
  displayName: r.display_name,
  fullName: r.full_name,
  email: r.email,
  roles: r.roles,
  status: r.status,
  deleted: r.deleted,
  createdAt: r.created_at.toISOString(),
});

export function createAdminAccountsService(deps: { dataSource: DataSource; logger: Logger }) {
  const { dataSource, logger } = deps;

  async function detail(actor: AdminActor, userId: string): Promise<AdminAccountDetail> {
    const [row] = await dataSource.query<(AccountRow & { email_verified: boolean })[]>(
      `SELECT u.id, u.display_name, u.full_name, u.email, ${ROLES_SQL} AS roles, u.status,
              u.deleted_at IS NOT NULL AS deleted, u.created_at,
              u.email_verified_at IS NOT NULL AS email_verified
         FROM users u WHERE u.id = $1`,
      [userId],
    );
    if (!row) throw notFound('Account');
    const [lock] = await dataSource.query<
      { reason: string; created_at: Date; locked_by: string | null }[]
    >(
      `SELECT s.reason, s.created_at, coalesce(b.full_name, b.display_name) AS locked_by
         FROM account_sanctions s LEFT JOIN users b ON b.id = s.created_by
        WHERE s.user_id = $1 AND s.type = 'lock' AND s.lifted_at IS NULL`,
      [userId],
    );
    return {
      ...toSummary(row),
      emailVerified: row.email_verified,
      lock: lock
        ? {
            reason: lock.reason,
            lockedAt: lock.created_at.toISOString(),
            lockedByName: lock.locked_by,
          }
        : null,
      canLock: row.id !== actor.userId && !row.roles.includes('admin') && !row.deleted,
    };
  }

  /** Khóa dòng tài khoản để thay đổi; kiểm tra Admin được làm với tài khoản này. */
  async function lockTarget(
    manager: EntityManager,
    actor: AdminActor,
    userId: string,
  ): Promise<User> {
    const user = await manager
      .getRepository(User)
      .createQueryBuilder('u')
      .where('u.id = :userId', { userId })
      .setLock('pessimistic_write')
      .getOne();
    if (!user) throw notFound('Account');
    if (user.id === actor.userId) throw forbidden('Cannot lock or unlock your own account');
    if (user.deletedAt) throw conflict('Account is deleted');
    const roles = await createUsersRepository(manager).activeRoles(userId);
    if (roles.includes('admin'))
      throw forbidden('Admin accounts are managed from the command line');
    return user;
  }

  return {
    async list(query: AdminAccountsQuery): Promise<AdminAccountList> {
      const where: string[] = [];
      const params: unknown[] = [];
      const param = (value: unknown) => {
        params.push(value);
        return `$${params.length}`;
      };
      if (query.q) {
        where.push(
          `immutable_unaccent(lower(u.display_name || ' ' || coalesce(u.full_name, '') || ' ' || coalesce(u.email, '')))
             LIKE '%' || immutable_unaccent(lower(${param(escapeLike(query.q))})) || '%'`,
        );
      }
      if (query.role) {
        where.push(
          `EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.revoked_at IS NULL
                     AND r.role_code = ${param(query.role)})`,
        );
      }
      if (query.status === 'deleted') where.push('u.deleted_at IS NOT NULL');
      else if (query.status)
        where.push(`u.deleted_at IS NULL AND u.status = ${param(query.status)}`);
      const limit = param(ADMIN_PAGE_SIZE);
      const offset = param((query.page - 1) * ADMIN_PAGE_SIZE);
      const rows = await dataSource.query<AccountRow[]>(
        `SELECT u.id, u.display_name, u.full_name, u.email, ${ROLES_SQL} AS roles, u.status,
                u.deleted_at IS NOT NULL AS deleted, u.created_at, count(*) OVER ()::int AS total
           FROM users u
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY u.created_at DESC, u.id DESC
          LIMIT ${limit} OFFSET ${offset}`,
        params,
      );
      let total = rows[0]?.total ?? 0;
      if (rows.length === 0 && query.page > 1) {
        // Trang vượt quá cuối: đếm riêng để giao diện vẫn biết tổng.
        const [count] = await dataSource.query<{ total: number }[]>(
          `SELECT count(*)::int AS total FROM users u ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
          params.slice(0, -2),
        );
        total = count?.total ?? 0;
      }
      return { items: rows.map(toSummary), page: query.page, pageSize: ADMIN_PAGE_SIZE, total };
    },

    detail,

    /** Khóa tài khoản kèm lý do (B.9.3). Đã khóa: 409. */
    async lock(actor: AdminActor, userId: string, reason: string): Promise<AdminAccountDetail> {
      await dataSource.transaction(async (manager) => {
        const user = await lockTarget(manager, actor, userId);
        if (user.status === 'locked') throw conflict('Account is already locked');
        await manager.getRepository(User).update({ id: userId }, { status: 'locked' });
        const sanction = await manager.getRepository(AccountSanction).save(
          manager.getRepository(AccountSanction).create({
            userId,
            type: 'lock',
            reason,
            createdBy: actor.userId,
          }),
        );
        await createAuthSessionsRepository(manager).revokeAllForUser(userId, 'account_locked');
        await createAuditRepository(manager).record({
          actorUserId: actor.userId,
          actorRole: 'admin',
          action: 'account.locked',
          entityType: 'user',
          entityId: userId,
          metadata: { sanctionId: sanction.id, previousStatus: user.status },
          ipAddress: actor.ipAddress,
        });
      });
      logger.info({ userId, adminId: actor.userId }, 'Account locked');
      return detail(actor, userId);
    },

    /** Mở khóa: kết thúc lần khóa đang hiệu lực, tài khoản về `active`. Không bị khóa: 409. */
    async unlock(actor: AdminActor, userId: string): Promise<AdminAccountDetail> {
      await dataSource.transaction(async (manager) => {
        const user = await lockTarget(manager, actor, userId);
        if (user.status !== 'locked') throw conflict('Account is not locked');
        await manager
          .getRepository(AccountSanction)
          .update(
            { userId, type: 'lock', liftedAt: IsNull() },
            { liftedAt: new Date(), liftedBy: actor.userId },
          );
        await manager.getRepository(User).update({ id: userId }, { status: 'active' });
        await createAuditRepository(manager).record({
          actorUserId: actor.userId,
          actorRole: 'admin',
          action: 'account.unlocked',
          entityType: 'user',
          entityId: userId,
          ipAddress: actor.ipAddress,
        });
      });
      logger.info({ userId, adminId: actor.userId }, 'Account unlocked');
      return detail(actor, userId);
    },

    /**
     * Gán vai trò Manager theo email. Email chưa có tài khoản: tạo tài khoản không mật khẩu (cần họ tên), người
     * được cấp đặt mật khẩu bằng "Quên mật khẩu". Đã là Manager: 409.
     */
    async grantManager(
      actor: AdminActor,
      input: GrantManagerRequest,
    ): Promise<{ account: AdminAccountDetail; created: boolean }> {
      const { userId, created } = await dataSource.transaction(async (manager) => {
        const users = createUsersRepository(manager);
        let user = await users.findByEmail(input.email);
        const isNew = !user;
        if (!user) {
          if (!input.fullName) {
            throw new AppError('validation_failed', 'A new account needs a full name', [
              { path: 'fullName', code: 'required', message: 'Required for a new account' },
            ]);
          }
          user = await users.create({
            email: input.email,
            passwordHash: null,
            fullName: input.fullName,
            displayName: input.fullName,
            phone: null,
            locale: 'vi',
          });
        } else if ((await users.activeRoles(user.id)).includes('manager')) {
          throw conflict('Account is already a manager');
        }
        await users.grantRole(user.id, 'manager', actor.userId);
        await createAuditRepository(manager).record({
          actorUserId: actor.userId,
          actorRole: 'admin',
          action: 'role.granted',
          entityType: 'user',
          entityId: user.id,
          metadata: { role: 'manager', accountCreated: isNew },
          ipAddress: actor.ipAddress,
        });
        return { userId: user.id, created: isNew };
      });
      logger.info({ userId, adminId: actor.userId, created }, 'Manager role granted');
      return { account: await detail(actor, userId), created };
    },

    /** Gỡ vai trò Manager. Không có vai trò này: 404. */
    async revokeManager(actor: AdminActor, userId: string): Promise<AdminAccountDetail> {
      await dataSource.transaction(async (manager) => {
        const result = await manager
          .getRepository(UserRole)
          .update(
            { userId, roleCode: 'manager', revokedAt: IsNull() },
            { revokedAt: new Date(), revokedBy: actor.userId },
          );
        if (!result.affected) throw notFound('Manager role');
        await createAuditRepository(manager).record({
          actorUserId: actor.userId,
          actorRole: 'admin',
          action: 'role.revoked',
          entityType: 'user',
          entityId: userId,
          metadata: { role: 'manager' },
          ipAddress: actor.ipAddress,
        });
      });
      logger.info({ userId, adminId: actor.userId }, 'Manager role revoked');
      return detail(actor, userId);
    },
  };
}

export type AdminAccountsService = ReturnType<typeof createAdminAccountsService>;
