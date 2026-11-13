import type { RequestHandler } from 'express';
import type { HealthService } from './health.service.js';

/**
 * Controller: nhận request, gọi service, chọn HTTP status và định dạng response.
 * Không chứa nghiệp vụ (nằm ở service) và không khai báo đường dẫn (nằm ở router).
 */
export interface HealthController {
  /** Liveness: tiến trình còn chạy, không kiểm tra phụ thuộc. */
  live: RequestHandler;
  /** Readiness: mọi phụ thuộc ổn thì 200, có cái lỗi thì 503. */
  ready: RequestHandler;
}

export function createHealthController(health: HealthService): HealthController {
  return {
    live: (_req, res) => {
      res.json({ status: 'ok' });
    },
    ready: async (_req, res) => {
      const report = await health.check();
      res.status(report.status === 'ok' ? 200 : 503).json(report);
    },
  };
}
