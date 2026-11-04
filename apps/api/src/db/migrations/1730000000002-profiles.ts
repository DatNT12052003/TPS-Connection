import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Profiles1730000000002 implements MigrationInterface {
  name = 'Profiles1730000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE grades (
        id uuid PRIMARY KEY,
        name_vi text NOT NULL UNIQUE,
        name_en text NOT NULL UNIQUE,
        sort_order integer NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE files (
        id uuid PRIMARY KEY,
        owner_user_id uuid NOT NULL REFERENCES users (id),
        purpose text NOT NULL CHECK (purpose IN ('avatar', 'verification_document', 'message_image')),
        bucket text NOT NULL,
        object_key text NOT NULL UNIQUE,
        mime_type text NOT NULL,
        size_bytes bigint NOT NULL CHECK (size_bytes > 0),
        completed_at timestamptz,
        deleted_at timestamptz,
        purged_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX files_owner_idx ON files (owner_user_id)`);
    await queryRunner.query(
      `CREATE INDEX files_to_purge_idx ON files (created_at) WHERE purged_at IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE users ADD CONSTRAINT users_avatar_file_fk
       FOREIGN KEY (avatar_file_id) REFERENCES files (id)`,
    );

    // No birth date or home address, on purpose (NFR-P01).
    await queryRunner.query(`
      CREATE TABLE students (
        id uuid PRIMARY KEY,
        guardian_user_id uuid REFERENCES users (id),
        user_id uuid UNIQUE REFERENCES users (id),
        nickname text NOT NULL,
        full_name text,
        grade_id uuid NOT NULL REFERENCES grades (id),
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX students_guardian_idx ON students (guardian_user_id) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE consents ADD CONSTRAINT consents_student_fk
       FOREIGN KEY (student_id) REFERENCES students (id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // These point at rows about to go. Left behind, they would stop up from running again.
    await queryRunner.query(`ALTER TABLE consents DROP CONSTRAINT consents_student_fk`);
    await queryRunner.query(`DELETE FROM consents WHERE student_id IS NOT NULL`);
    await queryRunner.query(`DROP TABLE students`);
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT users_avatar_file_fk`);
    await queryRunner.query(`UPDATE users SET avatar_file_id = NULL`);
    await queryRunner.query(`DROP TABLE files`);
    await queryRunner.query(`DROP TABLE grades`);
  }
}
