import {
  CreateTutorCredentialRequest,
  CredentialIdParams,
  TutorRefParams,
  TutorSearchQuery,
  UpdateTutorCredentialRequest,
  UpdateTutorProfileRequest,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import type { TutorsController } from './tutors.controller.js';

/**
 * /api/v1/me/tutor-profile: hồ sơ của chính gia sư đang đăng nhập (không nhận id gia sư từ client).
 *
 *   GET    /                            200  hồ sơ (tạo hồ sơ trống nếu chưa có)
 *   PUT    /                            200  thay toàn bộ hồ sơ
 *   POST   /credentials                 201  thêm bằng cấp tự khai
 *   PATCH  /credentials/:credentialId   200  sửa (không sửa được khi đang chờ duyệt / đã xác minh)
 *   DELETE /credentials/:credentialId   204  xóa (như trên)
 */
export function ownTutorProfileRouter(
  controller: TutorsController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate, requireRole('tutor'));
  router.get('/', controller.getOwn);
  router.put('/', validate({ body: UpdateTutorProfileRequest }), controller.replaceOwn);
  router.post(
    '/credentials',
    validate({ body: CreateTutorCredentialRequest }),
    controller.addCredential,
  );
  router.patch(
    '/credentials/:credentialId',
    validate({ params: CredentialIdParams, body: UpdateTutorCredentialRequest }),
    controller.updateCredential,
  );
  router.delete(
    '/credentials/:credentialId',
    validate({ params: CredentialIdParams }),
    controller.removeCredential,
  );
  return router;
}

/**
 * /api/v1/tutors: tìm gia sư và hồ sơ gia sư công khai (khách xem được, C8).
 *
 *   GET /            200  tìm gia sư (lọc, sắp xếp, phân trang; xem TutorSearchQuery)
 *   GET /:tutorRef  200  hồ sơ công khai theo slug hoặc id; chưa xác minh / bị khóa / đã xóa: 404
 */
export function publicTutorsRouter(controller: TutorsController): Router {
  const router = Router();
  router.get('/', validate({ query: TutorSearchQuery }), controller.search);
  router.get('/:tutorRef', validate({ params: TutorRefParams }), controller.getPublic);
  return router;
}
