import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nhắn tin (docs/thiet_ke_co_so_du_lieu.md mục 6.5; §5.4; G5 đợt 2).
 *
 * - `conversations`: một hội thoại cho một yêu cầu kết nối, mở khi bên nhận chấp nhận (D14). Không có cột trạng
 *   thái: gửi được hay chỉ xem (D32) suy ra từ trạng thái yêu cầu. `class_id` dành cho chat lớp nhóm; khóa ngoại tới
 *   `tutoring_classes` thêm ở G6.
 * - `conversation_participants`: bản đầu chỉ gia sư (`tutor`) và phụ huynh (`client`) (C7). `last_read_message_id`
 *   là tin cuối người đó đã đọc; tin chưa đọc là tin của người khác có id lớn hơn (id là UUIDv7, tăng theo thời gian).
 * - `messages`: xóa mềm (người gửi xóa tin của mình; nội dung giữ lại cho báo cáo vi phạm ở G8). Tin hệ thống không
 *   có người gửi.
 * - `message_attachments`: một tệp chỉ thuộc một tin.
 * - Dữ liệu: tạo hội thoại cho các yêu cầu đã được chấp nhận trước migration này (đợt 1 chưa có hội thoại).
 */
export class CreateMessaging1794971100000 implements MigrationInterface {
  name = 'CreateMessaging1794971100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE conversations (
        id                     uuid         PRIMARY KEY DEFAULT uuidv7(),
        kind                   text         NOT NULL,
        connection_request_id  uuid         REFERENCES connection_requests (id),
        class_id               uuid,
        last_message_at        timestamptz,
        created_at             timestamptz  NOT NULL DEFAULT now(),
        updated_at             timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT conversations_kind_chk CHECK (kind IN ('connection', 'class', 'support')),
        CONSTRAINT conversations_connection_chk
          CHECK (kind <> 'connection' OR connection_request_id IS NOT NULL),
        CONSTRAINT conversations_connection_request_uq UNIQUE (connection_request_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE conversation_participants (
        conversation_id       uuid         NOT NULL REFERENCES conversations (id),
        user_id               uuid         NOT NULL REFERENCES users (id),
        participant_role      text         NOT NULL,
        joined_at             timestamptz  NOT NULL DEFAULT now(),
        left_at               timestamptz,
        last_read_message_id  uuid,
        muted                 boolean      NOT NULL DEFAULT false,
        PRIMARY KEY (conversation_id, user_id),
        CONSTRAINT conversation_participants_role_chk
          CHECK (participant_role IN ('tutor', 'client', 'student', 'staff'))
      )
    `);
    // Hội thoại của tôi.
    await queryRunner.query(`
      CREATE INDEX conversation_participants_user_idx ON conversation_participants (user_id)
        WHERE left_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE messages (
        id               uuid         PRIMARY KEY DEFAULT uuidv7(),
        conversation_id  uuid         NOT NULL REFERENCES conversations (id),
        sender_id        uuid         REFERENCES users (id),
        kind             text         NOT NULL DEFAULT 'text',
        body             text,
        edited_at        timestamptz,
        deleted_at       timestamptz,
        created_at       timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT messages_kind_chk CHECK (kind IN ('text', 'attachment', 'system')),
        CONSTRAINT messages_sender_chk CHECK ((kind = 'system') = (sender_id IS NULL)),
        CONSTRAINT messages_text_body_chk
          CHECK (kind <> 'text' OR (body IS NOT NULL AND length(btrim(body)) > 0)),
        CONSTRAINT messages_body_length_chk CHECK (body IS NULL OR length(body) <= 4000)
      )
    `);
    // Tải tin theo trang (keyset theo id), tin cuối, đếm tin chưa đọc.
    await queryRunner.query(
      `CREATE INDEX messages_conversation_idx ON messages (conversation_id, id DESC)`,
    );
    await queryRunner.query(`
      ALTER TABLE conversation_participants
        ADD CONSTRAINT conversation_participants_last_read_fk
        FOREIGN KEY (last_read_message_id) REFERENCES messages (id)
    `);

    await queryRunner.query(`
      CREATE TABLE message_attachments (
        message_id  uuid  NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
        file_id     uuid  NOT NULL REFERENCES files (id),
        PRIMARY KEY (message_id, file_id),
        CONSTRAINT message_attachments_file_uq UNIQUE (file_id)
      )
    `);

    // Yêu cầu đã được chấp nhận ở đợt 1 (kể cả đã hủy sau đó hoặc đã xác nhận): mở hội thoại từ lúc chấp nhận.
    await queryRunner.query(`
      INSERT INTO conversations (kind, connection_request_id, created_at, updated_at)
      SELECT 'connection', id, accepted_at, accepted_at
        FROM connection_requests
       WHERE accepted_at IS NOT NULL
    `);
    await queryRunner.query(`
      INSERT INTO conversation_participants (conversation_id, user_id, participant_role, joined_at)
      SELECT c.id, p.user_id, p.role, c.created_at
        FROM conversations c
        JOIN connection_requests r ON r.id = c.connection_request_id
       CROSS JOIN LATERAL (VALUES (r.tutor_id, 'tutor'), (r.client_user_id, 'client')) AS p (user_id, role)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE message_attachments`);
    await queryRunner.query(
      `ALTER TABLE conversation_participants DROP CONSTRAINT conversation_participants_last_read_fk`,
    );
    await queryRunner.query(`DROP TABLE messages`);
    await queryRunner.query(`DROP TABLE conversation_participants`);
    await queryRunner.query(`DROP TABLE conversations`);
  }
}
