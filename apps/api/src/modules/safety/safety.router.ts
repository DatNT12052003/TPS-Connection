import {
  BlockedUserParams,
  CreateBlockRequest,
  CreateReportRequest,
  SAFETY_LIMITS,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import { type RateLimiter, rateLimitByUser } from '../../lib/rate-limiter.js';
import type { SafetyController } from './safety.controller.js';

/**
 * /api/v1/me/blocks: người tôi đã chặn (gia sư, phụ huynh).
 *
 *   GET    /           200  danh sách
 *   POST   /           201  chặn `{ tutorId }` hoặc `{ conversationId }` (bên kia); hủy yêu cầu đang mở giữa hai người
 *   DELETE /:userId    204  bỏ chặn (chưa chặn: 404)
 */
export function blocksRouter(
  controller: SafetyController,
  limiter: RateLimiter,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate, requireRole('tutor', 'parent'));
  router.get('/', controller.blocks);
  router.post(
    '/',
    rateLimitByUser(limiter, {
      name: 'block',
      limit: SAFETY_LIMITS.blocksPerHour,
      windowSeconds: 3600,
    }),
    validate({ body: CreateBlockRequest }),
    controller.block,
  );
  router.delete('/:userId', validate({ params: BlockedUserParams }), controller.unblock);
  return router;
}

/**
 * /api/v1/reports: báo cáo vi phạm (gia sư, phụ huynh).
 *
 *   POST /   202  `{ targetType, …, reasonCode, description? }`; đối tượng không thấy được: 404
 */
export function reportsRouter(
  controller: SafetyController,
  limiter: RateLimiter,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate, requireRole('tutor', 'parent'));
  router.post(
    '/',
    rateLimitByUser(limiter, {
      name: 'report',
      limit: SAFETY_LIMITS.reportsPerHour,
      windowSeconds: 3600,
    }),
    validate({ body: CreateReportRequest }),
    controller.report,
  );
  return router;
}
