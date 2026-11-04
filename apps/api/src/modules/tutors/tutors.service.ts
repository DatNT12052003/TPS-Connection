import type { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import type { Queryable } from '../../db/queryable.js';
import { ApiError } from '../../http/errors.js';

export type TeachingMode = 'online' | 'offline';
export type TutorType = 'student' | 'teacher' | 'freelance';
export type VerificationStatus =
  'incomplete' | 'pending_review' | 'verified' | 'rejected' | 'revoked';

export type ProfileInput = {
  legalName: string;
  tutorType: TutorType;
  organization?: string | null;
  introduction: string;
  experience?: string | null;
  teachingMethod?: string | null;
  pricePerLessonVnd: number;
  lessonMinutes: number;
  teachingModes: TeachingMode[];
  acceptingStudents: boolean;
  subjectIds: string[];
  gradeIds: string[];
  regionIds: string[];
  availability: { weekday: number; startTime: string; endTime: string }[];
};

type ProfileRow = {
  legal_name: string;
  tutor_type: TutorType;
  organization: string | null;
  introduction: string;
  experience: string | null;
  teaching_method: string | null;
  price_per_lesson_vnd: string;
  lesson_minutes: number;
  teaching_modes: TeachingMode[];
  accepting_students: boolean;
  verification_status: VerificationStatus;
};

const CATALOGS = [
  { table: 'subjects', link: 'tutor_subjects', column: 'subject_id', field: 'subjectIds' },
  { table: 'grades', link: 'tutor_grades', column: 'grade_id', field: 'gradeIds' },
  { table: 'regions', link: 'tutor_regions', column: 'region_id', field: 'regionIds' },
] as const;

const linkedIds = async (db: Queryable, link: string, column: string, tutorId: string) =>
  (
    (await db.query(`SELECT ${column} AS id FROM ${link} WHERE tutor_id = $1`, [tutorId])) as {
      id: string;
    }[]
  ).map((row) => row.id);

/** The database answers HH:MM:SS. People enter HH:MM, so that is what reads back. */
const toMinutes = (time: string) => time.slice(0, 5);

export const tutorsService = (db: DataSource) => ({
  async findOwnProfile(tutorId: string) {
    const rows: ProfileRow[] = await db.query(`SELECT * FROM tutor_profiles WHERE user_id = $1`, [
      tutorId,
    ]);
    const row = rows[0];
    if (!row) return { verificationStatus: 'incomplete' as const, profile: null };

    const availability: { weekday: number; start_time: string; end_time: string }[] =
      await db.query(
        `SELECT weekday, start_time, end_time FROM tutor_availability
          WHERE tutor_id = $1 ORDER BY weekday, start_time`,
        [tutorId],
      );
    return {
      verificationStatus: row.verification_status,
      profile: {
        legalName: row.legal_name,
        tutorType: row.tutor_type,
        organization: row.organization,
        introduction: row.introduction,
        experience: row.experience,
        teachingMethod: row.teaching_method,
        pricePerLessonVnd: Number(row.price_per_lesson_vnd),
        lessonMinutes: row.lesson_minutes,
        teachingModes: row.teaching_modes,
        acceptingStudents: row.accepting_students,
        subjectIds: await linkedIds(db, 'tutor_subjects', 'subject_id', tutorId),
        gradeIds: await linkedIds(db, 'tutor_grades', 'grade_id', tutorId),
        regionIds: await linkedIds(db, 'tutor_regions', 'region_id', tutorId),
        availability: availability.map((slot) => ({
          weekday: slot.weekday,
          startTime: toMinutes(slot.start_time),
          endTime: toMinutes(slot.end_time),
        })),
      },
    };
  },

  async saveOwnProfile(tutorId: string, input: ProfileInput): Promise<void> {
    await db.transaction(async (tx) => {
      const current: { legal_name: string; verification_status: VerificationStatus }[] =
        await tx.query(
          `SELECT legal_name, verification_status FROM tutor_profiles
            WHERE user_id = $1 FOR UPDATE`,
          [tutorId],
        );
      // The name was checked against an ID card. Changing it needs a new check (BR-209).
      if (
        current[0]?.verification_status === 'verified' &&
        current[0].legal_name !== input.legalName
      ) {
        throw new ApiError(409, 'REVERIFICATION_REQUIRED', 'Changing the name needs verification');
      }

      // An entry switched off later stays on the profiles that have it, but nobody
      // can newly choose it (AC-MOD-05.2).
      const fieldErrors = [];
      for (const { table, link, column, field } of CATALOGS) {
        const held = await linkedIds(tx, link, column, tutorId);
        const usable: unknown[] = await tx.query(
          `SELECT 1 FROM ${table}
            WHERE id = ANY($1::uuid[]) AND (is_active OR id = ANY($2::uuid[]))`,
          [input[field], held],
        );
        if (usable.length !== new Set(input[field]).size) {
          fieldErrors.push({ path: `body.${field}`, code: 'NOT_SELECTABLE' });
        }
      }
      if (fieldErrors.length > 0) {
        throw new ApiError(422, 'INVALID_INPUT', 'Invalid input', fieldErrors);
      }

      await tx.query(
        `INSERT INTO tutor_profiles (user_id, legal_name, tutor_type, organization, introduction,
           experience, teaching_method, price_per_lesson_vnd, lesson_minutes, teaching_modes,
           accepting_students)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (user_id) DO UPDATE
           SET legal_name = EXCLUDED.legal_name, tutor_type = EXCLUDED.tutor_type,
               organization = EXCLUDED.organization, introduction = EXCLUDED.introduction,
               experience = EXCLUDED.experience, teaching_method = EXCLUDED.teaching_method,
               price_per_lesson_vnd = EXCLUDED.price_per_lesson_vnd,
               lesson_minutes = EXCLUDED.lesson_minutes,
               teaching_modes = EXCLUDED.teaching_modes,
               accepting_students = EXCLUDED.accepting_students,
               updated_at = now()`,
        [
          tutorId,
          input.legalName,
          input.tutorType,
          input.organization ?? null,
          input.introduction,
          input.experience ?? null,
          input.teachingMethod ?? null,
          input.pricePerLessonVnd,
          input.lessonMinutes,
          input.teachingModes,
          input.acceptingStudents,
        ],
      );

      for (const { link, column, field } of CATALOGS) {
        await tx.query(`DELETE FROM ${link} WHERE tutor_id = $1`, [tutorId]);
        await tx.query(
          `INSERT INTO ${link} (tutor_id, ${column})
           SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
          [tutorId, input[field]],
        );
      }

      await tx.query(`DELETE FROM tutor_availability WHERE tutor_id = $1`, [tutorId]);
      for (const slot of input.availability) {
        await tx.query(
          `INSERT INTO tutor_availability (id, tutor_id, weekday, start_time, end_time)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv7(), tutorId, slot.weekday, slot.startTime, slot.endTime],
        );
      }
    });
  },

  /** Answers undefined unless this tutor may be shown to the public (AC-MKT-05.3). */
  async findPublicTutor(tutorId: string) {
    const rows: {
      display_name: string;
      avatar_file_id: string | null;
      introduction: string;
      experience: string | null;
      teaching_method: string | null;
      price_per_lesson_vnd: string;
      lesson_minutes: number;
      teaching_modes: TeachingMode[];
      accepting_students: boolean;
    }[] = await db.query(
      `SELECT u.display_name, u.avatar_file_id, p.introduction, p.experience, p.teaching_method,
              p.price_per_lesson_vnd, p.lesson_minutes, p.teaching_modes, p.accepting_students
         FROM tutor_profiles p JOIN users u ON u.id = p.user_id
        WHERE p.user_id = $1 AND p.verification_status = 'verified'
          AND u.deleted_at IS NULL AND u.status = 'active'`,
      [tutorId],
    );
    const row = rows[0];
    if (!row) return undefined;

    const named = (sql: string) =>
      db.query(sql, [tutorId]) as Promise<{ id: string; name_vi: string; name_en: string }[]>;
    const toNames = (items: { id: string; name_vi: string; name_en: string }[]) =>
      items.map((item) => ({ id: item.id, nameVi: item.name_vi, nameEn: item.name_en }));

    return {
      id: tutorId,
      displayName: row.display_name,
      avatarFileId: row.avatar_file_id,
      introduction: row.introduction,
      experience: row.experience,
      teachingMethod: row.teaching_method,
      pricePerLessonVnd: Number(row.price_per_lesson_vnd),
      lessonMinutes: row.lesson_minutes,
      teachingModes: row.teaching_modes,
      acceptingStudents: row.accepting_students,
      subjects: toNames(
        await named(
          `SELECT s.id, s.name_vi, s.name_en FROM tutor_subjects t
             JOIN subjects s ON s.id = t.subject_id
            WHERE t.tutor_id = $1 ORDER BY s.name_vi`,
        ),
      ),
      grades: toNames(
        await named(
          `SELECT g.id, g.name_vi, g.name_en FROM tutor_grades t
             JOIN grades g ON g.id = t.grade_id
            WHERE t.tutor_id = $1 ORDER BY g.sort_order`,
        ),
      ),
      // Provinces only: a commune narrows down where a person lives or teaches (BR-301).
      provinces: toNames(
        await named(
          `SELECT DISTINCT p.id, p.name_vi, p.name_en FROM tutor_regions t
             JOIN regions r ON r.id = t.region_id
             JOIN regions p ON p.id = COALESCE(r.parent_id, r.id)
            WHERE t.tutor_id = $1 ORDER BY p.name_vi`,
        ),
      ),
    };
  },
});
