import type { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { databaseAuditWriter } from '../../audit/audit-writer.js';
import type { Actor } from '../../auth/actor.js';
import type { Queryable } from '../../db/queryable.js';
import { ApiError, notFound } from '../../http/errors.js';
import { defineRoute } from '../../http/route.js';
import { adminOnly } from '../../policies/roles.policy.js';

const name = z.string().trim().min(1).max(200);
const idParams = z.object({ id: z.uuid() });
const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(50),
};
const pageDto = z.object({ number: z.number(), limit: z.number(), total: z.number() });

const isUniqueViolation = (error: unknown) =>
  (error as { driverError?: { code?: string } }).driverError?.code === '23505';

const duplicate = () => new ApiError(409, 'CATALOG_DUPLICATE', 'This entry already exists');

async function inAuditedTransaction<T>(
  db: DataSource,
  actor: Actor,
  entry: { action: string; targetType: string; targetId: string },
  work: (tx: Queryable) => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      const result = await work(tx);
      await databaseAuditWriter(tx)(actor, entry);
      return result;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicate();
    throw error;
  }
}

type Row = {
  id: string;
  name_vi: string;
  name_en: string;
  is_active: boolean;
  sort_order?: number;
  code?: string;
  level?: 'province' | 'commune';
  parent_id?: string | null;
};

const base = (row: Row) => ({
  id: row.id,
  nameVi: row.name_vi,
  nameEn: row.name_en,
  isActive: row.is_active,
});
const baseDto = z.object({
  id: z.uuid(),
  nameVi: z.string(),
  nameEn: z.string(),
  isActive: z.boolean(),
});

/** Only ever called with the fixed table names below, never with input. */
const list = async (db: Queryable, table: string, order: string, page: number, limit: number) => ({
  rows: (await db.query(`SELECT * FROM ${table} ORDER BY ${order} LIMIT $1 OFFSET $2`, [
    limit,
    (page - 1) * limit,
  ])) as Row[],
  total: ((await db.query(`SELECT count(*)::int AS total FROM ${table}`)) as { total: number }[])[0]
    ?.total as number,
});

const findRow = async (db: Queryable, table: string, id: string): Promise<Row> => {
  const rows: Row[] = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound();
  return rows[0];
};

/**
 * There is no way to delete an entry: tutors and students may refer to it, so it can
 * only be switched off, and old records keep showing its name (AC-MOD-05.2).
 */
const updateCommon = (
  tx: Queryable,
  table: string,
  id: string,
  body: { nameVi?: string; nameEn?: string; isActive?: boolean },
) =>
  tx.query(
    `UPDATE ${table}
        SET name_vi = COALESCE($2, name_vi), name_en = COALESCE($3, name_en),
            is_active = COALESCE($4, is_active), updated_at = now()
      WHERE id = $1`,
    [id, body.nameVi ?? null, body.nameEn ?? null, body.isActive ?? null],
  );

const updateBody = {
  nameVi: name.optional(),
  nameEn: name.optional(),
  isActive: z.boolean().optional(),
};

