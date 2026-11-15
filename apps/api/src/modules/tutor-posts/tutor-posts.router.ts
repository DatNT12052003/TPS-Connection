import {
  ChangeTutorPostStatusRequest,
  OwnTutorPostsQuery,
  SaveTutorPostRequest,
  TutorPostIdParams,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import type { TutorPostsController } from './tutor-posts.controller.js';

/**
 * /api/v1/me/tutor-posts: bài tuyển học sinh của chính gia sư đang đăng nhập (B.2).
 *
 *   GET    /                    200  danh sách (?status=&page=&pageSize=)
 *   POST   /                    201  tạo nháp (gia sư chưa xác minh cũng tạo được)
 *   GET    /:postId             200  chi tiết
 *   PUT    /:postId             200  thay toàn bộ nội dung (bài đã đóng: 409)
 *   POST   /:postId/status      200  đổi trạng thái; mở bài cần đã xác minh danh tính (403 tutor_not_verified)
 *   POST   /:postId/duplicate   201  nhân bản thành nháp mới (D33)
 *   DELETE /:postId             204  xóa mềm
 */
export function ownTutorPostsRouter(
  controller: TutorPostsController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate, requireRole('tutor'));
  router.get('/', validate({ query: OwnTutorPostsQuery }), controller.listOwn);
  router.post('/', validate({ body: SaveTutorPostRequest }), controller.create);
  router.get('/:postId', validate({ params: TutorPostIdParams }), controller.getOwn);
  router.put(
    '/:postId',
    validate({ params: TutorPostIdParams, body: SaveTutorPostRequest }),
    controller.update,
  );
  router.post(
    '/:postId/status',
    validate({ params: TutorPostIdParams, body: ChangeTutorPostStatusRequest }),
    controller.changeStatus,
  );
  router.post('/:postId/duplicate', validate({ params: TutorPostIdParams }), controller.duplicate);
  router.delete('/:postId', validate({ params: TutorPostIdParams }), controller.remove);
  return router;
}

/**
 * /api/v1/tutor-posts: bài tuyển học sinh công khai (khách xem được, C8). Danh sách và tìm kiếm ở đợt 2.
 *
 *   GET /:postId   200  bài đang mở của gia sư đã xác minh; còn lại 404
 */
export function publicTutorPostsRouter(controller: TutorPostsController): Router {
  const router = Router();
  router.get('/:postId', validate({ params: TutorPostIdParams }), controller.getPublic);
  return router;
}
