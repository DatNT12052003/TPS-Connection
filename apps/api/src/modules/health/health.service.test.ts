import { describe, expect, it } from '@jest/globals';
import { HealthReport } from '@tps/shared';
import { silentLogger } from '../../../test/helpers.js';
import { createHealthService } from './health.service.js';

describe('createHealthService', () => {
  it('reports ok when every check resolves', async () => {
    const service = createHealthService({
      logger: silentLogger,
      checks: { database: async () => 1, redis: async () => 'PONG' },
    });
    const report = await service.check();
    expect(HealthReport.parse(report)).toEqual(report);
    expect(report.status).toBe('ok');
    expect(report.checks.database?.status).toBe('ok');
  });

  it('reports error when a check rejects, without leaking the reason', async () => {
    const service = createHealthService({
      logger: silentLogger,
      checks: {
        database: async () => 1,
        redis: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:6379')),
      },
    });
    const report = await service.check();
    expect(report.status).toBe('error');
    expect(report.checks.redis).toEqual({ status: 'error', latencyMs: expect.any(Number) });
    expect(JSON.stringify(report)).not.toContain('ECONNREFUSED');
  });

  it('treats a hanging check as an error after the timeout', async () => {
    const service = createHealthService({
      logger: silentLogger,
      timeoutMs: 50,
      checks: { database: () => new Promise(() => {}) },
    });
    const report = await service.check();
    expect(report.checks.database?.status).toBe('error');
  });
});