export const adminCatalogRoutes = (db: DataSource) => [
  // Subjects
  defineRoute({
    method: 'get',
    path: '/admin/catalog/subjects',
    summary: 'List all subjects, including switched-off ones',
    tag: 'Admin catalog',
    input: { query: z.object(pageQuery) },
    policy: adminOnly,
    output: z.object({ data: z.array(baseDto), page: pageDto }),
    handler: async ({ query }) => {
      const { rows, total } = await list(db, 'subjects', 'name_vi', query.page, query.limit);
      return { data: rows.map(base), page: { number: query.page, limit: query.limit, total } };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/catalog/subjects',
    summary: 'Add a subject',
    tag: 'Admin catalog',
    input: { body: z.strictObject({ nameVi: name, nameEn: name }) },
    policy: adminOnly,
    output: baseDto,
    successStatus: 201,
    handler: async ({ actor, body }) => {
      const id = uuidv7();
      await inAuditedTransaction(
        db,
        actor,
        { action: 'catalog.subject.created', targetType: 'subject', targetId: id },
        (tx) =>
          tx.query(`INSERT INTO subjects (id, name_vi, name_en) VALUES ($1, $2, $3)`, [
            id,
            body.nameVi,
            body.nameEn,
          ]),
      );
      return base(await findRow(db, 'subjects', id));
    },
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/catalog/subjects/:id',
    summary: 'Rename a subject or switch it on or off',
    tag: 'Admin catalog',
    input: { params: idParams, body: z.strictObject(updateBody) },
    policy: adminOnly,
    output: baseDto,
    handler: async ({ actor, params, body }) => {
      await findRow(db, 'subjects', params.id);
      await inAuditedTransaction(
        db,
        actor,
        { action: 'catalog.subject.updated', targetType: 'subject', targetId: params.id },
        (tx) => updateCommon(tx, 'subjects', params.id, body),
      );
      return base(await findRow(db, 'subjects', params.id));
    },
  }),

  // Grades
  defineRoute({
    method: 'get',
    path: '/admin/catalog/grades',
    summary: 'List all grades, including switched-off ones',
    tag: 'Admin catalog',
    input: { query: z.object(pageQuery) },
    policy: adminOnly,
    output: z.object({ data: z.array(baseDto.extend({ sortOrder: z.number() })), page: pageDto }),
    handler: async ({ query }) => {
      const { rows, total } = await list(db, 'grades', 'sort_order', query.page, query.limit);
      return {
        data: rows.map((row) => ({ ...base(row), sortOrder: row.sort_order as number })),
        page: { number: query.page, limit: query.limit, total },
      };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/catalog/grades',
    summary: 'Add a grade',
    tag: 'Admin catalog',
    input: {
      body: z.strictObject({ nameVi: name, nameEn: name, sortOrder: z.number().int().min(0) }),
    },
    policy: adminOnly,
    output: baseDto.extend({ sortOrder: z.number() }),
    successStatus: 201,
    handler: async ({ actor, body }) => {
      const id = uuidv7();
      await inAuditedTransaction(
        db,
        actor,
        { action: 'catalog.grade.created', targetType: 'grade', targetId: id },
        (tx) =>
          tx.query(
            `INSERT INTO grades (id, name_vi, name_en, sort_order) VALUES ($1, $2, $3, $4)`,
            [id, body.nameVi, body.nameEn, body.sortOrder],
          ),
      );
      const row = await findRow(db, 'grades', id);
      return { ...base(row), sortOrder: row.sort_order as number };
    },
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/catalog/grades/:id',
    summary: 'Rename a grade or switch it on or off',
    tag: 'Admin catalog',
    input: { params: idParams, body: z.strictObject(updateBody) },
    policy: adminOnly,
    output: baseDto.extend({ sortOrder: z.number() }),
    handler: async ({ actor, params, body }) => {
      await findRow(db, 'grades', params.id);
      await inAuditedTransaction(
        db,
        actor,
        { action: 'catalog.grade.updated', targetType: 'grade', targetId: params.id },
        (tx) => updateCommon(tx, 'grades', params.id, body),
      );
      const row = await findRow(db, 'grades', params.id);
      return { ...base(row), sortOrder: row.sort_order as number };
    },
  }),

  // Regions
  defineRoute({
    method: 'get',
    path: '/admin/catalog/regions',
    summary: 'List provinces, or the communes of one province, including switched-off ones',
    tag: 'Admin catalog',
    input: { query: z.object({ ...pageQuery, parentId: z.uuid().optional() }) },
    policy: adminOnly,
    output: z.object({ data: z.array(regionDto()), page: pageDto }),
    handler: async ({ query }) => {
      const { page, limit, parentId } = query;
      const where = parentId ? 'parent_id = $1' : `level = 'province' AND $1::uuid IS NULL`;
      const rows: Row[] = await db.query(
        `SELECT * FROM regions WHERE ${where} ORDER BY name_vi LIMIT $2 OFFSET $3`,
        [parentId ?? null, limit, (page - 1) * limit],
      );
      const [count]: { total: number }[] = await db.query(
        `SELECT count(*)::int AS total FROM regions WHERE ${where}`,
        [parentId ?? null],
      );
      return {
        data: rows.map(toRegion),
        page: { number: page, limit, total: count?.total ?? 0 },
      };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/catalog/regions',
    summary: 'Add a province, or a commune under a province',
    tag: 'Admin catalog',
    input: {
      body: z.strictObject({
        code: z.string().trim().min(1).max(50),
        nameVi: name,
        nameEn: name,
        parentId: z.uuid().optional(),
      }),
    },
    policy: adminOnly,
    output: regionDto(),
    successStatus: 201,
    handler: async ({ actor, body }) => {
      if (body.parentId) {
        const parents: unknown[] = await db.query(
          `SELECT 1 FROM regions WHERE id = $1 AND level = 'province'`,
          [body.parentId],
        );
        if (parents.length === 0) {
          throw new ApiError(422, 'INVALID_INPUT', 'Invalid input', [
            { path: 'body.parentId', code: 'PARENT_NOT_A_PROVINCE' },
          ]);
        }
      }
      const id = uuidv7();
      await inAuditedTransaction(
        db,
        actor,
        { action: 'catalog.region.created', targetType: 'region', targetId: id },
        (tx) =>
          tx.query(
            `INSERT INTO regions (id, code, parent_id, level, name_vi, name_en)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              id,
              body.code,
              body.parentId ?? null,
              body.parentId ? 'commune' : 'province',
              body.nameVi,
              body.nameEn,
            ],
          ),
      );
      return toRegion(await findRow(db, 'regions', id));
    },
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/catalog/regions/:id',
    summary: 'Rename a region or switch it on or off',
    tag: 'Admin catalog',
    input: { params: idParams, body: z.strictObject(updateBody) },
    policy: adminOnly,
    output: regionDto(),
    handler: async ({ actor, params, body }) => {
      await findRow(db, 'regions', params.id);
      await inAuditedTransaction(
        db,
        actor,
        { action: 'catalog.region.updated', targetType: 'region', targetId: params.id },
        (tx) => updateCommon(tx, 'regions', params.id, body),
      );
      return toRegion(await findRow(db, 'regions', params.id));
    },
  }),
];

function regionDto() {
  return baseDto.extend({
    code: z.string(),
    level: z.enum(['province', 'commune']),
    parentId: z.uuid().nullable(),
  });
}

function toRegion(row: Row) {
  return {
    ...base(row),
    code: row.code as string,
    level: row.level as 'province' | 'commune',
    parentId: row.parent_id ?? null,
  };
}
