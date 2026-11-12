import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import type { HealthService } from '../src/modules/health/health.service.js';

export const silentLogger = createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' });

/** App với health service giả: không cần PostgreSQL hay Redis. */
export function createTestApp(health?: Partial<HealthService>) {
  const fakeHealth: HealthService = {
    check: async () => ({ status: 'ok', checks: {} }),
    ...health,
  };
  return createApp({
    env: { CORS_ORIGINS: ['http://localhost:5173'] },
    logger: silentLogger,
    health: fakeHealth,
  });
}
