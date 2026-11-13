import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extension và hàm dùng chung, theo docs/thiet_ke_co_so_du_lieu.md mục 1.6.
 * citext, unaccent, pg_trgm là extension "trusted" (PostgreSQL 13+): chủ database tạo được, không cần superuser.
 */
export class InitExtensions1794960000000 implements MigrationInterface {
  name = 'InitExtensions1794960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    // unaccent() không IMMUTABLE nên không dùng trực tiếp trong index được; bọc lại.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
        AS $$ SELECT public.unaccent('public.unaccent', $1) $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Giữ lại extension: các bảng về sau (cột citext, index trigram) phụ thuộc vào chúng.
    await queryRunner.query(`DROP FUNCTION IF EXISTS immutable_unaccent(text)`);
  }
}
