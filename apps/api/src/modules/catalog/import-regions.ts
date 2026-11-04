import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import type { Queryable } from '../../db/queryable.js';

const regionRow = z.strictObject({
  code: z.string().trim().min(1).max(50),
  level: z.enum(['province', 'commune']),
  nameVi: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().min(1).max(200),
  /** Required for a commune, absent for a province. */
  parentCode: z.string().trim().min(1).max(50).optional(),
});

export const regionFileSchema = z.array(regionRow);
export type RegionRow = z.infer<typeof regionRow>;

/**
 * Adds or renames by code, so it can run again whenever the official list changes.
 * Nothing is deleted, because tutors may already refer to it (AC-MOD-05.2).
 * Call inside a transaction: one bad row must not leave half a list.
 */
export async function importRegions(db: Queryable, rows: RegionRow[]): Promise<number> {
  const inOrder = [...rows].sort((a, b) => a.level.localeCompare(b.level)).reverse();
  for (const row of inOrder) {
    let parentId: string | null = null;
    if (row.level === 'commune') {
      const parents: { id: string }[] = await db.query(
        `SELECT id FROM regions WHERE code = $1 AND level = 'province'`,
        [row.parentCode],
      );
      if (!parents[0]) throw new Error(`Region ${row.code}: no province ${row.parentCode}`);
      parentId = parents[0].id;
    }
    await db.query(
      `INSERT INTO regions (id, code, parent_id, level, name_vi, name_en)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (code) DO UPDATE
         SET parent_id = EXCLUDED.parent_id, name_vi = EXCLUDED.name_vi,
             name_en = EXCLUDED.name_en, updated_at = now()`,
      [uuidv7(), row.code, parentId, row.level, row.nameVi, row.nameEn],
    );
  }
  return rows.length;
}
