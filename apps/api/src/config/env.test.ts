import { describe, expect, it } from '@jest/globals';
import { EnvError, loadEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://tps:secret@127.0.0.1:5433/tps',
  REDIS_URL: 'redis://127.0.0.1:6379',
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
    });
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
