import type { DataSource } from 'typeorm';
import { z } from 'zod';
import { defineRoute } from '../../http/route.js';
import { publicAccess } from '../../policies/policy.js';
import { SubjectEntity } from './subject.entity.js';

const subjectListDto = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      nameVi: z.string(),
      nameEn: z.string(),
    }),
  ),
});

const gradeListDto = z.object({
  data: z.array(z.object({ id: z.uuid(), nameVi: z.string(), nameEn: z.string() })),
});

const regionListDto = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      level: z.enum(['province', 'commune']),
      parentId: z.uuid().nullable(),
      nameVi: z.string(),
      nameEn: z.string(),
    }),
  ),
  page: z.object({ number: z.number(), limit: z.number(), total: z.number() }),
});

export const catalogRoutes = (db: DataSource) => [
  defineRoute({
    method: 'get',
    path: '/catalog/regions',
    summary: 'List active provinces, or the active communes of one province',
    tag: 'Catalog',
    input: {
      query: z.object({
        parentId: z.uuid().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(50),
      }),
    },
    policy: publicAccess,
    output: regionListDto,
    handler: async ({ query }) => {
      const { parentId, page, limit } = query;
      const where = `is_active AND ${parentId ? 'parent_id = $1' : "level = 'province' AND $1::uuid IS NULL"}`;
      const rows: {
        id: string;
        code: string;
        level: 'province' | 'commune';
        parent_id: string | null;
        name_vi: string;
        name_en: string;
      }[] = await db.query(
        `SELECT id, code, level, parent_id, name_vi, name_en FROM regions
          WHERE ${where} ORDER BY name_vi LIMIT $2 OFFSET $3`,
        [parentId ?? null, limit, (page - 1) * limit],
      );
      const [count]: { total: number }[] = await db.query(
        `SELECT count(*)::int AS total FROM regions WHERE ${where}`,
        [parentId ?? null],
      );
      return {
        data: rows.map((row) => ({
          id: row.id,
          code: row.code,
          level: row.level,
          parentId: row.parent_id,
          nameVi: row.name_vi,
          nameEn: row.name_en,
        })),
        page: { number: page, limit, total: count?.total ?? 0 },
      };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/catalog/grades',
    summary: 'List active grades',
    tag: 'Catalog',
    policy: publicAccess,
    output: gradeListDto,
    handler: async () => {
      const rows: { id: string; name_vi: string; name_en: string }[] = await db.query(
        `SELECT id, name_vi, name_en FROM grades WHERE is_active ORDER BY sort_order`,
      );
      return {
        data: rows.map((row) => ({ id: row.id, nameVi: row.name_vi, nameEn: row.name_en })),
      };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/catalog/subjects',
    summary: 'List active subjects',
    tag: 'Catalog',
    policy: publicAccess,
    output: subjectListDto,
    handler: async () => ({
      data: await db
        .getRepository(SubjectEntity)
        .find({ where: { isActive: true }, order: { nameVi: 'ASC' } }),
    }),
  }),
];
