import {
  EmailRequest,
  LoginRequest,
  PasswordResetConfirmRequest,
  RegisterRequest,
  VerifyEmailRequest,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { validate } from '../../http/validate.js';
import { type RateLimiter, rateLimitByIp } from '../../lib/rate-limiter.js';
import type { AuthController } from './auth.controller.js';

/** Giới hạn theo IP cho từng endpoint (ngoài giới hạn theo email trong service). */
export const AUTH_IP_LIMITS = {
  register: { limit: 10, windowSeconds: 60 * 60 },
  login: { limit: 20, windowSeconds: 10 * 60 },
  code: { limit: 30, windowSeconds: 10 * 60 },
  send: { limit: 20, windowSeconds: 60 * 60 },
  refresh: { limit: 60, windowSeconds: 10 * 60 },
} as const;

/**
 * /api/v1/auth. `authenticate` là middleware xác thực (bắt buộc đăng nhập) dùng cho /me.
 *
 *   POST /register                    201  đăng ký, gửi mã xác thực
 *   POST /email-verification/resend   202  gửi lại mã
 *   POST /email-verification/confirm  200  nhập mã: xác thực email và đăng nhập
 *   POST /login                       200  đăng nhập
 *   POST /refresh                     200  làm mới phiên (xoay refresh token)
 *   POST /logout                      204  đăng xuất
 *   POST /password-reset/request      202  gửi mã đặt lại mật khẩu
 *   POST /password-reset/confirm      204  đặt mật khẩu mới, đăng xuất mọi thiết bị
 *   GET  /me                          200  người dùng hiện tại
 */
export function authRouter(
  controller: AuthController,
  limiter: RateLimiter,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  const limit = (name: keyof typeof AUTH_IP_LIMITS) =>
    rateLimitByIp(limiter, { name: `auth-${name}`, ...AUTH_IP_LIMITS[name] });

  router.post(
    '/register',
    limit('register'),
    validate({ body: RegisterRequest }),
    controller.register,
  );
  router.post(
    '/email-verification/resend',
    limit('send'),
    validate({ body: EmailRequest }),
    controller.resendVerification,
  );
  router.post(
    '/email-verification/confirm',
    limit('code'),
    validate({ body: VerifyEmailRequest }),
    controller.verifyEmail,
  );
  router.post('/login', limit('login'), validate({ body: LoginRequest }), controller.login);
  router.post('/refresh', limit('refresh'), controller.refresh);
  router.post('/logout', controller.logout);
  router.post(
    '/password-reset/request',
    limit('send'),
    validate({ body: EmailRequest }),
    controller.requestPasswordReset,
  );
  router.post(
    '/password-reset/confirm',
    limit('code'),
    validate({ body: PasswordResetConfirmRequest }),
    controller.resetPassword,
  );
  router.get('/me', authenticate, controller.me);

  return router;
}
