// Test tích hợp: tự bật PostgreSQL và Redis thật bằng Testcontainers (cần Docker đang chạy).
// Cùng image với compose.yaml để hành vi giống máy dev.
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { HealthReport } from '@tps/shared';
import type { Redis } from 'ioredis';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApp } from '../../src/app.js';
import { createDataSource } from '../../src/db/data-source.js';
import { createRedis } from '../../src/lib/redis.js';
import { createHealthService } from '../../src/modules/health/health.service.js';
import { silentLogger } from '../helpers.js';

jest.setTimeout(180_000);

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let dataSource: DataSource;
let redis: Redis;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:18.6-alpine').start(),
    new RedisContainer('redis:8.10.3-alpine').start(),
  ]);
  dataSource = createDataSource({
    DATABASE_URL: postgres.getConnectionUri(),
    DATABASE_POOL_MAX: 2,
  });
  await dataSource.initialize();
  redis = createRedis(redisContainer.getConnectionUrl(), silentLogger);
});

afterAll(async () => {
  await Promise.allSettled([dataSource?.destroy(), redis?.quit()]);
  await Promise.allSettled([postgres?.stop(), redisContainer?.stop()]);
});

describe('migrations', () => {
  it('run on an empty database and can be reverted and re-applied', async () => {
    const applied = await dataSource.runMigrations();
    expect(applied.map((m) => m.name)).toContain('InitExtensions1794960000000');
    expect(await dataSource.showMigrations()).toBe(false);

    await dataSource.undoLastMigration();
    expect(await dataSource.showMigrations()).toBe(true);
    await dataSource.runMigrations();
    expect(await dataSource.showMigrations()).toBe(false);
  });

  it('enable the extensions from the schema design (§1.6)', async () => {
    const rows = await dataSource.query<{ extname: string }[]>('SELECT extname FROM pg_extension');
    expect(rows.map((r) => r.extname)).toEqual(
      expect.arrayContaining(['citext', 'unaccent', 'pg_trgm']),
    );
  });

  it('provide immutable_unaccent for accent-insensitive Vietnamese search', async () => {
    const [row] = await dataSource.query<{ value: string }[]>(
      `SELECT immutable_unaccent('Nguyễn Thị Hồng Nhung, Đà Nẵng') AS value`,
    );
    expect(row?.value).toBe('Nguyen Thi Hong Nhung, Da Nang');
  });

  it('run sessions in UTC with a statement timeout', async () => {
    const [row] = await dataSource.query<{ tz: string; timeout: string }[]>(
      `SELECT current_setting('TimeZone') AS tz, current_setting('statement_timeout') AS timeout`,
    );
    expect(row).toEqual({ tz: 'UTC', timeout: '15s' });
  });

  it('return int8 as a number', async () => {
    const [row] = await dataSource.query<{ fee_vnd: unknown }[]>(
      `SELECT 180000::bigint AS fee_vnd`,
    );
    expect(row?.fee_vnd).toBe(180_000);
  });
});

describe('GET /health/ready with real PostgreSQL and Redis', () => {
  it('returns 200 with both checks ok', async () => {
    const health = createHealthService({
      logger: silentLogger,
      checks: {
        database: () => dataSource.query('SELECT 1'),
        redis: () => redis.ping(),
      },
    });
    const app = createApp({ env: { CORS_ORIGINS: [] }, logger: silentLogger, health });

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    const report = HealthReport.parse(res.body);
    expect(report.checks.database?.status).toBe('ok');
    expect(report.checks.redis?.status).toBe('ok');
  });
});
