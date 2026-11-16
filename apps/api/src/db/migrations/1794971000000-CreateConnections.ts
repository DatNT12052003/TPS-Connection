import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Yêu cầu kết nối (docs/thiet_ke_co_so_du_lieu.md mục 6.4; §5; trạng thái B.1; G5 đợt 1).
 *
 * - `connection_requests`: một yêu cầu cho một gia sư, một người học, một môn (D21), theo hai chiều: phụ huynh gửi
 *   gia sư (`client_to_tutor`, có thể từ một bài tuyển) hoặc gia sư ứng tuyển vào bài tìm gia sư (`tutor_to_client`).
 *   Khác thiết kế: lưu thêm ảnh chụp nhu cầu (khối, mục tiêu, hình thức, tỉnh/xã) lúc gửi. Trong lúc trao đổi gia sư
 *   chỉ thấy những cột này, không đọc hồ sơ con (D16); hồ sơ con hay bài nguồn đổi sau cũng không làm đổi yêu cầu.
 * - `connection_terms`: điều kiện hợp tác theo phiên bản. Chỉ phiên bản lớn nhất được xác nhận; đủ xác nhận của hai
 *   bên thì yêu cầu sang `confirmed` và trỏ `agreed_terms_id` vào phiên bản đó (C3, C6, D18). Nội dung một phiên bản
 *   không sửa được (trigger), chỉ ghi thêm thời điểm xác nhận.
 * - `connection_events`: lịch sử chuyển trạng thái và người thực hiện (§5.3); `actor_user_id` NULL là hệ thống.
 * - Hội thoại (mở khi chấp nhận, D14) thêm ở đợt 2; lớp học tạo khi xác nhận hợp tác thêm ở G6.
 */
