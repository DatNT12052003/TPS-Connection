import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hồ sơ phụ huynh, hồ sơ người học (con), quan hệ phụ huynh quản lý và lời mời học sinh
 * (docs/thiet_ke_co_so_du_lieu.md mục 5.2, mục 12; G2 phần 4).
 *
 * - `learners` tồn tại độc lập với tài khoản; `account_user_id` gắn khi học sinh nhận lời mời (D4).
 * - C9: mỗi người học chỉ có MỘT phụ huynh đang quản lý (partial unique index trên `learner_guardians`).
 * - `student_invitations` lưu SHA-256 của token, không lưu token; mỗi hồ sơ chỉ một lời mời đang mở (D50).
 * - View `learner_managers`: ai là người quản lý ("client") của người học, dùng cho `isParentOf`.
 * - Hoàn tất khóa ngoại `user_consents.learner_id` để lại từ migration tài khoản.
 */
export class CreateParentLearnerProfiles1794970300000 implements MigrationInterface {
  name = 'CreateParentLearnerProfiles1794970300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE parent_profiles (
        user_id       uuid        PRIMARY KEY REFERENCES users (id),
        province_id   integer     REFERENCES administrative_areas (id),
        commune_id    integer     REFERENCES administrative_areas (id),
        address_line  text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT parent_profiles_commune_needs_province_chk
          CHECK (commune_id IS NULL OR province_id IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE learners (
        id               uuid        PRIMARY KEY DEFAULT uuidv7(),
        account_user_id  uuid        REFERENCES users (id),
        is_self_managed  boolean     NOT NULL DEFAULT false,
        full_name        text,
        nickname         text,
        date_of_birth    date,
        grade_level_id   integer     REFERENCES grade_levels (id),
        school_name      text,
        province_id      integer     REFERENCES administrative_areas (id),
        commune_id       integer     REFERENCES administrative_areas (id),
        address_line     text,
        notes            text,
        created_by       uuid        NOT NULL REFERENCES users (id),
        deleted_at       timestamptz,
        anonymized_at    timestamptz,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT learners_account_user_uq UNIQUE (account_user_id),
        CONSTRAINT learners_self_managed_needs_account_chk
          CHECK (NOT is_self_managed OR account_user_id IS NOT NULL),
        CONSTRAINT learners_full_name_required_chk
          CHECK (full_name IS NOT NULL OR anonymized_at IS NOT NULL),
        CONSTRAINT learners_anonymized_after_delete_chk
          CHECK (anonymized_at IS NULL OR deleted_at IS NOT NULL),
        CONSTRAINT learners_commune_needs_province_chk
          CHECK (commune_id IS NULL OR province_id IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE learner_guardians (
        id                uuid        PRIMARY KEY DEFAULT uuidv7(),
        learner_id        uuid        NOT NULL REFERENCES learners (id),
        guardian_user_id  uuid        NOT NULL REFERENCES users (id),
        relationship      text        NOT NULL,
        started_at        timestamptz NOT NULL DEFAULT now(),
        ended_at          timestamptz,
        ended_reason      text,
        changed_by        uuid        REFERENCES users (id),
        CONSTRAINT learner_guardians_relationship_chk
          CHECK (relationship IN ('father', 'mother', 'guardian', 'other')),
        CONSTRAINT learner_guardians_ended_reason_chk
          CHECK (ended_reason IN ('transferred', 'learner_self_managed', 'account_deleted')),
        CONSTRAINT learner_guardians_ended_reason_required_chk
          CHECK ((ended_at IS NULL) = (ended_reason IS NULL))
      )
    `);
    // C9: mỗi người học chỉ có MỘT phụ huynh đang quản lý.
    await queryRunner.query(
      `CREATE UNIQUE INDEX learner_guardians_one_active_uq ON learner_guardians (learner_id) WHERE ended_at IS NULL`,
    );
    // "Danh sách con của tôi" và isParentOf.
    await queryRunner.query(
      `CREATE INDEX learner_guardians_guardian_idx ON learner_guardians (guardian_user_id) WHERE ended_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE student_invitations (
        id           uuid        PRIMARY KEY DEFAULT uuidv7(),
        learner_id   uuid        NOT NULL REFERENCES learners (id),
        email        citext      NOT NULL,
        token_hash   text        NOT NULL,
        invited_by   uuid        NOT NULL REFERENCES users (id),
        expires_at   timestamptz NOT NULL,
        accepted_at  timestamptz,
        revoked_at   timestamptz,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT student_invitations_token_hash_uq UNIQUE (token_hash),
        CONSTRAINT student_invitations_single_outcome_chk
          CHECK (accepted_at IS NULL OR revoked_at IS NULL),
        CONSTRAINT student_invitations_expiry_chk CHECK (expires_at > created_at)
      )
    `);
    // Mỗi hồ sơ con chỉ một lời mời đang mở: gửi lời mời mới thì phải hủy lời mời cũ trước.
    await queryRunner.query(`
      CREATE UNIQUE INDEX student_invitations_open_uq ON student_invitations (learner_id)
        WHERE accepted_at IS NULL AND revoked_at IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE user_consents
        ADD CONSTRAINT user_consents_learner_fk FOREIGN KEY (learner_id) REFERENCES learners (id),
        ADD CONSTRAINT user_consents_child_data_learner_chk
          CHECK ((consent_type = 'child_data_processing') = (learner_id IS NOT NULL))
    `);
    await queryRunner.query(
      `CREATE INDEX user_consents_learner_idx ON user_consents (learner_id) WHERE learner_id IS NOT NULL`,
    );

    // Người quản lý (client) của người học: phụ huynh đang quản lý, hoặc chính người học tự quản lý (D3).
    await queryRunner.query(`
      CREATE VIEW learner_managers AS
        SELECT learner_id, guardian_user_id AS manager_user_id
          FROM learner_guardians
         WHERE ended_at IS NULL
        UNION ALL
        SELECT id AS learner_id, account_user_id AS manager_user_id
          FROM learners
         WHERE is_self_managed
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW learner_managers`);
    await queryRunner.query(`DROP INDEX user_consents_learner_idx`);
    await queryRunner.query(`
      ALTER TABLE user_consents
        DROP CONSTRAINT user_consents_child_data_learner_chk,
        DROP CONSTRAINT user_consents_learner_fk
    `);
    await queryRunner.query(`DROP TABLE student_invitations`);
    await queryRunner.query(`DROP TABLE learner_guardians`);
    await queryRunner.query(`DROP TABLE learners`);
    await queryRunner.query(`DROP TABLE parent_profiles`);
  }
}
