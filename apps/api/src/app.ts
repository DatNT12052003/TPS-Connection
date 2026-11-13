import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import type { Env } from './config/env.js';
import { createAuthenticate } from './http/authenticate.js';
import { errorHandler, notFoundHandler } from './http/error-handler.js';
import { originCheck } from './http/origin-check.js';
import { requestLogger } from './http/request-logger.js';
import type { Logger } from './lib/logger.js';
import type { RateLimiter } from './lib/rate-limiter.js';
import { createAuthController } from './modules/auth/auth.controller.js';
import { authRouter } from './modules/auth/auth.router.js';
import type { AuthService } from './modules/auth/auth.service.js';
import type { TokenService } from './modules/auth/tokens.js';
import { createHealthController } from './modules/health/health.controller.js';
import { healthRouter } from './modules/health/health.router.js';
import type { HealthService } from './modules/health/health.service.js';
import { createOpenApiDocument } from './openapi.js';

export interface AppDeps {
  env: Pick<Env, 'CORS_ORIGINS' | 'TRUST_PROXY' | 'COOKIE_DOMAIN' | 'COOKIE_SECURE'>;
  logger: Logger;
  health: HealthService;
  auth: AuthService;
  tokens: TokenService;
  rateLimiter: RateLimiter;
}

/** "true"/"false" -> boolean, số -> số hop proxy, còn lại (loopback, dải IP) giữ nguyên chuỗi. */
function trustProxySetting(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

/** Tạo Express app (chưa listen) từ các phụ thuộc truyền vào, để test thay được bằng bản giả. */
export function createApp(deps: AppDeps): Express {
  const { env, logger } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxySetting(env.TRUST_PROXY));

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(requestLogger(logger));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Mỗi module: service (nghiệp vụ) -> controller (HTTP) -> router (đường dẫn).
  app.use(healthRouter(createHealthController(deps.health)));

  const openApiDocument = createOpenApiDocument();
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });

  const authenticate = createAuthenticate({
    tokens: deps.tokens,
    loadUser: (userId) => deps.auth.getAuthUser(userId),
  });
  const cookieSettings = { domain: env.COOKIE_DOMAIN, secure: env.COOKIE_SECURE };

  const api = Router();
  api.use(originCheck(env.CORS_ORIGINS));
  api.use(
    '/auth',
    authRouter(createAuthController(deps.auth, cookieSettings), deps.rateLimiter, authenticate()),
  );
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
