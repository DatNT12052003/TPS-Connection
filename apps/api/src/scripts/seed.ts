import { v7 as uuidv7 } from 'uuid';
import { loadEnv } from '../config/env.js';
import { createDataSource } from '../db/data-source.js';

const SUBJECTS: [string, string][] = [
  ['Toán', 'Mathematics'],
  ['Ngữ văn', 'Literature'],
  ['Tiếng Anh', 'English'],
  ['Vật lý', 'Physics'],
  ['Hóa học', 'Chemistry'],
];

const env = loadEnv();
if (env.NODE_ENV === 'production') throw new Error('Refusing to seed production');
if (!env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is required');

const db = await createDataSource(env.MIGRATION_DATABASE_URL).initialize();
try {
  for (const [nameVi, nameEn] of SUBJECTS) {
    await db.query(
      `INSERT INTO subjects (id, name_vi, name_en) VALUES ($1, $2, $3)
       ON CONFLICT (name_vi) DO NOTHING`,
      [uuidv7(), nameVi, nameEn],
    );
  }
  console.log(`Seeded ${SUBJECTS.length} subjects.`);
} finally {
  await db.destroy();
}
