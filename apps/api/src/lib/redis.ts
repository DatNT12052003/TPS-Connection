import { Redis } from 'ioredis';
import type { Logger } from './logger.js';

/**
 * Client Redis dùng chung (cache, rate limit, OTP). BullMQ (phần dịch vụ dùng chung) tạo kết nối riêng
 * vì cần `maxRetriesPerRequest: null`.
 * Khi Redis mất kết nối, ioredis tự kết nối lại; lệnh lỗi ngay thay vì treo (enableOfflineQueue: false).
 */
export function createRedis(url: string, logger: Logger): Redis {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectionName: 'tps-api',
  });

  // Chỉ log lần lỗi đầu tiên của mỗi đợt mất kết nối, tránh ngập log khi Redis tắt.
  let down = false;
  redis.on('error', (err) => {
    if (!down) logger.error({ err }, 'Redis connection error');
    down = true;
  });
  redis.on('ready', () => {
    if (down) logger.info('Redis reconnected');
    down = false;
  });

  return redis;
}
