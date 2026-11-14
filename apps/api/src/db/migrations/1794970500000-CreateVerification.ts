import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Xác minh gia sư (docs/thiet_ke_co_so_du_lieu.md mục 6.1; G3, C4, B.4.2).
 *
 * - `verification_requests`: mỗi lần nộp là một dòng; nộp lại sau khi bị từ chối là dòng mới để giữ lịch sử.
 *   Mỗi gia sư chỉ có một yêu cầu đang chờ cho danh tính, và một cho mỗi bằng cấp (partial unique index).
 * - Khác thiết kế CSDL: lý do từ chối tách thành `rejection_code` (chọn từ danh sách, dịch được cho gia sư)
 *   và `rejection_note` (ghi chú tự do, bắt buộc khi `rejection_code = 'other'`).
 * - `verification_documents`: giấy tờ của một yêu cầu; một tệp chỉ thuộc một yêu cầu (`file_id` unique).
 * - `user_consents` thêm loại `verification_document_processing` (đồng ý dùng giấy tờ để xác minh).
 * - `files`: tệp bằng cấp (`credential`) cũng bắt buộc ở bucket private như giấy tờ danh tính.
 */
export class CreateVerification1794970500000 implements MigrationInterface {
  name = 'CreateVerification1794970500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE verification_requests (
        id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
        tutor_id            uuid        NOT NULL REFERENCES tutor_profiles (user_id),
        kind                text        NOT NULL,
        credential_id       uuid        REFERENCES tutor_credentials (id),
        status              text        NOT NULL DEFAULT 'pending',
        submitted_at        timestamptz NOT NULL DEFAULT now(),
        review_due_at       timestamptz NOT NULL,
        reviewed_by         uuid        REFERENCES users (id),
        reviewed_at         timestamptz,
        rejection_code      text,
        rejection_note      text,
        cancelled_at        timestamptz,
        documents_purge_at  timestamptz,
        documents_purged_at timestamptz,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT verification_requests_kind_chk CHECK (kind IN ('identity', 'credential')),
        CONSTRAINT verification_requests_status_chk
          CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        CONSTRAINT verification_requests_credential_chk
          CHECK ((kind = 'credential') = (credential_id IS NOT NULL)),
        CONSTRAINT verification_requests_reviewed_chk
          CHECK ((status IN ('approved', 'rejected')) = (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)),
        CONSTRAINT verification_requests_cancelled_chk
          CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
        CONSTRAINT verification_requests_rejection_code_chk
          CHECK (rejection_code IN ('unclear_image', 'name_mismatch', 'expired_document',
            'invalid_document', 'missing_document', 'other')),
        CONSTRAINT verification_requests_rejection_chk
          CHECK ((status = 'rejected') = (rejection_code IS NOT NULL)),
        CONSTRAINT verification_requests_rejection_note_chk
          CHECK (rejection_code IS DISTINCT FROM 'other' OR coalesce(length(btrim(rejection_note)), 0) > 0),
        CONSTRAINT verification_requests_due_chk CHECK (review_due_at > submitted_at)
      )
    `);
    // Mỗi gia sư chỉ một yêu cầu đang chờ cho danh tính và cho từng bằng cấp.
    await queryRunner.query(`
      CREATE UNIQUE INDEX verification_requests_pending_uq
        ON verification_requests (tutor_id, kind, coalesce(credential_id, '00000000-0000-0000-0000-000000000000'))
        WHERE status = 'pending'
    `);
    // Hàng chờ của Manager, sắp theo hạn xử lý.
    await queryRunner.query(`
      CREATE INDEX verification_requests_queue_idx ON verification_requests (review_due_at)
        WHERE status = 'pending'
    `);
    // Lịch sử của một gia sư (yêu cầu gần nhất theo loại, số lần nộp).
    await queryRunner.query(`
      CREATE INDEX verification_requests_tutor_idx
        ON verification_requests (tutor_id, kind, submitted_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX verification_requests_credential_idx ON verification_requests (credential_id)
        WHERE credential_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE verification_documents (
        id             uuid        PRIMARY KEY DEFAULT uuidv7(),
        request_id     uuid        NOT NULL REFERENCES verification_requests (id),
        document_type  text        NOT NULL,
        file_id        uuid        NOT NULL REFERENCES files (id),
        created_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT verification_documents_type_chk CHECK (document_type IN ('national_id_front',
          'national_id_back', 'student_card', 'degree', 'certificate', 'other')),
        CONSTRAINT verification_documents_file_uq UNIQUE (file_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX verification_documents_request_idx ON verification_documents (request_id)`,
    );

    await queryRunner.query(`ALTER TABLE user_consents DROP CONSTRAINT user_consents_type_chk`);
    await queryRunner.query(`
      ALTER TABLE user_consents ADD CONSTRAINT user_consents_type_chk CHECK (consent_type IN (
        'terms_of_service', 'privacy_policy', 'child_data_processing', 'marketing_email',
        'verification_document_processing'))
    `);

    await queryRunner.query(`ALTER TABLE files DROP CONSTRAINT files_private_documents_chk`);
    await queryRunner.query(`
      ALTER TABLE files ADD CONSTRAINT files_private_documents_chk
        CHECK (purpose NOT IN ('verification_document', 'credential') OR bucket = 'private')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE files DROP CONSTRAINT files_private_documents_chk`);
    await queryRunner.query(`
      ALTER TABLE files ADD CONSTRAINT files_private_documents_chk
        CHECK (purpose <> 'verification_document' OR bucket = 'private')
    `);
    await queryRunner.query(
      `DELETE FROM user_consents WHERE consent_type = 'verification_document_processing'`,
    );
    await queryRunner.query(`ALTER TABLE user_consents DROP CONSTRAINT user_consents_type_chk`);
    await queryRunner.query(`
      ALTER TABLE user_consents ADD CONSTRAINT user_consents_type_chk CHECK (consent_type IN (
        'terms_of_service', 'privacy_policy', 'child_data_processing', 'marketing_email'))
    `);
    await queryRunner.query(`DROP TABLE verification_documents`);
    await queryRunner.query(`DROP TABLE verification_requests`);
  }
}
