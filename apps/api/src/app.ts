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
import { createLearnersController } from './modules/learners/learners.controller.js';
import { learnersRouter, studentInvitationsRouter } from './modules/learners/learners.router.js';
import type { LearnersService } from './modules/learners/learners.service.js';
import type { StudentInvitationsService } from './modules/learners/student-invitations.service.js';
import { createParentsController } from './modules/parents/parents.controller.js';
import { parentProfileRouter } from './modules/parents/parents.router.js';
import type { ParentsService } from './modules/parents/parents.service.js';
import { catalogRouter } from './modules/catalog/catalog.router.js';
import type { CatalogService } from './modules/catalog/catalog.service.js';
import { createTutorsController } from './modules/tutors/tutors.controller.js';
import { ownTutorProfileRouter, publicTutorsRouter } from './modules/tutors/tutors.router.js';
import type { TutorsService } from './modules/tutors/tutors.service.js';
import { createVerificationController } from './modules/verification/verification.controller.js';
import { ownVerificationRouter } from './modules/verification/verification.router.js';
import type { VerificationService } from './modules/verification/verification.service.js';
import { createVerificationReviewController } from './modules/verification/verification-review.controller.js';
import { verificationReviewRouter } from './modules/verification/verification-review.router.js';
import type { VerificationReviewService } from './modules/verification/verification-review.service.js';
import { createAccountController } from './modules/users/account.controller.js';
import { accountRouter, filesRouter } from './modules/users/account.router.js';
import type { AccountService } from './modules/users/account.service.js';
import { createOpenApiDocument } from './openapi.js';

export interface AppDeps {
  env: Pick<Env, 'CORS_ORIGINS' | 'TRUST_PROXY' | 'COOKIE_DOMAIN' | 'COOKIE_SECURE'>;
  logger: Logger;
  health: HealthService;
  auth: AuthService;
  tokens: TokenService;
  rateLimiter: RateLimiter;
  parents: ParentsService;
  learners: LearnersService;
  studentInvitations: StudentInvitationsService;
  tutors: TutorsService;
  verification: VerificationService;
  verificationReview: VerificationReviewService;
  account: AccountService;
  catalog: CatalogService;
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
  api.use(
    '/me/parent-profile',
    parentProfileRouter(createParentsController(deps.parents), authenticate()),
  );
  const learnersController = createLearnersController({
    learners: deps.learners,
    invitations: deps.studentInvitations,
    auth: deps.auth,
    cookies: cookieSettings,
  });
  api.use('/learners', learnersRouter(learnersController, deps.rateLimiter, authenticate()));
  api.use('/student-invitations', studentInvitationsRouter(learnersController, deps.rateLimiter));
  const tutorsController = createTutorsController(deps.tutors);
  // Trước router hồ sơ gia sư: router đó `router.use(authenticate, …)` cho mọi đường dẫn bên dưới.
  api.use(
    '/me/tutor-profile',
    ownVerificationRouter(createVerificationController(deps.verification), authenticate()),
  );
  api.use('/me/tutor-profile', ownTutorProfileRouter(tutorsController, authenticate()));
  api.use(
    '/admin/verification-requests',
    verificationReviewRouter(
      createVerificationReviewController(deps.verificationReview),
      authenticate(),
    ),
  );
  api.use('/tutors', publicTutorsRouter(tutorsController));
  const accountController = createAccountController(deps.account);
  // Sau /me/parent-profile, /me/tutor-profile: router này chỉ khớp /me và /me/avatar.
  api.use('/me', accountRouter(accountController, authenticate()));
  api.use('/files', filesRouter(accountController, deps.rateLimiter, authenticate()));
  api.use('/catalog', catalogRouter(deps.catalog));
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
