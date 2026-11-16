import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Học phí tháng và thanh toán (docs/thiet_ke_co_so_du_lieu.md mục 8; trạng thái B.10; G7), và loại thông báo
 * `fee_statement`.
 *
 * - `fee_statements`: bảng học phí tháng của một ghi danh (D23), lập ngày 1 cho tháng trước (D40), hạn ngày 5 tháng kế
 *   tiếp (D24). Khác thiết kế: mỗi ghi danh mỗi tháng tối đa một bảng **chưa hủy** (unique một phần, để hủy rồi lập
 *   lại được, B.10.1); thêm `due_reminded_at` (job nhắc đến hạn một lần), `voided_at`, `voided_by`, `void_reason`.
 * - `fee_statement_items`: mỗi buổi tính tiền một dòng, tiền lấy từ điểm danh (giá đã chụp, D17). Khác thiết kế: dòng
 *   của bảng bị hủy có `voided_at` và nhả buổi cho bảng lập lại, nên `attendance_id` chỉ unique trong các dòng chưa hủy
 *   (mỗi buổi chỉ tính một lần).
 * - `payments`: ghi nhận thủ công (D6), có `channel` và `gateway_transaction_id` cho thanh toán trực tuyến sau này. Khác
 *   thiết kế: thêm trạng thái `declined` (bên kia báo chưa nhận được, canvas TuitionTutor); `decided_by`, `decided_at`,
 *   `decision_note` thay cho `acknowledged_by`, `acknowledged_at`, `voided_reason` (một bộ cột cho mọi quyết định).
 */
