import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import type { Env } from './config/env.js';
import { errorHandler, notFoundHandler } from './http/error-handler.js';
import { requestLogger } from './http/request-logger.js';
import type { Logger } from './lib/logger.js';
import { createHealthController } from './modules/health/health.controller.js';
import { healthRouter } from './modules/health/health.router.js';
import type { HealthService } from './modules/health/health.service.js';
import { createOpenApiDocument } from './openapi.js';

export interface AppDeps {
  env: Pick<Env, 'CORS_ORIGINS'>;
  logger: Logger;
  health: HealthService;
}

/** Tạo Express app (chưa listen) từ các phụ thuộc truyền vào, để test thay được bằng bản giả. */
export function createApp({ env, logger, health }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(requestLogger(logger));
  app.use(express.json({ limit: '1mb' }));

  // Mỗi module: service (nghiệp vụ) -> controller (HTTP) -> router (đường dẫn).
  app.use(healthRouter(createHealthController(health)));

  const openApiDocument = createOpenApiDocument();
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });

  // Các module nghiệp vụ (G2 trở đi) gắn vào đây: api.use('/auth', authRouter(...))…
  const api = Router();
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
