import { createDataSource } from '../src/db/data-source.js';

const OWNER_URL = 'postgres://tps_owner:tps_owner_dev@localhost:5433/tps_test';

export async function setup() {
  const db = await createDataSource(OWNER_URL).initialize();
  try {
    await db.runMigrations({ transaction: 'each' });
  } finally {
    await db.destroy();
  }
}
