import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Accounts1730000000001 implements MigrationInterface {
  name = 'Accounts1730000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        email citext NOT NULL,
        email_verified_at timestamptz,
        password_hash text NOT NULL,
        display_name text NOT NULL,
        phone text,
        avatar_file_id uuid,
        locale text NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi', 'en')),
        status text NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'temporarily_locked', 'locked')),
        deleted_at timestamptz,
        purge_after timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    // A deleted account's email can register again (BR-1307).
    await queryRunner.query(
      `CREATE UNIQUE INDEX users_email_active_key ON users (email) WHERE deleted_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE user_roles (
        user_id uuid NOT NULL REFERENCES users (id),
        role text NOT NULL CHECK (role IN ('tutor', 'parent', 'student', 'manager', 'admin')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, role)
      )
    `);

    // One row per refresh token. A family is one sign-in and all its rotations.
    await queryRunner.query(`
      CREATE TABLE user_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users (id),
        family_id uuid NOT NULL,
        refresh_token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        rotated_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX user_sessions_family_idx ON user_sessions (family_id)`);
    await queryRunner.query(`CREATE INDEX user_sessions_user_idx ON user_sessions (user_id)`);

    await queryRunner.query(`
      CREATE TABLE one_time_tokens (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users (id),
        purpose text NOT NULL
          CHECK (purpose IN ('verify_email', 'reset_password', 'change_email', 'student_invite')),
        token_hash text NOT NULL UNIQUE,
        payload jsonb NOT NULL DEFAULT '{}',
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX one_time_tokens_open_idx ON one_time_tokens (user_id, purpose)
       WHERE used_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE consents (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users (id),
        document text NOT NULL CHECK (document IN ('terms_of_service', 'privacy_policy')),
        version text NOT NULL,
        accepted_at timestamptz NOT NULL,
        student_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX consents_user_idx ON consents (user_id)`);

    await queryRunner.query(`
      CREATE TABLE outbox_events (
        id uuid PRIMARY KEY,
        type text NOT NULL,
        aggregate_id uuid NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}',
        occurred_at timestamptz NOT NULL DEFAULT now(),
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        failed_at timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX outbox_events_due_idx ON outbox_events (next_attempt_at)
       WHERE processed_at IS NULL AND failed_at IS NULL`,
    );

    // The bucket is a hash, so this table holds no email addresses.
    await queryRunner.query(`
      CREATE TABLE rate_limit_events (
        id uuid PRIMARY KEY,
        bucket text NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX rate_limit_events_bucket_idx ON rate_limit_events (bucket, occurred_at)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE rate_limit_events`);
    await queryRunner.query(`DROP TABLE outbox_events`);
    await queryRunner.query(`DROP TABLE consents`);
    await queryRunner.query(`DROP TABLE one_time_tokens`);
    await queryRunner.query(`DROP TABLE user_sessions`);
    await queryRunner.query(`DROP TABLE user_roles`);
    await queryRunner.query(`DROP TABLE users`);
  }
}
