import { pino, type Logger } from 'pino';
import type { Env } from '../config/env.js';

export type { Logger };

/** Không bao giờ ghi các trường này ra log (token, mật khẩu, cookie). */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
];

export function createLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: { service: 'api' },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    // Máy local: log dễ đọc. Máy chủ: JSON một dòng để gom log.
    ...(env.NODE_ENV === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' },
      },
    }),
  });
}
