import {
  RejectVerificationRequest,
  VerificationDocumentParams,
  VerificationQueueQuery,
  VerificationRequestIdParams,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import type { VerificationReviewController } from './verification-review.controller.js';

/**
 * /api/v1/admin/verification-requests: Manager duyệt xác minh gia sư (C1). Chỉ vai trò `manager`; Admin không
 * duyệt hồ sơ (Manager và Admin không có quyền của nhau, điều kiện hoàn thành G3).
 *
 *   GET  /                                          200  hàng chờ (đang chờ), ?kind=identity|credential&page=
 *   GET  /:requestId                                200  màn duyệt (mọi trạng thái), không có URL ảnh
 *   POST /:requestId/documents/:documentId/view     200  URL xem ảnh 2 phút; ghi nhật ký; chỉ khi đang chờ
 *   POST /:requestId/approve                        200  duyệt
 *   POST /:requestId/reject                         200  từ chối kèm lý do
 */
export function verificationReviewRouter(
  controller: VerificationReviewController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate, requireRole('manager'));
  router.get('/', validate({ query: VerificationQueueQuery }), controller.queue);
  router.get('/:requestId', validate({ params: VerificationRequestIdParams }), controller.detail);
  router.post(
    '/:requestId/documents/:documentId/view',
    validate({ params: VerificationDocumentParams }),
    controller.viewDocument,
  );
  router.post(
    '/:requestId/approve',
    validate({ params: VerificationRequestIdParams }),
    controller.approve,
  );
  router.post(
    '/:requestId/reject',
    validate({ params: VerificationRequestIdParams, body: RejectVerificationRequest }),
    controller.reject,
  );
  return router;
}
