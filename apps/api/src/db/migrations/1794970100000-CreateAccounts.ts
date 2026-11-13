import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tài khoản, phân quyền và tệp (docs/thiet_ke_co_so_du_lieu.md mục 4).
 * Khóa chính uuid sinh bằng uuidv7() của PostgreSQL 18: có thứ tự thời gian, không lộ số lượng bản ghi.
 * `user_consents.learner_id` chưa có khóa ngoại: bảng `learners` tạo ở migration hồ sơ (G2 phần 4).
 */
export class CreateAccounts1794970100000 implements MigrationInterface {
  name = 'CreateAccounts1794970100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
        email              citext,
        email_verified_at  timestamptz,
        password_hash      text,
        phone              text,
        phone_verified_at  timestamptz,
        display_name       text        NOT NULL,
        full_name          text,
        avatar_file_id     uuid,
        locale             text        NOT NULL DEFAULT 'vi',
        status             text        NOT NULL DEFAULT 'active',
        last_login_at      timestamptz,
        deleted_at         timestamptz,
        anonymized_at      timestamptz,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_locale_chk CHECK (locale IN ('vi', 'en')),
        CONSTRAINT users_status_chk CHECK (status IN ('active', 'restricted', 'locked')),
        CONSTRAINT users_anonymized_after_delete_chk CHECK (anonymized_at IS NULL OR deleted_at IS NOT NULL),
        CONSTRAINT users_email_required_chk CHECK (email IS NOT NULL OR anonymized_at IS NOT NULL),
        CONSTRAINT users_display_name_chk CHECK (length(btrim(display_name)) > 0)
      )
    `);
    // Email dùng lại được khi tài khoản cũ đã xóa.
    await queryRunner.query(
      `CREATE UNIQUE INDEX users_email_uq ON users (email) WHERE deleted_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE roles (
        code      text    PRIMARY KEY,
        name_vi   text    NOT NULL,
        name_en   text    NOT NULL,
        is_staff  boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(`
      INSERT INTO roles (code, name_vi, name_en, is_staff) VALUES
        ('tutor',   'Gia sư',           'Tutor',   false),
        ('parent',  'Phụ huynh',        'Parent',  false),
        ('student', 'Học sinh',         'Student', false),
        ('manager', 'Người kiểm duyệt', 'Manager', true),
        ('admin',   'Quản trị viên',    'Admin',   true)
    `);

    await queryRunner.query(`
      CREATE TABLE user_roles (
        id          uuid        PRIMARY KEY DEFAULT uuidv7(),
        user_id     uuid        NOT NULL REFERENCES users (id),
        role_code   text        NOT NULL REFERENCES roles (code),
        granted_at  timestamptz NOT NULL DEFAULT now(),
        granted_by  uuid        REFERENCES users (id),
        revoked_at  timestamptz,
        revoked_by  uuid        REFERENCES users (id),
        CONSTRAINT user_roles_revoked_by_chk CHECK (revoked_by IS NULL OR revoked_at IS NOT NULL)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX user_roles_active_uq ON user_roles (user_id, role_code) WHERE revoked_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE auth_sessions (
        id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
        user_id             uuid        NOT NULL REFERENCES users (id),
        family_id           uuid        NOT NULL,
        refresh_token_hash  text        NOT NULL,
        user_agent          text,
        ip_address          inet,
        expires_at          timestamptz NOT NULL,
        rotated_at          timestamptz,
        revoked_at          timestamptz,
        revoke_reason       text,
        created_at          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT auth_sessions_refresh_token_hash_uq UNIQUE (refresh_token_hash),
        CONSTRAINT auth_sessions_revoke_reason_chk CHECK (revoke_reason IN ('logout', 'reuse_detected',
          'account_locked', 'password_changed', 'admin')),
        CONSTRAINT auth_sessions_revoke_reason_required_chk
          CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX auth_sessions_user_active_idx ON auth_sessions (user_id) WHERE revoked_at IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX auth_sessions_family_idx ON auth_sessions (family_id)`);

    await queryRunner.query(`
      CREATE TABLE user_consents (
        id            uuid        PRIMARY KEY DEFAULT uuidv7(),
        user_id       uuid        NOT NULL REFERENCES users (id),
        consent_type  text        NOT NULL,
        version       text        NOT NULL,
        learner_id    uuid,
        granted_at    timestamptz NOT NULL DEFAULT now(),
        withdrawn_at  timestamptz,
        ip_address    inet,
        CONSTRAINT user_consents_type_chk CHECK (consent_type IN ('terms_of_service', 'privacy_policy',
          'child_data_processing', 'marketing_email'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX user_consents_user_idx ON user_consents (user_id, consent_type)`,
    );

    await queryRunner.query(`
      CREATE TABLE user_blocks (
        blocker_id  uuid        NOT NULL REFERENCES users (id),
        blocked_id  uuid        NOT NULL REFERENCES users (id),
        created_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (blocker_id, blocked_id),
        CONSTRAINT user_blocks_not_self_chk CHECK (blocker_id <> blocked_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX user_blocks_blocked_idx ON user_blocks (blocked_id)`);

    await queryRunner.query(`
      CREATE TABLE files (
        id               uuid        PRIMARY KEY DEFAULT uuidv7(),
        owner_user_id    uuid        NOT NULL REFERENCES users (id),
        bucket           text        NOT NULL,
        storage_key      text        NOT NULL,
        purpose          text        NOT NULL,
        original_name    text,
        mime_type        text        NOT NULL,
        size_bytes       bigint      NOT NULL,
        checksum_sha256  text,
        status           text        NOT NULL DEFAULT 'pending_upload',
        purge_after      timestamptz,
        deleted_at       timestamptz,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT files_storage_key_uq UNIQUE (storage_key),
        CONSTRAINT files_bucket_chk CHECK (bucket IN ('public', 'private')),
        CONSTRAINT files_purpose_chk CHECK (purpose IN ('avatar', 'verification_document', 'credential',
          'message_attachment', 'assignment_resource', 'submission', 'post_media', 'other')),
        CONSTRAINT files_status_chk CHECK (status IN ('pending_upload', 'ready', 'deleted')),
        CONSTRAINT files_size_chk CHECK (size_bytes > 0),
        CONSTRAINT files_private_documents_chk CHECK (purpose <> 'verification_document' OR bucket = 'private')
      )
    `);
    await queryRunner.query(`CREATE INDEX files_owner_idx ON files (owner_user_id)`);
    await queryRunner.query(
      `CREATE INDEX files_purge_idx ON files (purge_after) WHERE purge_after IS NOT NULL AND deleted_at IS NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE users ADD CONSTRAINT users_avatar_file_fk FOREIGN KEY (avatar_file_id) REFERENCES files (id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT users_avatar_file_fk`);
    await queryRunner.query(`DROP TABLE files`);
    await queryRunner.query(`DROP TABLE user_blocks`);
    await queryRunner.query(`DROP TABLE user_consents`);
    await queryRunner.query(`DROP TABLE auth_sessions`);
    await queryRunner.query(`DROP TABLE user_roles`);
    await queryRunner.query(`DROP TABLE roles`);
    await queryRunner.query(`DROP TABLE users`);
  }
}
