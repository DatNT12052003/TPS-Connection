import { existsSync } from 'node:fs';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['silent', 'debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().min(1),
  MIGRATION_DATABASE_URL: z.string().min(1).optional(),
  WEB_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  // Optional here because migrations and seeds do not need it. See authConfigFromEnv.
  AUTH_SECRET: z.string().min(32).optional(),
  WEB_BASE_URL: z.url().default('http://localhost:5173'),
  SMTP_URL: z.string().min(1).default('smtp://localhost:1025'),
  S3_ENDPOINT: z.url().default('http://localhost:9000'),
  // Optional here for the same reason as AUTH_SECRET. See s3SettingsFromEnv.
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).default('TPS-Connection <no-reply@tps-connection.local>'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env && source.NODE_ENV !== 'production' && existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    // Names only: values may be secrets.
    const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment variables: ${names}`);
  }
  return parsed.data;
}
