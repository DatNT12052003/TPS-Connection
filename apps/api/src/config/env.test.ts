import { describe, expect, it } from '@jest/globals';
import { EnvError, loadEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://tps:secret@127.0.0.1:5433/tps',
  REDIS_URL: 'redis://127.0.0.1:6379',
  S3_ENDPOINT: 'http://127.0.0.1:8333',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  SMTP_HOST: '127.0.0.1',
  EMAIL_FROM: 'TPS-Connection <no-reply@tps-connection.local>',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(valid);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_POOL_MAX: 10,
      CORS_ORIGINS: ['http://localhost:5173'],
      S3_BUCKET_PUBLIC: 'tps-public',
      S3_BUCKET_PRIVATE: 'tps-private',
      S3_CONFIGURE_CORS: true,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      WORKERS_ENABLED: true,
    });
  });

  it('treats an empty optional variable (KEY=) as not set', () => {
    const env = loadEnv({ ...valid, S3_PUBLIC_BASE_URL: '', SMTP_USER: '' });
    expect(env.S3_PUBLIC_BASE_URL).toBeUndefined();
    expect(env.SMTP_USER).toBeUndefined();
  });

  it('parses boolean flags written as text', () => {
    const env = loadEnv({ ...valid, SMTP_SECURE: 'true', WORKERS_ENABLED: 'false' });
    expect(env.SMTP_SECURE).toBe(true);
    expect(env.WORKERS_ENABLED).toBe(false);
  });

  it('requires storage keys and SMTP settings without defaults', () => {
    const { S3_ACCESS_KEY: _key, SMTP_HOST: _host, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrow(EnvError);
    expect(() => loadEnv(rest)).toThrow(/S3_ACCESS_KEY/);
    expect(() => loadEnv(rest)).toThrow(/SMTP_HOST/);
  });

  it('coerces numbers and splits CORS_ORIGINS', () => {
    const env = loadEnv({
      ...valid,
      PORT: '4000',
      CORS_ORIGINS: 'http://localhost:5173, https://tps.vn',
    });
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://tps.vn']);
  });

  it('names every missing or invalid variable', () => {
    expect.assertions(4);
    try {
      loadEnv({ REDIS_URL: 'http://not-redis', PORT: 'abc' });
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      const message = (err as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('REDIS_URL');
      expect(message).toContain('PORT');
    }
  });
});
