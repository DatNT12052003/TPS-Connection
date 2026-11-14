import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Biện pháp với tài khoản (docs/thiet_ke_co_so_du_lieu.md mục 10; G3 đợt 3) và index tìm tài khoản cho Admin.
 *
 * - `account_sanctions`: mỗi lần cảnh cáo / hạn chế / khóa là một dòng, mở khóa ghi `lifted_at`. `users.status`
 *   là trạng thái hiện tại; bảng này là lịch sử và lý do. G3 chỉ dùng `lock` (Admin khóa tay). Khóa ngoại
 *   `case_id → moderation_cases` thêm ở G8 cùng bảng vụ việc kiểm duyệt.
 * - Mỗi tài khoản chỉ có một lần khóa đang hiệu lực (partial unique index).
 * - `users_search_trgm_idx`: tìm theo tên không dấu hoặc email (pg_trgm, `ILIKE '%…%'`).
 */
export class CreateAccountSanctions1794970700000 implements MigrationInterface {
  name = 'CreateAccountSanctions1794970700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE account_sanctions (
        id          uuid        PRIMARY KEY DEFAULT uuidv7(),
        user_id     uuid        NOT NULL REFERENCES users (id),
        type        text        NOT NULL,
        reason      text        NOT NULL,
        case_id     uuid,
        starts_at   timestamptz NOT NULL DEFAULT now(),
        ends_at     timestamptz,
        lifted_at   timestamptz,
        lifted_by   uuid        REFERENCES users (id),
        created_by  uuid        NOT NULL REFERENCES users (id),
        created_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT account_sanctions_type_chk CHECK (type IN ('warning', 'restriction', 'lock')),
        CONSTRAINT account_sanctions_reason_chk CHECK (length(btrim(reason)) > 0),
        CONSTRAINT account_sanctions_period_chk CHECK (ends_at IS NULL OR ends_at > starts_at),
        CONSTRAINT account_sanctions_lifted_chk CHECK (lifted_by IS NULL OR lifted_at IS NOT NULL)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX account_sanctions_user_idx ON account_sanctions (user_id) WHERE lifted_at IS NULL`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX account_sanctions_active_lock_uq ON account_sanctions (user_id)
        WHERE type = 'lock' AND lifted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX users_search_trgm_idx ON users USING gin (
        (immutable_unaccent(lower(display_name || ' ' || coalesce(full_name, '') || ' ' || coalesce(email, ''))))
        gin_trgm_ops
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX users_search_trgm_idx`);
    await queryRunner.query(`DROP TABLE account_sanctions`);
  }
}
