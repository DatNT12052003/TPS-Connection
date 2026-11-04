import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { connect, ownerDatabaseUrl } from './helpers.js';

describe('migrations', () => {
  let owner: DataSource;

  beforeAll(async () => {
    owner = await connect(ownerDatabaseUrl());
  });

  afterAll(async () => {
    await owner.query(`
      TRUNCATE outbox_events, rate_limit_events, consents, one_time_tokens, user_sessions,
               user_roles, students, files, users, grades CASCADE
    `);
    await owner.destroy();
  });

  it('reverts the latest two and applies them again with real data present', async () => {
    const userId = uuidv7();
    const fileId = uuidv7();
    const gradeId = uuidv7();
    const studentId = uuidv7();
    await owner.query(
      `TRUNCATE consents, students, files, users, grades, user_roles, user_sessions,
                one_time_tokens CASCADE`,
    );
    await owner.query(
      `INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, 'x', 'User')`,
      [userId, `migration-${userId}@example.com`],
    );
    await owner.query(
      `INSERT INTO files (id, owner_user_id, purpose, bucket, object_key, mime_type, size_bytes)
       VALUES ($1, $2, 'avatar', 'b', $3, 'image/webp', 1)`,
      [fileId, userId, `objects/${fileId}`],
    );
    await owner.query(`UPDATE users SET avatar_file_id = $1`, [fileId]);
    await owner.query(
      `INSERT INTO grades (id, name_vi, name_en, sort_order) VALUES ($1, 'L', 'G', 1)`,
      [gradeId],
    );
    await owner.query(
      `INSERT INTO students (id, guardian_user_id, nickname, grade_id) VALUES ($1, $2, 'Bi', $3)`,
      [studentId, userId, gradeId],
    );
    await owner.query(
      `INSERT INTO consents (id, user_id, document, version, accepted_at, student_id)
       VALUES ($1, $2, 'privacy_policy', 'v', now(), $3)`,
      [uuidv7(), userId, studentId],
    );

    await owner.query(
      `INSERT INTO tutor_profiles (user_id, legal_name, tutor_type, introduction,
         price_per_lesson_vnd, lesson_minutes, teaching_modes)
       VALUES ($1, 'L', 'teacher', 'I', 1, 60, '{online}')`,
      [userId],
    );

    await owner.undoLastMigration({ transaction: 'each' });
    await owner.undoLastMigration({ transaction: 'each' });
    const applied = await owner.runMigrations({ transaction: 'each' });

    expect(applied).toHaveLength(2);
    const [user] = await owner.query(`SELECT avatar_file_id FROM users WHERE id = $1`, [userId]);
    expect(user.avatar_file_id).toBeNull();
  });

  it('keeps the application role out of changing the audit log after running', async () => {
    const [grant] = await owner.query(
      `SELECT has_table_privilege('tps_app', 'audit_logs', 'UPDATE') AS can_update,
              has_table_privilege('tps_app', 'students', 'SELECT') AS can_read_students`,
    );
    expect(grant).toEqual({ can_update: false, can_read_students: true });
  });
});
