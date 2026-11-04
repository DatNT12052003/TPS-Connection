import { setTimeout as sleep } from 'node:timers/promises';
import { pino } from 'pino';
import { purgeExpiredRateLimits } from './auth/rate-limit.js';
import { loadEnv } from './config/env.js';
import { createDataSource } from './db/data-source.js';
import { smtpMailer } from './email/mailer.js';
import { s3FileStore, s3SettingsFromEnv } from './files/file-store.js';
import { purgeFiles } from './files/purge-files.js';
import { drainOutbox } from './outbox/process-outbox.js';

const POLL_MS = 2_000;
const PURGE_EVERY_MS = 60 * 60 * 1_000;

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL });
const db = await createDataSource(env.DATABASE_URL).initialize();
const deps = {
  db,
  logger,
  mailer: smtpMailer(env.SMTP_URL, env.MAIL_FROM),
  webBaseUrl: env.WEB_BASE_URL,
};

const fileStore = s3FileStore(s3SettingsFromEnv(env));

let running = true;
const stop = () => {
  running = false;
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

logger.info('Worker started');
let lastPurge = 0;
while (running) {
  try {
    await drainOutbox(deps);
    if (Date.now() - lastPurge >= PURGE_EVERY_MS) {
      await purgeExpiredRateLimits(db);
      await purgeFiles(db, fileStore);
      lastPurge = Date.now();
    }
  } catch (error) {
    // Likely the database is unreachable. Keep trying rather than exit.
    logger.error({ err: error }, 'Worker cycle failed');
  }
  await sleep(POLL_MS);
}
await db.destroy();
