import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TutorProfiles1730000000003 implements MigrationInterface {
  name = 'TutorProfiles1730000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE regions (
        id uuid PRIMARY KEY,
        code text NOT NULL UNIQUE,
        parent_id uuid REFERENCES regions (id),
        level text NOT NULL CHECK (level IN ('province', 'commune')),
        name_vi text NOT NULL,
        name_en text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK ((level = 'province') = (parent_id IS NULL))
      )
    `);
    await queryRunner.query(`CREATE INDEX regions_parent_idx ON regions (parent_id)`);

    await queryRunner.query(`
      CREATE TABLE tutor_profiles (
        user_id uuid PRIMARY KEY REFERENCES users (id),
        legal_name text NOT NULL,
        tutor_type text NOT NULL CHECK (tutor_type IN ('student', 'teacher', 'freelance')),
        organization text,
        introduction text NOT NULL,
        experience text,
        teaching_method text,
        price_per_lesson_vnd bigint NOT NULL CHECK (price_per_lesson_vnd > 0),
        lesson_minutes integer NOT NULL CHECK (lesson_minutes > 0),
        teaching_modes text[] NOT NULL
          CHECK (cardinality(teaching_modes) > 0 AND teaching_modes <@ ARRAY['online', 'offline']),
        accepting_students boolean NOT NULL DEFAULT true,
        verification_status text NOT NULL DEFAULT 'incomplete'
          CHECK (verification_status IN
            ('incomplete', 'pending_review', 'verified', 'rejected', 'revoked')),
        student_label_expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX tutor_profiles_verified_idx ON tutor_profiles (user_id)
       WHERE verification_status = 'verified'`,
    );

    for (const [table, column, target] of [
      ['tutor_subjects', 'subject_id', 'subjects'],
      ['tutor_grades', 'grade_id', 'grades'],
      ['tutor_regions', 'region_id', 'regions'],
    ] as const) {
      await queryRunner.query(`
        CREATE TABLE ${table} (
          tutor_id uuid NOT NULL REFERENCES tutor_profiles (user_id) ON DELETE CASCADE,
          ${column} uuid NOT NULL REFERENCES ${target} (id),
          PRIMARY KEY (tutor_id, ${column})
        )
      `);
      await queryRunner.query(`CREATE INDEX ${table}_catalog_idx ON ${table} (${column})`);
    }

    await queryRunner.query(`
      CREATE TABLE tutor_availability (
        id uuid PRIMARY KEY,
        tutor_id uuid NOT NULL REFERENCES tutor_profiles (user_id) ON DELETE CASCADE,
        weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
        start_time time NOT NULL,
        end_time time NOT NULL,
        CHECK (start_time < end_time)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX tutor_availability_tutor_idx ON tutor_availability (tutor_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE tutor_availability`);
    await queryRunner.query(`DROP TABLE tutor_regions`);
    await queryRunner.query(`DROP TABLE tutor_grades`);
    await queryRunner.query(`DROP TABLE tutor_subjects`);
    await queryRunner.query(`DROP TABLE tutor_profiles`);
    await queryRunner.query(`DROP TABLE regions`);
  }
}
