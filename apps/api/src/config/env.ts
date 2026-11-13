// Biến môi trường của API, kiểm tra bằng Zod khi khởi động. Thêm biến mới: khai báo ở đây VÀ trong .env.example.
import { z } from 'zod';

const commaList = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

/** Biến tùy chọn: dòng `KEY=` (rỗng) trong .env coi như không đặt. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'phải là URL postgres://…' }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  REDIS_URL: z.url({ protocol: /^rediss?$/, error: 'phải là URL redis://…' }),

  CORS_ORIGINS: commaList.pipe(z.array(z.url())).default(['http://localhost:5173']),

  // Kho lưu tệp tương thích S3 (SeaweedFS, D53). Khóa không có giá trị mặc định: phải khai báo rõ.
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET_PUBLIC: z.string().min(3).default('tps-public'),
  S3_BUCKET_PRIVATE: z.string().min(3).default('tps-private'),
  /** URL trình duyệt dùng để đọc tệp public. Bỏ trống: <S3_ENDPOINT>/<S3_BUCKET_PUBLIC>. */
  S3_PUBLIC_BASE_URL: optional(z.url()),
  /** Đặt CORS cho bucket theo CORS_ORIGINS khi khởi động (trình duyệt upload thẳng lên kho lưu trữ). */
  S3_CONFIGURE_CORS: z.stringbool().default(true),

  // Gửi email qua SMTP: Mailpit khi local, Gmail SMTP + App Password khi chạy thật.
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  /** true: TLS ngay từ đầu (cổng 465). false: STARTTLS nếu máy chủ hỗ trợ (cổng 587; Mailpit 1025). */
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: optional(z.string()),
  SMTP_PASS: optional(z.string()),
  /** Người gửi. Với Gmail phải trùng tài khoản SMTP_USER (hoặc alias đã xác minh). */
  EMAIL_FROM: z.string().min(3),

  /** Chạy worker BullMQ trong cùng tiến trình API. Tắt khi tách worker ra tiến trình riêng. */
  WORKERS_ENABLED: z.stringbool().default(true),
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
