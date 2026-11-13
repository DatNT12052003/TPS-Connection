import type { AuthUser } from '@tps/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/app-error.js';
import { readAccessToken } from '../modules/auth/auth.cookies.js';
import type { TokenService } from '../modules/auth/tokens.js';

/** Người dùng đã xác thực của request (`req.auth`). */
export interface AuthContext {
  user: AuthUser;
  /** Chuỗi phiên đăng nhập hiện tại. */
  sessionFamilyId: string;
}

/**
 * Middleware xác thực. Kiểm tra access token (chữ ký, hạn), rồi đọc lại tài khoản từ database ở MỖI
 * request: tài khoản bị khóa hoặc xóa, hay bị thu hồi vai trò, có hiệu lực ngay chứ không chờ token hết hạn.
 *
 * `required: false`: không có token thì vẫn cho qua (`req.auth` undefined); token sai vẫn bị từ chối.
 */
export function createAuthenticate(deps: {
  tokens: TokenService;
  loadUser: (userId: string) => Promise<AuthUser | null>;
}) {
  return (options: { required?: boolean } = {}): RequestHandler =>
    async (req, _res, next) => {
      const required = options.required ?? true;
      const token = readAccessToken(req);
      if (!token) {
        if (required) throw new AppError('unauthenticated', 'Not signed in');
        next();
        return;
      }
      const claims = deps.tokens.verifyAccessToken(token);
      if (!claims) throw new AppError('unauthenticated', 'Invalid or expired access token');

      const user = await deps.loadUser(claims.userId);
      if (!user) throw new AppError('unauthenticated', 'Account no longer exists');
      if (user.status === 'locked') throw new AppError('account_locked', 'Account is locked');

      req.auth = { user, sessionFamilyId: claims.sessionFamilyId };
      req.log = req.log.child({ userId: user.id });
      next();
    };
}

export type Authenticate = ReturnType<typeof createAuthenticate>;
