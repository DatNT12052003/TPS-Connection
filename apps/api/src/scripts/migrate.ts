import { loadEnv } from '../config/env.js';
import { createDataSource } from '../db/data-source.js';

const direction = process.argv[2];
if (direction !== 'up' && direction !== 'down') {
  throw new Error('Usage: migrate.ts up|down');
}

const env = loadEnv();
if (!env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is required');

const db = await createDataSource(env.MIGRATION_DATABASE_URL).initialize();
try {
  if (direction === 'up') {
    const applied = await db.runMigrations({ transaction: 'each' });
    console.log(`Applied ${applied.length} migration(s).`);
  } else {
    await db.undoLastMigration({ transaction: 'each' });
    console.log('Reverted the last migration.');
  }
} finally {
  await db.destroy();
}
