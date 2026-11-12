import type { HealthReport } from '@tps/shared';
import type { Logger } from '../../lib/logger.js';

/** Một phép kiểm tra: resolve là ổn, reject là lỗi. */
export type HealthCheck = () => Promise<unknown>;

export interface HealthService {
  check(): Promise<HealthReport>;
}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });

/**
 * Chạy song song các phép kiểm tra (database, redis…). Chi tiết lỗi chỉ ghi log, không trả ra response.
 */
export function createHealthService(options: {
  checks: Record<string, HealthCheck>;
  logger: Logger;
  timeoutMs?: number;
}): HealthService {
  const { checks, logger, timeoutMs = 2000 } = options;

  return {
    async check() {
      const entries = await Promise.all(
        Object.entries(checks).map(async ([name, run]) => {
          const startedAt = performance.now();
          try {
            await withTimeout(run(), timeoutMs);
            return [name, { status: 'ok' as const, latencyMs: elapsed(startedAt) }] as const;
          } catch (err) {
            logger.warn({ err, check: name }, 'Health check failed');
            return [name, { status: 'error' as const, latencyMs: elapsed(startedAt) }] as const;
          }
        }),
      );
      const results: HealthReport['checks'] = {};
      for (const [name, result] of entries) results[name] = result;
      const allOk = entries.every(([, result]) => result.status === 'ok');
      return { status: allOk ? 'ok' : 'error', checks: results };
    },
  };
}

const elapsed = (startedAt: number) => Math.round(performance.now() - startedAt);
