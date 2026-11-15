import { UpdateParentProfileRequest } from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import type { ParentsController } from './parents.controller.js';

/**
 * /api/v1/me/parent-profile: hồ sơ của chính phụ huynh đang đăng nhập (không nhận id từ client).
 *
 *   GET  /   200  hồ sơ (trống nếu chưa lưu)
 *   PUT  /   200  tạo hoặc thay toàn bộ hồ sơ
 */
export function parentProfileRouter(
  controller: ParentsController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate, requireRole('parent'));
  router.get('/', controller.getOwn);
  router.put('/', validate({ body: UpdateParentProfileRequest }), controller.replaceOwn);
  return router;
}
