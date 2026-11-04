import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Foundation1730000000000 implements MigrationInterface {
  name = 'Foundation1730000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);

    await queryRunner.query(`
      CREATE TABLE subjects (
        id uuid PRIMARY KEY,
        name_vi text NOT NULL UNIQUE,
        name_en text NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY,
        actor_user_id uuid,
        action text NOT NULL,
        target_type text NOT NULL,
        target_id text,
        metadata jsonb NOT NULL DEFAULT '{}',
        ip inet,
        occurred_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX audit_logs_occurred_at_idx ON audit_logs (occurred_at)`);
    await queryRunner.query(
      `CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, occurred_at)`,
    );
    // Append-only for the application (NFR-S08).
    await queryRunner.query(`REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM tps_app`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE audit_logs`);
    await queryRunner.query(`DROP TABLE subjects`);
  }
}
