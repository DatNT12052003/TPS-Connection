import { SetAvatarRequest, UpdateAccountRequest, UploadRequest } from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { validate } from '../../http/validate.js';
import { type RateLimiter, rateLimitByIp } from '../../lib/rate-limiter.js';
import type { AccountController } from './account.controller.js';

/** Giới hạn cấp URL tải lên theo IP. */
export const UPLOAD_IP_LIMIT = { limit: 30, windowSeconds: 10 * 60 } as const;

/**
 * /api/v1/me: thông tin cá nhân của chính người đang đăng nhập. `authenticate` gắn theo từng route (không
 * `router.use`) vì `/me/parent-profile`, `/me/tutor-profile` là router riêng cùng tiền tố.
 *
 *   GET    /         200  thông tin cá nhân
 *   PATCH  /         200  sửa tên hiển thị, họ tên (khóa sau khi gia sư được xác minh), số điện thoại, ngôn ngữ
 *   PUT    /avatar   200  đặt ảnh đại diện bằng tệp đã tải lên
 *   DELETE /avatar   204  bỏ ảnh đại diện
 */
export function accountRouter(controller: AccountController, authenticate: RequestHandler): Router {
  const router = Router();
  router.get('/', authenticate, controller.get);
  router.patch('/', authenticate, validate({ body: UpdateAccountRequest }), controller.update);
  router.put('/avatar', authenticate, validate({ body: SetAvatarRequest }), controller.setAvatar);
  router.delete('/avatar', authenticate, controller.removeAvatar);
  return router;
}

/**
 * /api/v1/files: tệp tải lên.
 *
 *   POST /uploads   201  cấp URL để trình duyệt PUT tệp thẳng lên kho (hiện chỉ `purpose: avatar`)
 */
export function filesRouter(
  controller: AccountController,
  limiter: RateLimiter,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.post(
    '/uploads',
    authenticate,
    rateLimitByIp(limiter, { name: 'file-upload', ...UPLOAD_IP_LIMIT }),
    validate({ body: UploadRequest }),
    controller.createUpload,
  );
  return router;
}
