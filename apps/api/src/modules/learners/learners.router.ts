import {
  AcceptStudentInvitationRequest,
  CreateLearnerRequest,
  CreateStudentInvitationRequest,
  LearnerIdParams,
  StudentInvitationLookupRequest,
  UpdateLearnerRequest,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import { type RateLimiter, rateLimitByIp } from '../../lib/rate-limiter.js';
import type { LearnersController } from './learners.controller.js';

/** Giới hạn theo IP cho các endpoint lời mời (ngoài giới hạn theo phụ huynh trong service). */
export const INVITATION_IP_LIMITS = {
  send: { limit: 20, windowSeconds: 60 * 60 },
  lookup: { limit: 30, windowSeconds: 10 * 60 },
  accept: { limit: 10, windowSeconds: 10 * 60 },
} as const;

/**
 * /api/v1/learners: hồ sơ con. Cần đăng nhập. Quyền theo quan hệ (phụ huynh quản lý / chính học sinh)
 * kiểm tra ở service; không có quyền thì 404.
 *
 *   GET    /                        200  phụ huynh: con đang quản lý; học sinh: hồ sơ của mình
 *   POST   /                        201  phụ huynh tạo hồ sơ con (kèm đồng ý xử lý dữ liệu của con)
 *   GET    /:learnerId              200  phụ huynh quản lý hoặc chính học sinh
 *   PATCH  /:learnerId              200  phụ huynh quản lý
 *   DELETE /:learnerId              204  phụ huynh quản lý (xóa mềm)
 *   POST   /:learnerId/invitation   201  phụ huynh mời con tạo tài khoản học sinh (thay lời mời cũ)
 *   DELETE /:learnerId/invitation   204  phụ huynh hủy lời mời đang mở
 */
export function learnersRouter(
  controller: LearnersController,
  limiter: RateLimiter,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  const parentOnly = requireRole('parent');
  const parentOrStudent = requireRole('parent', 'student');
  const params = validate({ params: LearnerIdParams });

  router.use(authenticate);
  router.get('/', parentOrStudent, controller.list);
  router.post('/', parentOnly, validate({ body: CreateLearnerRequest }), controller.create);
  router.get('/:learnerId', parentOrStudent, params, controller.get);
  router.patch(
    '/:learnerId',
    parentOnly,
    validate({ params: LearnerIdParams, body: UpdateLearnerRequest }),
    controller.update,
  );
  router.delete('/:learnerId', parentOnly, params, controller.remove);
  router.post(
    '/:learnerId/invitation',
    parentOnly,
    rateLimitByIp(limiter, { name: 'student-invite-send', ...INVITATION_IP_LIMITS.send }),
    validate({ params: LearnerIdParams, body: CreateStudentInvitationRequest }),
    controller.invite,
  );
  router.delete('/:learnerId/invitation', parentOnly, params, controller.revokeInvitation);
  return router;
}

/**
 * /api/v1/student-invitations: trang nhận lời mời (chưa đăng nhập). Token gửi trong body, không đặt
 * trên URL, để không lọt vào log.
 *
 *   POST /lookup   200  thông tin lời mời còn dùng được
 *   POST /accept   201  tạo tài khoản học sinh, gắn vào hồ sơ, đăng nhập (cookie)
 */
export function studentInvitationsRouter(
  controller: LearnersController,
  limiter: RateLimiter,
): Router {
  const router = Router();
  router.post(
    '/lookup',
    rateLimitByIp(limiter, { name: 'student-invite-lookup', ...INVITATION_IP_LIMITS.lookup }),
    validate({ body: StudentInvitationLookupRequest }),
    controller.lookupInvitation,
  );
  router.post(
    '/accept',
    rateLimitByIp(limiter, { name: 'student-invite-accept', ...INVITATION_IP_LIMITS.accept }),
    validate({ body: AcceptStudentInvitationRequest }),
    controller.acceptInvitation,
  );
  return router;
}
