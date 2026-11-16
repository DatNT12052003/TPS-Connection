import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thông báo, tùy chọn thông báo và báo cáo vi phạm (docs/thiet_ke_co_so_du_lieu.md mục 9, 10; §12, §13; G5 đợt 3).
 *
 * - `notifications`: ghi trong cùng transaction với sự kiện. `data` chỉ có id và tên hiển thị, không có thông tin
 *   của trẻ. Tin nhắn mới: mỗi người mỗi hội thoại chỉ một thông báo chưa đọc (unique một phần), gộp bằng upsert.
 * - `notification_preferences`: chỉ lưu lựa chọn khác mặc định (mặc định nằm ở `NOTIFICATION_DEFAULTS`).
 * - `violation_reports`: đúng một đối tượng bị báo cáo; mỗi người một báo cáo đang mở cho mỗi đối tượng.
 *   `case_id` và `review_id` chưa có khóa ngoại (thêm ở G8 cùng `moderation_cases`, ở bản 3 cùng `reviews`).
 * - Chưa tạo `notification_deliveries` (theo dõi gửi email/push từng thông báo) và `device_tokens` (mobile): làm khi
 *   có push ở bản mobile.
 */
export class CreateNotificationsAndReports1794971200000 implements MigrationInterface {
  name = 'CreateNotificationsAndReports1794971200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const types = `'connection_received', 'connection_accepted', 'connection_rejected', 'connection_expiring',
      'connection_confirmed', 'message_new', 'verification_result'`;

    await queryRunner.query(`
      CREATE TABLE notifications (
        id          uuid         PRIMARY KEY DEFAULT uuidv7(),
        user_id     uuid         NOT NULL REFERENCES users (id),
        type        text         NOT NULL,
        data        jsonb        NOT NULL DEFAULT '{}',
        read_at     timestamptz,
        created_at  timestamptz  NOT NULL DEFAULT now(),
        updated_at  timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT notifications_type_chk CHECK (type IN (${types})),
        CONSTRAINT notifications_data_chk CHECK (jsonb_typeof(data) = 'object'),
        CONSTRAINT notifications_message_data_chk
          CHECK (type <> 'message_new' OR data ? 'conversationId')
      )
    `);
    // Trung tâm thông báo: mới nhất trước (thông báo tin nhắn được gộp thì `updated_at` đổi, lên đầu).
    await queryRunner.query(
      `CREATE INDEX notifications_user_idx ON notifications (user_id, updated_at DESC, id DESC)`,
    );
    // Đếm chưa đọc, đánh dấu đã đọc hết.
    await queryRunner.query(
      `CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL`,
    );
    // Gộp tin nhắn mới: một thông báo chưa đọc cho mỗi người nhận, mỗi hội thoại.
    await queryRunner.query(`
      CREATE UNIQUE INDEX notifications_message_unread_uq
        ON notifications (user_id, (data ->> 'conversationId'))
        WHERE type = 'message_new' AND read_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE notification_preferences (
        user_id  uuid     NOT NULL REFERENCES users (id),
        type     text     NOT NULL,
        channel  text     NOT NULL,
        enabled  boolean  NOT NULL,
        PRIMARY KEY (user_id, type, channel),
        CONSTRAINT notification_preferences_type_chk CHECK (type IN (${types})),
        CONSTRAINT notification_preferences_channel_chk CHECK (channel IN ('in_app', 'email'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE violation_reports (
        id                uuid         PRIMARY KEY DEFAULT uuidv7(),
        reporter_id       uuid         NOT NULL REFERENCES users (id),
        reported_user_id  uuid         REFERENCES users (id),
        tutor_post_id     uuid         REFERENCES tutor_posts (id),
        request_post_id   uuid         REFERENCES request_posts (id),
        message_id        uuid         REFERENCES messages (id),
        review_id         uuid,
        reason_code       text         NOT NULL,
        description       text,
        status            text         NOT NULL DEFAULT 'open',
        case_id           uuid,
        created_at        timestamptz  NOT NULL DEFAULT now(),
        updated_at        timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT violation_reports_target_chk CHECK (
          num_nonnulls(reported_user_id, tutor_post_id, request_post_id, message_id, review_id) = 1
        ),
        CONSTRAINT violation_reports_not_self_chk CHECK (reported_user_id <> reporter_id),
        CONSTRAINT violation_reports_reason_chk CHECK (reason_code IN (
          'spam', 'harassment', 'inappropriate_content', 'fake_profile', 'child_safety', 'fraud', 'other'
        )),
        CONSTRAINT violation_reports_description_chk
          CHECK (description IS NULL OR length(description) <= 1000),
        CONSTRAINT violation_reports_status_chk CHECK (status IN ('open', 'linked', 'closed'))
      )
    `);
    // Hàng chờ của Manager (G8).
    await queryRunner.query(
      `CREATE INDEX violation_reports_open_idx ON violation_reports (created_at) WHERE status = 'open'`,
    );
    // Một báo cáo đang mở của mỗi người cho mỗi đối tượng (báo lại thì bỏ qua).
    await queryRunner.query(`
      CREATE UNIQUE INDEX violation_reports_open_uq
        ON violation_reports (reporter_id, reported_user_id, tutor_post_id, request_post_id, message_id, review_id)
        NULLS NOT DISTINCT
        WHERE status = 'open'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE violation_reports`);
    await queryRunner.query(`DROP TABLE notification_preferences`);
    await queryRunner.query(`DROP TABLE notifications`);
  }
}
