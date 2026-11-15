// Cấp và thu hồi vai trò vận hành (Manager, Admin) từ dòng lệnh: cách tạo Admin đầu tiên của hệ thống.
// Tài khoản mới tạo KHÔNG có mật khẩu: người được cấp tự đặt bằng "Quên mật khẩu" (mã OTP gửi tới email),
// nên không có mật khẩu nào đi qua terminal, lịch sử lệnh hay chat. Đặt mật khẩu xong thì email cũng
// được xác thực.
import type { Role } from '@tps/shared';
import { type DataSource, IsNull } from 'typeorm';
import { AppError } from '../../lib/app-error.js';
import { UserRole } from './user-role.entity.js';
import { createUsersRepository } from './users.repository.js';

export type StaffRole = Extract<Role, 'manager' | 'admin'>;

export interface GrantStaffResult {
  userId: string;
  /** Tạo tài khoản mới (chưa có mật khẩu). */
  created: boolean;
  /** Đã có vai trò này từ trước. */
  alreadyGranted: boolean;
}

export async function grantStaffRole(
  dataSource: DataSource,
  input: { email: string; fullName?: string | undefined; role: StaffRole },
): Promise<GrantStaffResult> {
  return dataSource.transaction(async (manager) => {
    const repo = createUsersRepository(manager);
    let user = await repo.findByEmail(input.email);
    const created = !user;
    if (!user) {
      if (!input.fullName) {
        throw new AppError('bad_request', 'New account needs a name (--name)');
      }
      user = await repo.create({
        email: input.email,
        passwordHash: null,
        fullName: input.fullName,
        displayName: input.fullName,
        phone: null,
        locale: 'vi',
      });
    }
    const alreadyGranted = (await repo.activeRoles(user.id)).includes(input.role);
    if (!alreadyGranted) await repo.grantRole(user.id, input.role);
    return { userId: user.id, created, alreadyGranted };
  });
}

/**
 * Thu hồi vai trò vận hành. Không cho thu hồi Admin cuối cùng đang hoạt động: hệ thống phải luôn còn
 * người quản trị.
 */
export async function revokeStaffRole(
  dataSource: DataSource,
  input: { email: string; role: StaffRole },
): Promise<{ revoked: boolean }> {
  return dataSource.transaction(async (manager) => {
    const repo = createUsersRepository(manager);
    const user = await repo.findByEmail(input.email);
    if (!user) throw new AppError('not_found', 'No account with this email');

    const userRoles = manager.getRepository(UserRole);
    const grant = await userRoles.findOneBy({
      userId: user.id,
      roleCode: input.role,
      revokedAt: IsNull(),
    });
    if (!grant) return { revoked: false };

    if (input.role === 'admin') {
      // Khóa các dòng Admin đang hiệu lực để hai lệnh thu hồi chạy cùng lúc không cùng lọt qua.
      const admins = await userRoles
        .createQueryBuilder('r')
        .innerJoin('users', 'u', 'u.id = r.user_id AND u.deleted_at IS NULL')
        .where('r.role_code = :role', { role: 'admin' })
        .andWhere('r.revoked_at IS NULL')
        .setLock('pessimistic_write', undefined, ['r'])
        .getMany();
      if (admins.length <= 1) {
        throw new AppError('conflict', 'Cannot revoke the last admin');
      }
    }
    await userRoles.update({ id: grant.id }, { revokedAt: new Date() });
    return { revoked: true };
  });
}
