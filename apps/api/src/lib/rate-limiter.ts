// Đếm số lần theo cửa sổ thời gian cố định, lưu ở Redis để mọi tiến trình API dùng chung một bộ đếm.
import type { RequestHandler, Request } from 'express';
import type { Redis } from 'ioredis';
import { rateLimited } from './app-error.js';

export interface RateLimitResult {
  allowed: boolean;
  /** Số lần đã đếm trong cửa sổ hiện tại (kể cả lần này). */
  count: number;
  /** Còn bao nhiêu giây tới khi cửa sổ kết thúc. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Đếm thêm một lần cho `key`; `allowed` = chưa vượt `limit` trong `windowSeconds`. */
  hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
  /** Xem bộ đếm hiện tại mà không đếm thêm. */
  peek(key: string): Promise<{ count: number; retryAfterSeconds: number }>;
  /** Xóa bộ đếm, ví dụ đăng nhập thành công thì xóa số lần sai. */
  reset(key: string): Promise<void>;
}

export function createRedisRateLimiter(redis: Redis, prefix = 'rl:'): RateLimiter {
  return {
    async hit(key, limit, windowSeconds) {
      const fullKey = prefix + key;
      // EXPIRE NX: chỉ đặt hạn ở lần đếm đầu tiên của cửa sổ.
      const results = await redis
        .multi()
        .incr(fullKey)
        .expire(fullKey, windowSeconds, 'NX')
        .ttl(fullKey)
        .exec();
      const count = Number(results?.[0]?.[1] ?? 0);
      const ttl = Number(results?.[2]?.[1] ?? windowSeconds);
      return {
        allowed: count <= limit,
        count,
        retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    },
    async peek(key) {
      const [count, ttl] = await Promise.all([redis.get(prefix + key), redis.ttl(prefix + key)]);
      return { count: Number(count ?? 0), retryAfterSeconds: ttl > 0 ? ttl : 0 };
    },
    async reset(key) {
      await redis.del(prefix + key);
    },
  };
}

/** Bản chạy trong bộ nhớ, cho unit test (không chia sẻ giữa các tiến trình). */
export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key, limit, windowSeconds) {
      const current = windows.get(key);
      const window =
        current && current.resetAt > now()
          ? current
          : { count: 0, resetAt: now() + windowSeconds * 1000 };
      window.count += 1;
      windows.set(key, window);
      return Promise.resolve({
        allowed: window.count <= limit,
        count: window.count,
        retryAfterSeconds: Math.ceil((window.resetAt - now()) / 1000),
      });
    },
    peek(key) {
      const window = windows.get(key);
      if (!window || window.resetAt <= now())
        return Promise.resolve({ count: 0, retryAfterSeconds: 0 });
      return Promise.resolve({
        count: window.count,
        retryAfterSeconds: Math.ceil((window.resetAt - now()) / 1000),
      });
    },
    reset(key) {
      windows.delete(key);
      return Promise.resolve();
    },
  };
}

/**
 * Middleware giới hạn số request theo IP cho một nhóm endpoint. Vượt giới hạn: 429 `rate_limited`
 * kèm `retryAfterSeconds` và header Retry-After.
 */
export function rateLimitByIp(
  limiter: RateLimiter,
  options: { name: string; limit: number; windowSeconds: number },
): RequestHandler {
  return async (req: Request, _res, next) => {
    const result = await limiter.hit(
      `ip:${options.name}:${req.ip ?? 'unknown'}`,
      options.limit,
      options.windowSeconds,
    );
    if (!result.allowed) {
      next(rateLimited(result.retryAfterSeconds));
      return;
    }
    next();
  };
}
