import { readFileSync } from 'node:fs';
import { loadEnv } from '../config/env.js';
import { createDataSource } from '../db/data-source.js';
import { importRegions, regionFileSchema } from '../modules/catalog/import-regions.js';

/*
 * Loads the official list of administrative units (AC-MOD-05.3).
 * The file is a JSON array: { code, level, nameVi, nameEn, parentCode? }
 *
 *   npm run catalog:import-regions -- path/to/regions.json
 */
const path = process.argv[2];
if (!path) throw new Error('Usage: npm run catalog:import-regions -- <file.json>');

const rows = regionFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
const env = loadEnv();
if (!env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is required');

const db = await createDataSource(env.MIGRATION_DATABASE_URL).initialize();
try {
  const count = await db.transaction((tx) => importRegions(tx, rows));
  console.log(`Imported ${count} regions.`);
} finally {
  await db.destroy();
}
