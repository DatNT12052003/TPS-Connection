import { createApp } from '../src/app.js';
import { createMemoryRateLimiter } from '../src/lib/rate-limiter.js';
import { createLogger } from '../src/lib/logger.js';
import type { AuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/tokens.js';
import type { HealthService } from '../src/modules/health/health.service.js';
import type { LearnersService } from '../src/modules/learners/learners.service.js';
import type { StudentInvitationsService } from '../src/modules/learners/student-invitations.service.js';
import type { ParentsService } from '../src/modules/parents/parents.service.js';
import type { CatalogService } from '../src/modules/catalog/catalog.service.js';
import type { TutorsService } from '../src/modules/tutors/tutors.service.js';
import type { AccountService } from '../src/modules/users/account.service.js';

export const silentLogger = createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' });

export const TEST_JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
export const TEST_ORIGIN = 'http://localhost:5173';

export const testEnv = {
  CORS_ORIGINS: [TEST_ORIGIN],
  TRUST_PROXY: 'loopback',
  COOKIE_DOMAIN: undefined,
  COOKIE_SECURE: false,
};

/**
 * App không cần PostgreSQL hay Redis: health service giả, auth service rỗng (chỉ dùng cho test không gọi
 * tới /api/v1/auth). Test auth thật nằm ở test/integration/auth.int.test.ts.
 */
export function createTestApp(health?: Partial<HealthService>, auth?: Partial<AuthService>) {
  const fakeHealth: HealthService = {
    check: async () => ({ status: 'ok', checks: {} }),
    ...health,
  };
  return createApp({
    env: testEnv,
    logger: silentLogger,
    health: fakeHealth,
    auth: { getAuthUser: async () => null, ...auth } as AuthService,
    tokens: createTokenService({ secret: TEST_JWT_SECRET }),
    rateLimiter: createMemoryRateLimiter(),
    // Không dùng ở test không có database; test thật ở test/integration/learners.int.test.ts.
    parents: {} as ParentsService,
    learners: {} as LearnersService,
    studentInvitations: {} as StudentInvitationsService,
    tutors: {} as TutorsService,
    account: {} as AccountService,
    catalog: {} as CatalogService,
  });
}
