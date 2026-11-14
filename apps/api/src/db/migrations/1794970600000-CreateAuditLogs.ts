import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nhật ký kiểm toán (docs/thiet_ke_co_so_du_lieu.md mục 10; C1, G3). Ghi mọi thao tác của Manager và Admin,
 * nhất là mỗi lần xem giấy tờ tùy thân. Chỉ ghi thêm: trigger chặn UPDATE, DELETE, TRUNCATE ngay trong
 * database (thiết kế còn hạn chế bằng quyền của user ứng dụng khi triển khai thật, G8).
 *
 * `entity_type` + `entity_id` (text) thay vì khóa ngoại: ghi được mọi loại thực thể và không bao giờ join
 * ngược. Không lưu dữ liệu cá nhân trong `metadata` (chỉ id, mã, loại).
 */
export class CreateAuditLogs1794970600000 implements MigrationInterface {
  name = 'CreateAuditLogs1794970600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        actor_user_id  uuid        REFERENCES users (id),
        actor_role     text        NOT NULL,
        action         text        NOT NULL,
        entity_type    text        NOT NULL,
        entity_id      text        NOT NULL,
        metadata       jsonb,
        ip_address     inet,
        created_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT audit_logs_actor_role_chk
          CHECK (actor_role IN ('manager', 'admin', 'system')),
        CONSTRAINT audit_logs_actor_chk
          CHECK ((actor_role = 'system') = (actor_user_id IS NULL)),
        CONSTRAINT audit_logs_action_chk CHECK (action ~ '^[a-z_]+\\.[a-z_]+$')
      )
    `);
    // Lịch sử của một thực thể (ai đã xem giấy tờ của yêu cầu này).
    await queryRunner.query(
      `CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC)`,
    );
    // Việc một người vận hành đã làm.
    await queryRunner.query(
      `CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC)`,
    );

    await queryRunner.query(`
      CREATE FUNCTION audit_logs_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER audit_logs_no_update_delete BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only()
    `);
    await queryRunner.query(`
      CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
        FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE audit_logs`);
    await queryRunner.query(`DROP FUNCTION audit_logs_append_only()`);
  }
}
