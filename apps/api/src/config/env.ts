// Biến môi trường của API, kiểm tra bằng Zod khi khởi động. Thêm biến mới: khai báo ở đây VÀ trong .env.example.
import { z } from 'zod';

const commaList = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'phải là URL postgres://…' }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  REDIS_URL: z.url({ protocol: /^rediss?$/, error: 'phải là URL redis://…' }),

  CORS_ORIGINS: commaList.pipe(z.array(z.url())).default(['http://localhost:5173']),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {
  constructor(details: string) {
    super(
      `Biến môi trường không hợp lệ:\n${details}\n` +
        'Chép apps/api/.env.example thành apps/api/.env rồi sửa (xem README).',
    );
    this.name = 'EnvError';
  }
}

/** Đọc và kiểm tra biến môi trường. Ném EnvError liệt kê từng biến sai. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(z.prettifyError(result.error));
  }
  return result.data;
}
