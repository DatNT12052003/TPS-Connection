import { pino } from 'pino';
import { sessionActorResolver } from './auth/session-actor.js';
import { authConfigFromEnv } from './auth/tokens.js';
import { loadEnv } from './config/env.js';
import { createDataSource } from './db/data-source.js';
import { createApp } from './http/app.js';
import { buildRoutes } from './routes.js';

const env = loadEnv();
const authConfig = authConfigFromEnv(env);
const logger = pino({ level: env.LOG_LEVEL });
const db = createDataSource(env.DATABASE_URL);
await db.initialize();

const app = createApp({
  routes: buildRoutes(db, authConfig),
  resolveActor: sessionActorResolver(db, authConfig),
  logger,
  webOrigins: env.WEB_ORIGINS,
});

const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'API listening'));

const shutdown = () => {
  server.close(() => {
    void db.destroy().finally(() => process.exit(0));
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
