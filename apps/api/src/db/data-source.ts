import pg from 'pg';
import { DataSource, type Logger as TypeOrmLogger } from 'typeorm';
import type { Env } from '../config/env.js';
import type { Logger } from '../lib/logger.js';
import { ENTITIES } from './entities.js';
import { MIGRATIONS } from './migrations/index.js';

// bigint (int8) mặc định trả về chuỗi. Tiền lưu bigint theo đồng (_vnd) và COUNT(*) là int8:
// đổi sang number, nhưng báo lỗi thay vì làm tròn sai nếu vượt Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`int8 value ${value} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return parsed;
});

/** Chuyển log của TypeORM sang pino. */
class PinoTypeOrmLogger implements TypeOrmLogger {
  constructor(private readonly logger: Logger) {}

  logQuery(query: string, parameters?: unknown[]) {
    this.logger.trace({ query, parameters }, 'query');
  }
  logQueryError(error: string | Error, query: string, parameters?: unknown[]) {
    this.logger.error({ err: error, query, parameters }, 'Query failed');
  }
  logQuerySlow(time: number, query: string, parameters?: unknown[]) {
    this.logger.warn({ time, query, parameters }, 'Slow query');
  }
  logSchemaBuild(message: string) {
    this.logger.debug(message);
  }
  logMigration(message: string) {
    this.logger.info(message);
  }
  log(level: 'log' | 'info' | 'warn', message: unknown) {
    if (level === 'warn') this.logger.warn({ message }, 'typeorm');
    else this.logger.debug({ message }, 'typeorm');
  }
}

export function createDataSource(
  env: Pick<Env, 'DATABASE_URL' | 'DATABASE_POOL_MAX'>,
  logger?: Logger,
): DataSource {
  return new DataSource({
    type: 'postgres',
    url: env.DATABASE_URL,
    applicationName: 'tps-api',
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    migrationsTransactionMode: 'each',
    // Không bao giờ để TypeORM tự sửa schema: mọi thay đổi đi qua migration.
    synchronize: false,
    maxQueryExecutionTime: 500,
    ...(logger && { logger: new PinoTypeOrmLogger(logger), logging: true }),
    extra: {
      max: env.DATABASE_POOL_MAX,
      // Không chờ mãi khi PostgreSQL không trả lời hoặc pool đã đầy.
      connectionTimeoutMillis: 5_000,
      // timezone: mọi thời điểm lưu và so sánh theo UTC; hiển thị theo Asia/Ho_Chi_Minh ở client.
      // statement_timeout: câu truy vấn chạy quá 15 giây bị PostgreSQL hủy, không giữ kết nối mãi.
      options: '-c timezone=UTC -c statement_timeout=15000',
    },
  });
}
