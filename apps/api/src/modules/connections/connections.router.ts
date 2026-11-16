import {
  CONNECTION_LIMITS,
  ConfirmTermsRequest,
  ConnectionRequestIdParams,
  ConnectionRequestListQuery,
  CreateConnectionRequest,
  ProposeTermsRequest,
  RejectConnectionRequest,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireActiveAccount, requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import { type RateLimiter, rateLimitByUser } from '../../lib/rate-limiter.js';
import type { ConnectionsController } from './connections.controller.js';

/**
 * /api/v1/connection-requests: yêu cầu kết nối mà người đang đăng nhập là một bên (gia sư hoặc phụ huynh). Yêu cầu
 * của người khác: 404.
 *
 *   GET  /                      200  danh sách (?as=tutor|client&box=received|sent&state=open|closed&status=
 *                                    &learnerId=&requestPostId=&tutorPostId=&page=&pageSize=)
 *   POST /                      201  phụ huynh gửi gia sư (`direction: client_to_tutor`) hoặc gia sư ứng tuyển
 *                                    (`tutor_to_client`); trùng: 409 connection_exists
 *   GET  /:requestId            200  chi tiết (liên hệ, danh tính trẻ chỉ khi đã xác nhận hợp tác, D16)
 *   POST /:requestId/accept     200  bên nhận chấp nhận → negotiating
 *   POST /:requestId/reject     200  bên nhận từ chối (kèm `note`)
 *   POST /:requestId/cancel     200  bên gửi rút khi đang chờ; một bên hủy khi đang trao đổi
 *   POST /:requestId/terms      201  đề xuất phiên bản điều kiện hợp tác mới
 *   POST /:requestId/confirm    200  xác nhận phiên bản `version` (phải là bản mới nhất: 409 terms_outdated)
 *
 * Gửi, chấp nhận, đề xuất và xác nhận cần tài khoản đang hoạt động (B.9.3); từ chối và hủy thì không. Gửi bị giới
 * hạn theo tài khoản (gửi rồi rút liên tục để làm phiền gia sư): 429 `rate_limited`.
 */
export function connectionsRouter(
  controller: ConnectionsController,
  limiter: RateLimiter,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate, requireRole('tutor', 'parent'));
  const params = { params: ConnectionRequestIdParams };
  router.get('/', validate({ query: ConnectionRequestListQuery }), controller.list);
  router.post(
    '/',
    requireActiveAccount(),
    rateLimitByUser(limiter, {
      name: 'connection-send',
      limit: CONNECTION_LIMITS.sendPerHour,
      windowSeconds: 3600,
    }),
    validate({ body: CreateConnectionRequest }),
    controller.create,
  );
  router.get('/:requestId', validate(params), controller.get);
  router.post('/:requestId/accept', requireActiveAccount(), validate(params), controller.accept);
  router.post(
    '/:requestId/reject',
    validate({ ...params, body: RejectConnectionRequest }),
    controller.reject,
  );
  router.post('/:requestId/cancel', validate(params), controller.cancel);
  router.post(
    '/:requestId/terms',
    requireActiveAccount(),
    validate({ ...params, body: ProposeTermsRequest }),
    controller.proposeTerms,
  );
  router.post(
    '/:requestId/confirm',
    requireActiveAccount(),
    validate({ ...params, body: ConfirmTermsRequest }),
    controller.confirm,
  );
  return router;
}
