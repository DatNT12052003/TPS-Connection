import { pino } from 'pino';
import type { Actor } from '../src/auth/actor.js';
import { createDataSource } from '../src/db/data-source.js';
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
  tutorVerified: false,
};