export class CreateConnections1794971000000 implements MigrationInterface {
  name = 'CreateConnections1794971000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE connection_requests (
        id                  uuid         PRIMARY KEY DEFAULT uuidv7(),
        direction           text         NOT NULL,
        tutor_id            uuid         NOT NULL REFERENCES tutor_profiles (user_id),
        client_user_id      uuid         NOT NULL REFERENCES users (id),
        learner_id          uuid         NOT NULL REFERENCES learners (id),
        subject_id          integer      NOT NULL REFERENCES subjects (id),
        grade_level_id      integer      NOT NULL REFERENCES grade_levels (id),
        goal                text         NOT NULL,
        goal_note           text,
        teaching_mode       text         NOT NULL,
        province_id         integer      REFERENCES administrative_areas (id),
        commune_id          integer      REFERENCES administrative_areas (id),
        tutor_post_id       uuid         REFERENCES tutor_posts (id),
        request_post_id     uuid         REFERENCES request_posts (id),
        message             text         NOT NULL,
        status              text         NOT NULL DEFAULT 'pending',
        cancel_reason       text,
        rejection_note      text,
        accepted_at         timestamptz,
        confirmed_at        timestamptz,
        closed_at           timestamptz,
        expires_at          timestamptz  NOT NULL,
        expiry_reminded_at  timestamptz,
        agreed_terms_id     uuid,
        created_at          timestamptz  NOT NULL DEFAULT now(),
        updated_at          timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT connection_requests_direction_chk
          CHECK (direction IN ('client_to_tutor', 'tutor_to_client')),
        CONSTRAINT connection_requests_parties_chk CHECK (tutor_id <> client_user_id),
        CONSTRAINT connection_requests_source_chk CHECK (
          (direction = 'client_to_tutor' AND request_post_id IS NULL)
          OR (direction = 'tutor_to_client' AND request_post_id IS NOT NULL AND tutor_post_id IS NULL)
        ),
        CONSTRAINT connection_requests_goal_chk
          CHECK (goal IN ('reinforce', 'exam_prep', 'advanced', 'other')),
        CONSTRAINT connection_requests_teaching_mode_chk
          CHECK (teaching_mode IN ('online', 'in_person', 'hybrid')),
        CONSTRAINT connection_requests_in_person_province_chk
          CHECK (teaching_mode = 'online' OR province_id IS NOT NULL),
        CONSTRAINT connection_requests_commune_needs_province_chk
          CHECK (commune_id IS NULL OR province_id IS NOT NULL),
        CONSTRAINT connection_requests_message_chk CHECK (length(btrim(message)) > 0),
        CONSTRAINT connection_requests_status_chk
          CHECK (status IN ('pending', 'negotiating', 'confirmed', 'rejected', 'cancelled')),
        CONSTRAINT connection_requests_cancel_reason_chk CHECK (cancel_reason IN (
          'withdrawn', 'ended_by_party', 'source_closed', 'expired_pending', 'expired_negotiating'
        )),
        CONSTRAINT connection_requests_cancel_reason_complete_chk
          CHECK ((status = 'cancelled') = (cancel_reason IS NOT NULL)),
        CONSTRAINT connection_requests_rejection_note_chk
          CHECK (rejection_note IS NULL OR status = 'rejected'),
        CONSTRAINT connection_requests_accepted_chk
          CHECK (status NOT IN ('negotiating', 'confirmed') OR accepted_at IS NOT NULL),
        CONSTRAINT connection_requests_confirmed_chk
          CHECK ((status = 'confirmed') = (agreed_terms_id IS NOT NULL AND confirmed_at IS NOT NULL)),
        CONSTRAINT connection_requests_closed_chk
          CHECK ((status IN ('rejected', 'cancelled')) = (closed_at IS NOT NULL))
      )
    `);
    // Không có hai yêu cầu đang mở cho cùng gia sư – người học – môn (D21). Cũng dùng khi kiểm tra trước lúc gửi.
    await queryRunner.query(`
      CREATE UNIQUE INDEX connection_requests_open_uq
        ON connection_requests (tutor_id, learner_id, subject_id)
        WHERE status IN ('pending', 'negotiating')
    `);
    // Danh sách yêu cầu của gia sư và của phụ huynh, mới nhất trước (lọc trạng thái trên tập nhỏ của một người).
    await queryRunner.query(`
      CREATE INDEX connection_requests_tutor_idx
        ON connection_requests (tutor_id, created_at DESC, id DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX connection_requests_client_idx
        ON connection_requests (client_user_id, created_at DESC, id DESC)
    `);
    // Job tự hủy và nhắc hết hạn (C3, D30).
    await queryRunner.query(`
      CREATE INDEX connection_requests_expiry_idx ON connection_requests (expires_at)
        WHERE status IN ('pending', 'negotiating')
    `);
    // Ứng tuyển của một bài tìm gia sư (danh sách cho phụ huynh, tự hủy khi bài ẩn/đóng D31).
    await queryRunner.query(`
      CREATE INDEX connection_requests_request_post_idx ON connection_requests (request_post_id)
        WHERE request_post_id IS NOT NULL
    `);
    // Yêu cầu phát sinh từ một bài tuyển (đếm ở trang bài của gia sư).
    await queryRunner.query(`
      CREATE INDEX connection_requests_tutor_post_idx ON connection_requests (tutor_post_id)
        WHERE tutor_post_id IS NOT NULL
    `);
    // Hủy yêu cầu đang mở khi xóa hồ sơ con.
    await queryRunner.query(`
      CREATE INDEX connection_requests_learner_open_idx ON connection_requests (learner_id)
        WHERE status IN ('pending', 'negotiating')
    `);

    await queryRunner.query(`
      CREATE TABLE connection_terms (
        id                   uuid         PRIMARY KEY DEFAULT uuidv7(),
        request_id           uuid         NOT NULL REFERENCES connection_requests (id),
        version              integer      NOT NULL,
        proposed_by          uuid         NOT NULL REFERENCES users (id),
        subject_id           integer      NOT NULL REFERENCES subjects (id),
        grade_level_id       integer      NOT NULL REFERENCES grade_levels (id),
        goal                 text         NOT NULL,
        goal_note            text,
        teaching_mode        text         NOT NULL,
        province_id          integer      REFERENCES administrative_areas (id),
        commune_id           integer      REFERENCES administrative_areas (id),
        session_price_vnd    bigint       NOT NULL,
        session_minutes      smallint     NOT NULL,
        sessions_per_week    smallint,
        schedule             jsonb        NOT NULL DEFAULT '[]',
        start_date           date,
        note                 text,
        tutor_confirmed_at   timestamptz,
        client_confirmed_at  timestamptz,
        created_at           timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT connection_terms_version_uq UNIQUE (request_id, version),
        CONSTRAINT connection_terms_version_chk CHECK (version > 0),
        CONSTRAINT connection_terms_goal_chk
          CHECK (goal IN ('reinforce', 'exam_prep', 'advanced', 'other')),
        CONSTRAINT connection_terms_teaching_mode_chk
          CHECK (teaching_mode IN ('online', 'in_person', 'hybrid')),
        CONSTRAINT connection_terms_in_person_province_chk
          CHECK (teaching_mode = 'online' OR province_id IS NOT NULL),
        CONSTRAINT connection_terms_commune_needs_province_chk
          CHECK (commune_id IS NULL OR province_id IS NOT NULL),
        CONSTRAINT connection_terms_price_chk CHECK (session_price_vnd >= 0),
        CONSTRAINT connection_terms_minutes_chk CHECK (session_minutes BETWEEN 15 AND 600),
        CONSTRAINT connection_terms_per_week_chk CHECK (sessions_per_week BETWEEN 1 AND 14),
        CONSTRAINT connection_terms_schedule_chk CHECK (jsonb_typeof(schedule) = 'array')
      )
    `);
    // Một phiên bản điều khoản là bản chụp: chỉ được ghi thêm thời điểm xác nhận, không sửa nội dung, không xóa dòng.
    // Không chặn TRUNCATE: đó là thao tác quản trị (test dọn bảng bằng TRUNCATE ... CASCADE), không phải của ứng dụng.
    await queryRunner.query(`
      CREATE FUNCTION connection_terms_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'connection_terms cannot be deleted' USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF (to_jsonb(NEW) - 'tutor_confirmed_at' - 'client_confirmed_at')
           IS DISTINCT FROM (to_jsonb(OLD) - 'tutor_confirmed_at' - 'client_confirmed_at') THEN
          RAISE EXCEPTION 'connection_terms content is immutable' USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER connection_terms_no_edit BEFORE UPDATE OR DELETE ON connection_terms
        FOR EACH ROW EXECUTE FUNCTION connection_terms_immutable()
    `);

    await queryRunner.query(`
      ALTER TABLE connection_requests
        ADD CONSTRAINT connection_requests_agreed_terms_fk
        FOREIGN KEY (agreed_terms_id) REFERENCES connection_terms (id)
    `);

    await queryRunner.query(`
      CREATE TABLE connection_events (
        id             bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        request_id     uuid         NOT NULL REFERENCES connection_requests (id),
        event          text         NOT NULL,
        actor_user_id  uuid         REFERENCES users (id),
        from_status    text,
        to_status      text,
        data           jsonb,
        created_at     timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT connection_events_event_chk CHECK (event IN (
          'created', 'accepted', 'rejected', 'withdrawn', 'terms_proposed', 'confirmed_by_tutor',
          'confirmed_by_client', 'confirmed', 'cancelled_by_party', 'cancelled_by_system',
          'expiry_reminded', 'expired'
        ))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX connection_events_request_idx ON connection_events (request_id, id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE connection_events`);
    await queryRunner.query(
      `ALTER TABLE connection_requests DROP CONSTRAINT connection_requests_agreed_terms_fk`,
    );
    await queryRunner.query(`DROP TABLE connection_terms`);
    await queryRunner.query(`DROP FUNCTION connection_terms_immutable()`);
    await queryRunner.query(`DROP TABLE connection_requests`);
  }
}
