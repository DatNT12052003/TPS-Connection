import type { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import type { Actor } from '../../auth/actor.js';
import { CURRENT_TERMS_VERSION } from '../auth/auth.service.js';
import { returnedRows, type Queryable } from '../../db/queryable.js';
import { ApiError, notFound } from '../../http/errors.js';
import { defineRoute } from '../../http/route.js';
import { guardianOfStudent, parentOnly } from '../../policies/students.policy.js';

const idParams = z.object({ id: z.uuid() });
const nickname = z.string().trim().min(1).max(50);
const fullName = z.string().trim().min(1).max(100).nullable();

const studentDto = z.object({
  id: z.uuid(),
  nickname: z.string(),
  fullName: z.string().nullable(),
  gradeId: z.uuid(),
  gradeNameVi: z.string(),
  gradeNameEn: z.string(),
});

type StudentRow = {
  id: string;
  nickname: string;
  full_name: string | null;
  grade_id: string;
  name_vi: string;
  name_en: string;
};

const toDto = (row: StudentRow) => ({
  id: row.id,
  nickname: row.nickname,
  fullName: row.full_name,
  gradeId: row.grade_id,
  gradeNameVi: row.name_vi,
  gradeNameEn: row.name_en,
});

const SELECT_STUDENT = `SELECT s.id, s.nickname, s.full_name, s.grade_id, g.name_vi, g.name_en
  FROM students s JOIN grades g ON g.id = s.grade_id`;

async function assertSelectableGrade(db: Queryable, gradeId: string): Promise<void> {
  const rows: unknown[] = await db.query(`SELECT 1 FROM grades WHERE id = $1 AND is_active`, [
    gradeId,
  ]);
  if (rows.length === 0) {
    throw new ApiError(422, 'INVALID_INPUT', 'Invalid input', [
      { path: 'body.gradeId', code: 'GRADE_NOT_SELECTABLE' },
    ]);
  }
}

const userIdOf = (actor: Actor): string => {
  if (actor.kind !== 'user') throw new Error('Policy lets only users through');
  return actor.userId;
};

/** The only way to list students: the guardian is part of the query, not a filter after it. */
async function studentsVisibleTo(
  db: Queryable,
  guardianId: string,
  { page, limit }: { page: number; limit: number },
) {
  const rows: StudentRow[] = await db.query(
    `${SELECT_STUDENT}
      WHERE s.guardian_user_id = $1 AND s.deleted_at IS NULL
      ORDER BY s.id
      LIMIT $2 OFFSET $3`,
    [guardianId, limit, (page - 1) * limit],
  );
  const [count]: { total: number }[] = await db.query(
    `SELECT count(*)::int AS total FROM students
      WHERE guardian_user_id = $1 AND deleted_at IS NULL`,
    [guardianId],
  );
  return { data: rows.map(toDto), page: { number: page, limit, total: count?.total ?? 0 } };
}

async function findStudent(db: Queryable, id: string) {
  const rows: StudentRow[] = await db.query(`${SELECT_STUDENT} WHERE s.id = $1`, [id]);
  if (!rows[0]) throw notFound();
  return toDto(rows[0]);
}

export const studentsRoutes = (db: DataSource) => [
  defineRoute({
    method: 'get',
    path: '/students',
    summary: 'List the student profiles this parent manages',
    tag: 'Students',
    input: {
      query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
    },
    policy: parentOnly,
    output: z.object({
      data: z.array(studentDto),
      page: z.object({ number: z.number(), limit: z.number(), total: z.number() }),
    }),
    handler: async ({ actor, query }) => studentsVisibleTo(db, userIdOf(actor), query),
  }),

  defineRoute({
    method: 'post',
    path: '/students',
    summary: 'Create a student profile, managed by the caller',
    tag: 'Students',
    input: {
      // Strict: no field can name another guardian or hold an address (AC-ACC-06.2, 06.4).
      body: z.strictObject({
        nickname,
        fullName: fullName.optional(),
        gradeId: z.uuid(),
        acceptedOnBehalf: z.literal(true),
      }),
    },
    policy: parentOnly,
    output: studentDto,
    successStatus: 201,
    handler: async ({ actor, body }) => {
      const guardianId = userIdOf(actor);
      await assertSelectableGrade(db, body.gradeId);
      const id = uuidv7();
      await db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO students (id, guardian_user_id, nickname, full_name, grade_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, guardianId, body.nickname, body.fullName ?? null, body.gradeId],
        );
        // The parent agrees on the child's behalf (NFR-P04).
        await tx.query(
          `INSERT INTO consents (id, user_id, document, version, accepted_at, student_id)
           VALUES ($1, $2, 'privacy_policy', $3, now(), $4)`,
          [uuidv7(), guardianId, CURRENT_TERMS_VERSION, id],
        );
      });
      return findStudent(db, id);
    },
  }),

  defineRoute({
    method: 'get',
    path: '/students/:id',
    summary: 'Get a student profile',
    tag: 'Students',
    input: { params: idParams },
    policy: guardianOfStudent(db),
    output: studentDto,
    handler: async ({ params }) => findStudent(db, params.id),
  }),

  defineRoute({
    method: 'patch',
    path: '/students/:id',
    summary: 'Change a student profile',
    tag: 'Students',
    input: {
      params: idParams,
      body: z.strictObject({
        nickname: nickname.optional(),
        fullName: fullName.optional(),
        gradeId: z.uuid().optional(),
      }),
    },
    policy: guardianOfStudent(db),
    output: studentDto,
    handler: async ({ params, body }) => {
      if (body.gradeId) await assertSelectableGrade(db, body.gradeId);
      await db.query(
        `UPDATE students
            SET nickname = COALESCE($2, nickname),
                full_name = CASE WHEN $3 THEN $4 ELSE full_name END,
                grade_id = COALESCE($5, grade_id),
                updated_at = now()
          WHERE id = $1`,
        [
          params.id,
          body.nickname ?? null,
          body.fullName !== undefined,
          body.fullName ?? null,
          body.gradeId ?? null,
        ],
      );
      return findStudent(db, params.id);
    },
  }),

  defineRoute({
    method: 'delete',
    path: '/students/:id',
    summary: 'Delete a student profile',
    tag: 'Students',
    input: { params: idParams },
    policy: guardianOfStudent(db),
    output: z.object({ status: z.literal('ok') }),
    handler: async ({ params }) => {
      // M3 must refuse this while the student has an active class (UC-ACC-06).
      returnedRows(
        await db.query(
          `UPDATE students SET deleted_at = now(), updated_at = now()
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING id`,
          [params.id],
        ),
      );
      return { status: 'ok' as const };
    },
  }),
];
