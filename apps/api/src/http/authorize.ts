// Phân quyền theo vai trò và trạng thái tài khoản. Đặt SAU middleware authenticate.
// Mặc định từ chối: không có req.auth (quên gắn authenticate, hoặc chưa đăng nhập) thì 401.
// Quyền theo quan hệ (phụ huynh – con, gia sư – lớp) kiểm tra ở tầng service, không ở đây.
import { type Role, STAFF_ROLES } from '@tps/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/app-error.js';
import type { AuthContext } from './authenticate.js';

/** Lấy người dùng đã xác thực; ném 401 nếu không có. Dùng trong controller cho route cần đăng nhập. */
export function requireAuth(req: { auth?: AuthContext | undefined }): AuthContext {
  if (!req.auth) throw new AppError('unauthenticated', 'Not signed in');
  return req.auth;
}

/** Cho qua nếu người dùng có ÍT NHẤT MỘT trong các vai trò. */
export function requireRole(...roles: [Role, ...Role[]]): RequestHandler {
  return (req, _res, next) => {
    const { user } = requireAuth(req);
    if (!user.roles.some((role) => roles.includes(role))) {
      throw new AppError('forbidden', `Requires role: ${roles.join(' or ')}`);
    }
    next();
  };
}

/** Khu vực vận hành (/admin): Manager hoặc Admin. */
export const requireStaff = (): RequestHandler => requireRole(...STAFF_ROLES);

/**
 * Hành động tài khoản bị hạn chế không được làm (B.9.3): đăng bài, gửi yêu cầu kết nối, nhắn tin mới.
 * Tài khoản bị khóa đã bị authenticate chặn từ trước.
 */
export function requireActiveAccount(): RequestHandler {
  return (req, _res, next) => {
    const { user } = requireAuth(req);
    if (user.status !== 'active') {
      throw new AppError('account_restricted', 'Account is restricted');
    }
    next();
  };
}
