import { pino } from 'pino';
import type { Actor } from '../src/auth/actor.js';
import type { AuthConfig } from '../src/auth/tokens.js';
import { createDataSource } from '../src/db/data-source.js';
import { s3FileStore, type FileStore } from '../src/files/file-store.js';
import { createApp } from '../src/http/app.js';
import type { AnyRoute } from '../src/http/route.js';

export const appDatabaseUrl = () => process.env.DATABASE_URL as string;
export const ownerDatabaseUrl = () => process.env.MIGRATION_DATABASE_URL as string;

export const connect = (url = appDatabaseUrl()) => createDataSource(url).initialize();

export const testApp = (routes: AnyRoute[], actor: Actor = { kind: 'guest' }) =>
  createApp({
    routes,
    resolveActor: async () => actor,
    logger: pino({ level: 'silent' }),
    webOrigins: ['http://localhost:5173'],
  });

export const parent: Actor = {
  kind: 'user',
  userId: '00000000-0000-7000-8000-000000000001',
  role: 'parent',
  emailVerified: true,
  tutorVerified: false,
  familyId: '00000000-0000-7000-8000-0000000000f1',
  csrfToken: 'test-csrf-token',
};

export const authConfig: AuthConfig = {
  secret: 'test-secret-test-secret-test-secret',
  cookieSecure: true,
};

/** For tests that never touch files. Any use fails loudly. */
export const noFileStore = {} as FileStore;

export const realFileStore = () =>
  s3FileStore({
    endpoint: 'http://localhost:9000',
    accessKeyId: 'tps_s3',
    secretAccessKey: 'tps_s3_dev',
  });
