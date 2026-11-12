import 'reflect-metadata';
import { createApp } from './app.js';
import { EnvError, loadEnv, type Env } from './config/env.js';
import { createDataSource } from './db/data-source.js';
import { createLogger, type Logger } from './lib/logger.js';
import { createRedis } from './lib/redis.js';
import { createHealthService } from './modules/health/health.service.js';

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

  const health = createHealthService({
    logger,
    checks: {
      database: () => dataSource.query('SELECT 1'),
      redis: () => redis.ping(),
    },
  });

  const app = createApp({ env, logger, health });
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
      void Promise.allSettled([dataSource.destroy(), redis.quit()]).then(() => {
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
