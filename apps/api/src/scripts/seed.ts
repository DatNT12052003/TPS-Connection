import { v7 as uuidv7 } from 'uuid';
import { loadEnv } from '../config/env.js';
import { createDataSource } from '../db/data-source.js';
import { importRegions, type RegionRow } from '../modules/catalog/import-regions.js';

const SUBJECTS: [string, string][] = [
  ['Toán', 'Mathematics'],
  ['Ngữ văn', 'Literature'],
  ['Tiếng Anh', 'English'],
  ['Vật lý', 'Physics'],
  ['Hóa học', 'Chemistry'],
];

// A sample for development only. Real data comes from catalog:import-regions.
const SAMPLE_REGIONS: RegionRow[] = [
  { code: 'DEV-HN', level: 'province', nameVi: 'Hà Nội', nameEn: 'Hanoi' },
  { code: 'DEV-HCM', level: 'province', nameVi: 'TP. Hồ Chí Minh', nameEn: 'Ho Chi Minh City' },
  {
    code: 'DEV-HN-1',
    level: 'commune',
    nameVi: 'Phường Ba Đình',
    nameEn: 'Ba Dinh Ward',
    parentCode: 'DEV-HN',
  },
  {
    code: 'DEV-HN-2',
    level: 'commune',
    nameVi: 'Phường Hoàn Kiếm',
    nameEn: 'Hoan Kiem Ward',
    parentCode: 'DEV-HN',
  },
  {
    code: 'DEV-HCM-1',
    level: 'commune',
    nameVi: 'Phường Sài Gòn',
    nameEn: 'Sai Gon Ward',
    parentCode: 'DEV-HCM',
  },
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
  for (let grade = 1; grade <= 12; grade += 1) {
    await db.query(
      `INSERT INTO grades (id, name_vi, name_en, sort_order) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name_vi) DO NOTHING`,
      [uuidv7(), `Lớp ${grade}`, `Grade ${grade}`, grade],
    );
  }
  await importRegions(db, SAMPLE_REGIONS);
  console.log(
    `Seeded ${SUBJECTS.length} subjects, 12 grades and ${SAMPLE_REGIONS.length} sample regions.`,
  );
} finally {
  await db.destroy();
}
