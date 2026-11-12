// TẠM THỜI, chỉ cho môi trường dev: chọn vai trò để xem layout khi CHƯA có đăng nhập.
// G2 thay toàn bộ tệp này bằng phiên đăng nhập thật (requireUser + quyền theo vai trò).
// Ở production: không đọc cookie, mọi route cần vai trò trả 404.
import { Role } from '@tps/shared';
import { createCookie, data } from 'react-router';

const devRoleCookie = createCookie('tps_dev_role', { path: '/', sameSite: 'lax', httpOnly: true });

export const isDevRoleEnabled = (): boolean => import.meta.env.DEV;

export async function readDevRole(request: Request): Promise<Role | null> {
  if (!isDevRoleEnabled()) return null;
  const parsed = Role.safeParse(await devRoleCookie.parse(request.headers.get('Cookie')));
  return parsed.success ? parsed.data : null;
}

export function serializeDevRole(role: Role): Promise<string> {
  return devRoleCookie.serialize(role);
}

/**
 * Vai trò để render khu vực `allowed`. Chưa chọn hoặc chọn vai trò khác khu vực: dùng vai trò đầu tiên
 * của khu vực, để /app và /admin xem được ngay.
 */
export async function requireRole<const R extends Role>(
  request: Request,
  allowed: readonly R[],
): Promise<R> {
  if (!isDevRoleEnabled()) {
    throw data(null, { status: 404 });
  }
  const role = await readDevRole(request);
  const fallback = allowed[0];
  if (!fallback) throw new Error('requireRole needs at least one role');
  return role && (allowed as readonly Role[]).includes(role) ? (role as R) : fallback;
}
