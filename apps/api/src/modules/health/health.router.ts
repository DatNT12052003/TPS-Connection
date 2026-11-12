import { Router } from 'express';
import type { HealthController } from './health.controller.js';

/**
 * Router: chỉ khai báo đường dẫn, method và middleware, rồi giao cho controller.
 *   GET /health        liveness
 *   GET /health/ready  readiness (PostgreSQL, Redis…)
 */
export function healthRouter(controller: HealthController): Router {
  const router = Router();
  router.get('/health', controller.live);
  router.get('/health/ready', controller.ready);
  return router;
}
