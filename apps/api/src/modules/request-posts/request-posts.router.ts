import {
  ChangeRequestPostStatusRequest,
  CreateRequestPostRequest,
  OwnRequestPostsQuery,
  RequestPostIdParams,
  UpdateRequestPostRequest,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import type { RequestPostsController } from './request-posts.controller.js';

/**
 * /api/v1/me/request-posts: bài tìm gia sư của chính phụ huynh đang đăng nhập (B.3).
 *
 *   GET    /                 200  danh sách (?status=&learnerId=&page=&pageSize=)
 *   POST   /                 201  tạo nháp cho hồ sơ con mình quản lý (không phải: 404)
 *   GET    /:postId          200  chi tiết
 *   PUT    /:postId          200  thay toàn bộ nội dung (bài đã đóng: 409)
 *   POST   /:postId/status   200  đăng, ẩn, hiện lại, đóng (kèm lý do)
 *   DELETE /:postId          204  xóa mềm
 */
export function ownRequestPostsRouter(
  controller: RequestPostsController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate, requireRole('parent'));
  router.get('/', validate({ query: OwnRequestPostsQuery }), controller.listOwn);
  router.post('/', validate({ body: CreateRequestPostRequest }), controller.create);
  router.get('/:postId', validate({ params: RequestPostIdParams }), controller.getOwn);
  router.put(
    '/:postId',
    validate({ params: RequestPostIdParams, body: UpdateRequestPostRequest }),
    controller.update,
  );
  router.post(
    '/:postId/status',
    validate({ params: RequestPostIdParams, body: ChangeRequestPostStatusRequest }),
    controller.changeStatus,
  );
  router.delete('/:postId', validate({ params: RequestPostIdParams }), controller.remove);
  return router;
}

/**
 * /api/v1/request-posts: bài tìm gia sư cho gia sư đã xác minh, đã đăng nhập (C8). Danh sách, tìm kiếm ở đợt 2.
 *
 *   GET /:postId   200  bài đang mở; gia sư chưa xác minh: 403 tutor_not_verified; không hiển thị được: 404
 */
export function tutorRequestPostsRouter(
  controller: RequestPostsController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate, requireRole('tutor'));
  router.get('/:postId', validate({ params: RequestPostIdParams }), controller.getForTutor);
  return router;
}
