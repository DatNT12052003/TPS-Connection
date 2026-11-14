import 'reflect-metadata';
import { createApp } from './app.js';
import { EnvError, loadEnv, type Env } from './config/env.js';
import { createDataSource } from './db/data-source.js';
import { createJobs } from './jobs/index.js';
import { createSmtpEmailSender } from './lib/email/smtp-email-sender.js';
import { createLogger, type Logger } from './lib/logger.js';
import { createRedisRateLimiter } from './lib/rate-limiter.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createRedisOtpStore } from './modules/auth/otp-store.js';
import { createArgon2Hasher } from './modules/auth/password-hasher.js';
import { createTokenService } from './modules/auth/tokens.js';
import { createRedis } from './lib/redis.js';
import { createStorage } from './lib/storage.js';
import { createHealthService } from './modules/health/health.service.js';
import { createLearnersService } from './modules/learners/learners.service.js';
import { createStudentInvitationsService } from './modules/learners/student-invitations.service.js';
import { createParentsService } from './modules/parents/parents.service.js';
import { createCatalogService } from './modules/catalog/catalog.service.js';
import { createFilesService } from './modules/files/files.service.js';
import { createTutorsService } from './modules/tutors/tutors.service.js';
import { createVerificationService } from './modules/verification/verification.service.js';
import { createVerificationReviewService } from './modules/verification/verification-review.service.js';
import { createFilesMaintenanceService } from './modules/files/files-maintenance.service.js';
import { createAdminAccountsService } from './modules/admin/admin-accounts.service.js';
import { createAdminCatalogService } from './modules/admin/admin-catalog.service.js';
import { createAccountService } from './modules/users/account.service.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Đợi log ghi xong rồi mới thoát (log pino-pretty chạy ở worker thread, thoát ngay sẽ mất dòng cuối). */
function exitAfterFlush(logger: Logger, code: number): void {
  const fallback = setTimeout(() => process.exit(code), 1000);
  fallback.unref();
  logger.flush(() => process.exit(code));
}

function readEnv(): Env {
  try {
    return loadEnv();
  } catch (err) {
    if (err instanceof EnvError) {
      // Logger chưa có (LOG_LEVEL cũng có thể sai): in thẳng ra stderr.
      // eslint-disable-next-line no-console
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

async function main() {
  const env = readEnv();
  const logger = createLogger(env);

  const dataSource = createDataSource(env, logger);
  try {
    await dataSource.initialize();
  } catch (err) {
    logger.fatal(
      { err },
      'Không kết nối được PostgreSQL. Đã chạy `npm run infra:up` và kiểm tra DATABASE_URL chưa?',
    );
    exitAfterFlush(logger, 1);
    return;
  }
  if (await dataSource.showMigrations()) {
    logger.warn('Có migration chưa chạy. Chạy `npm run db:migrate -w @tps/api`.');
  }

  const redis = createRedis(env.REDIS_URL, logger);

  // Dịch vụ dùng chung: kho lưu tệp, gửi email, hàng đợi. Module nghiệp vụ (G2 trở đi) nhận qua tham số.
  const storage = createStorage(env);
  if (env.S3_CONFIGURE_CORS) {
    // Không chặn khởi động: thiếu CORS chỉ làm trình duyệt không upload được, health check sẽ báo kho lỗi.
    storage
      .configureCors(env.CORS_ORIGINS)
      .catch((err: unknown) => logger.warn({ err }, 'Không đặt được CORS cho bucket lưu tệp'));
  }
  const emailSender = createSmtpEmailSender(env);
  const filesMaintenance = createFilesMaintenanceService({ dataSource, storage, logger });
  const jobs = createJobs({
    redisUrl: env.REDIS_URL,
    emailSender,
    logger,
    workersEnabled: env.WORKERS_ENABLED,
    maintenance: {
      'purge-verification-documents': () => filesMaintenance.purgeVerificationDocuments(),
      'cleanup-stale-uploads': () => filesMaintenance.cleanupStaleUploads(),
    },
  });
  jobs
    .startSchedules()
    .catch((err: unknown) => logger.warn({ err }, 'Không đặt được lịch job dọn dữ liệu'));

  const health = createHealthService({
    logger,
    checks: {
      database: () => dataSource.query('SELECT 1'),
      redis: () => redis.ping(),
      storage: () => storage.ping(),
    },
  });

  // Xác thực (G2).
  const rateLimiter = createRedisRateLimiter(redis);
  const tokens = createTokenService({ secret: env.JWT_SECRET });
  const hasher = createArgon2Hasher();
  const auth = createAuthService({
    dataSource,
    hasher,
    tokens,
    otp: createRedisOtpStore({ redis, secret: env.OTP_SECRET }),
    rateLimiter,
    sendEmail: (message) => jobs.enqueueEmail(message),
    logger,
  });

  // Hồ sơ phụ huynh, hồ sơ con, lời mời học sinh (G2).
  const parents = createParentsService({ dataSource, logger });
  const learners = createLearnersService({ dataSource, logger });
  const studentInvitations = createStudentInvitationsService({
    dataSource,
    hasher,
    rateLimiter,
    sendEmail: (message) => jobs.enqueueEmail(message),
    webUrl: env.WEB_URL,
    logger,
  });

  // Hồ sơ gia sư, thông tin cá nhân, ảnh đại diện, danh mục (G2).
  const publicFileUrl = (storageKey: string) => storage.publicUrl(storageKey);
  const files = createFilesService({ storage, logger });
  const tutors = createTutorsService({ dataSource, files, logger, publicFileUrl });
  const account = createAccountService({ dataSource, files, publicFileUrl, logger });

  // Xác minh gia sư (G3).
  const verification = createVerificationService({ dataSource, files, logger });
  const verificationReview = createVerificationReviewService({
    dataSource,
    storage,
    sendEmail: (message) => jobs.enqueueEmail(message),
    webUrl: env.WEB_URL,
    logger,
  });
  const catalog = createCatalogService({ dataSource });

  const app = createApp({
    env,
    logger,
    health,
    auth,
    tokens,
    rateLimiter,
    parents,
    learners,
    studentInvitations,
    tutors,
    verification,
    verificationReview,
    adminAccounts: createAdminAccountsService({ dataSource, logger }),
    adminCatalog: createAdminCatalogService({ dataSource, logger }),
    account,
    catalog,
  });
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`API chạy tại http://${env.HOST}:${env.PORT} (môi trường ${env.NODE_ENV})`);
  });
  // Request (kể cả upload body) quá 30 giây thì đóng; đọc header tối đa 20 giây.
  server.requestTimeout = 30_000;
  server.headersTimeout = 20_000;
  // Lớn hơn keep-alive của reverse proxy (Caddy) để proxy không gửi vào kết nối API vừa đóng.
  server.keepAliveTimeout = 65_000;

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Đang dừng API…');
    const force = setTimeout(() => {
      logger.error('Dừng quá lâu, buộc thoát');
      exitAfterFlush(logger, 1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();

    // Ngừng nhận request mới, chờ request đang chạy xong, rồi đóng kết nối.
    server.close(() => {
      // Worker chờ job đang chạy xong trước, rồi mới đóng các kết nối.
      void jobs
        .close()
        .finally(() => {
          emailSender.close();
          storage.destroy();
        })
        .then(() => Promise.allSettled([dataSource.destroy(), redis.quit()]))
        .then(() => {
          logger.info('Đã dừng API');
          exitAfterFlush(logger, 0);
        });
    });
    server.closeIdleConnections();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- lỗi trước khi có logger
  console.error(err);
  process.exit(1);
});