export class CreateFeeStatements1794971500000 implements MigrationInterface {
  name = 'CreateFeeStatements1794971500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fee_statements (
        id                 uuid         PRIMARY KEY DEFAULT uuidv7(),
        enrollment_id      uuid         NOT NULL REFERENCES class_enrollments (id),
        tutor_id           uuid         NOT NULL REFERENCES tutor_profiles (user_id),
        client_user_id     uuid         NOT NULL REFERENCES users (id),
        period_month       date         NOT NULL,
        billable_sessions  integer      NOT NULL DEFAULT 0,
        total_amount_vnd   bigint       NOT NULL DEFAULT 0,
        paid_amount_vnd    bigint       NOT NULL DEFAULT 0,
        status             text         NOT NULL DEFAULT 'issued',
        issued_at          timestamptz  NOT NULL DEFAULT now(),
        due_date           date         NOT NULL,
        due_reminded_at    timestamptz,
        voided_at          timestamptz,
        voided_by          uuid         REFERENCES users (id),
        void_reason        text,
        created_at         timestamptz  NOT NULL DEFAULT now(),
        updated_at         timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT fee_statements_period_chk CHECK (extract(day FROM period_month) = 1),
        CONSTRAINT fee_statements_sessions_chk CHECK (billable_sessions >= 0),
        CONSTRAINT fee_statements_total_chk CHECK (total_amount_vnd >= 0),
        CONSTRAINT fee_statements_paid_chk CHECK (paid_amount_vnd >= 0 AND paid_amount_vnd <= total_amount_vnd),
        CONSTRAINT fee_statements_status_chk CHECK (
          status IN ('draft', 'issued', 'partially_paid', 'paid', 'void')
        ),
        CONSTRAINT fee_statements_due_chk CHECK (due_date > period_month),
        CONSTRAINT fee_statements_void_chk CHECK (
          (status = 'void') = (voided_at IS NOT NULL) AND (status <> 'void' OR void_reason IS NOT NULL)
        )
      )
    `);
    // Mỗi ghi danh mỗi tháng một bảng còn hiệu lực; cũng là index tra bảng theo ghi danh và tháng.
    await queryRunner.query(`
      CREATE UNIQUE INDEX fee_statements_period_uq ON fee_statements (enrollment_id, period_month)
        WHERE status <> 'void'
    `);
    await queryRunner.query(
      `CREATE INDEX fee_statements_tutor_idx ON fee_statements (tutor_id, period_month DESC)`,
    );
    // Bảng của các tháng còn chưa trả đủ (tổng hợp của phụ huynh, gia sư).
    await queryRunner.query(`
      CREATE INDEX fee_statements_unpaid_idx ON fee_statements (enrollment_id)
        WHERE status IN ('issued', 'partially_paid')
    `);
    // Job nhắc học phí đến hạn.
    await queryRunner.query(`
      CREATE INDEX fee_statements_due_idx ON fee_statements (due_date)
        WHERE status IN ('issued', 'partially_paid') AND due_reminded_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE fee_statement_items (
        id             uuid         PRIMARY KEY DEFAULT uuidv7(),
        statement_id   uuid         NOT NULL REFERENCES fee_statements (id),
        attendance_id  uuid         REFERENCES lesson_attendances (id),
        item_type      text         NOT NULL,
        description    text,
        amount_vnd     bigint       NOT NULL,
        voided_at      timestamptz,
        created_at     timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT fee_statement_items_type_chk CHECK (item_type IN ('session', 'adjustment')),
        CONSTRAINT fee_statement_items_session_chk CHECK ((item_type = 'session') = (attendance_id IS NOT NULL)),
        CONSTRAINT fee_statement_items_amount_chk CHECK (item_type <> 'session' OR amount_vnd >= 0)
      )
    `);
    // Mỗi buổi chỉ tính một lần (trong các bảng chưa hủy).
    await queryRunner.query(`
      CREATE UNIQUE INDEX fee_statement_items_attendance_uq ON fee_statement_items (attendance_id)
        WHERE attendance_id IS NOT NULL AND voided_at IS NULL
    `);
    await queryRunner.query(
      `CREATE INDEX fee_statement_items_statement_idx ON fee_statement_items (statement_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE payments (
        id                      uuid         PRIMARY KEY DEFAULT uuidv7(),
        statement_id            uuid         NOT NULL REFERENCES fee_statements (id),
        amount_vnd              bigint       NOT NULL,
        method                  text         NOT NULL,
        channel                 text         NOT NULL DEFAULT 'manual',
        paid_on                 date         NOT NULL,
        reference               text,
        status                  text         NOT NULL DEFAULT 'recorded',
        recorded_by             uuid         NOT NULL REFERENCES users (id),
        decided_by              uuid         REFERENCES users (id),
        decided_at              timestamptz,
        decision_note           text,
        gateway_transaction_id  text,
        created_at              timestamptz  NOT NULL DEFAULT now(),
        updated_at              timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT payments_amount_chk CHECK (amount_vnd > 0),
        CONSTRAINT payments_method_chk CHECK (
          method IN ('cash', 'bank_transfer', 'e_wallet', 'online_gateway', 'other')
        ),
        CONSTRAINT payments_channel_chk CHECK (channel IN ('manual', 'online')),
        CONSTRAINT payments_status_chk CHECK (status IN ('recorded', 'acknowledged', 'declined', 'voided')),
        CONSTRAINT payments_decided_chk CHECK ((status = 'recorded') = (decided_at IS NULL)),
        CONSTRAINT payments_gateway_chk CHECK (channel = 'online' OR gateway_transaction_id IS NULL),
        CONSTRAINT payments_gateway_uq UNIQUE (gateway_transaction_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX payments_statement_idx ON payments (statement_id, created_at)`,
    );
    // Khoản chờ bên kia xác nhận.
    await queryRunner.query(
      `CREATE INDEX payments_recorded_idx ON payments (statement_id) WHERE status = 'recorded'`,
    );

    await this.setNotificationTypes(queryRunner, [...BASE_TYPES, 'fee_statement']);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM notifications WHERE type = 'fee_statement'`);
    await queryRunner.query(`DELETE FROM notification_preferences WHERE type = 'fee_statement'`);
    await this.setNotificationTypes(queryRunner, BASE_TYPES);
    await queryRunner.query(`DROP TABLE payments`);
    await queryRunner.query(`DROP TABLE fee_statement_items`);
    await queryRunner.query(`DROP TABLE fee_statements`);
  }

  private async setNotificationTypes(queryRunner: QueryRunner, types: readonly string[]) {
    const list = types.map((t) => `'${t}'`).join(', ');
    for (const [table, constraint] of [
      ['notifications', 'notifications_type_chk'],
      ['notification_preferences', 'notification_preferences_type_chk'],
    ] as const) {
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`);
      await queryRunner.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK (type IN (${list}))`,
      );
    }
  }
}

/** Các loại thông báo có trước migration này (G5, G6). */
const BASE_TYPES = [
  'connection_received',
  'connection_accepted',
  'connection_rejected',
  'connection_expiring',
  'connection_confirmed',
  'message_new',
  'verification_result',
  'class_status',
  'fee_change',
  'lesson_upcoming',
  'lesson_changed',
  'attendance_reminder',
  'lesson_to_confirm',
  'lesson_dispute',
  'assessment_new',
] as const;
