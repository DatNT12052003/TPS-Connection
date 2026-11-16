import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lớp học, ghi danh, mức học phí, mục tiêu học tập (docs/thiet_ke_co_so_du_lieu.md mục 7.1; trạng thái B.5; G6 đợt 1).
 *
 * - `tutoring_classes`: hệ thống tạo khi yêu cầu kết nối chuyển `confirmed` (D9), một lớp cho một yêu cầu
 *   (`created_from_request_id` unique). Lớp gắn cố định với một gia sư (D28). Khác thiết kế: `name` để trống được
 *   (giao diện ghép tên từ môn và học sinh theo ngôn ngữ người xem; gia sư đặt tên riêng nếu muốn), `ended_reason`
 *   chỉ có khi lớp đã kết thúc, thêm `paused_at`.
 * - `class_enrollments`: học sinh trong lớp. Bản đầu mỗi lớp một học sinh (D7) nhưng dữ liệu cho phép nhiều.
 * - `enrollment_fee_rates`: lịch sử mức học phí (D17). Mức đầu tiên lấy từ điều khoản đã chốt (`source_terms_id`),
 *   các mức sau do gia sư đề xuất (`note` là lời nhắn kèm đề xuất, thêm so với thiết kế). Mỗi ghi danh tối đa một mức
 *   `active` và một mức `proposed`.
 * - `learning_goals`: mục tiêu theo tháng, học kỳ hoặc khoảng tự chọn.
 * - Khóa ngoại `conversations.class_id` để lại từ migration nhắn tin.
 * - Dữ liệu: tạo lớp cho các yêu cầu đã `confirmed` trước khi có bảng lớp (G5).
 */
export class CreateTeachingClasses1794971300000 implements MigrationInterface {
  name = 'CreateTeachingClasses1794971300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tutoring_classes (
        id                       uuid         PRIMARY KEY DEFAULT uuidv7(),
        tutor_id                 uuid         NOT NULL REFERENCES tutor_profiles (user_id),
        name                     text,
        subject_id               integer      NOT NULL REFERENCES subjects (id),
        grade_level_id           integer      NOT NULL REFERENCES grade_levels (id),
        teaching_mode            text         NOT NULL,
        class_type               text         NOT NULL DEFAULT 'one_on_one',
        capacity                 smallint     NOT NULL DEFAULT 1,
        status                   text         NOT NULL DEFAULT 'active',
        started_on               date         NOT NULL,
        paused_at                timestamptz,
        ended_on                 date,
        ended_reason             text,
        timezone                 text         NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
        created_from_request_id  uuid         REFERENCES connection_requests (id),
        created_at               timestamptz  NOT NULL DEFAULT now(),
        updated_at               timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT tutoring_classes_request_uq UNIQUE (created_from_request_id),
        CONSTRAINT tutoring_classes_name_chk CHECK (name IS NULL OR length(btrim(name)) > 0),
        CONSTRAINT tutoring_classes_teaching_mode_chk
          CHECK (teaching_mode IN ('online', 'in_person', 'hybrid')),
        CONSTRAINT tutoring_classes_class_type_chk CHECK (class_type IN ('one_on_one', 'group')),
        CONSTRAINT tutoring_classes_capacity_chk CHECK (capacity > 0),
        CONSTRAINT tutoring_classes_one_on_one_chk CHECK (class_type <> 'one_on_one' OR capacity = 1),
        CONSTRAINT tutoring_classes_status_chk CHECK (status IN ('active', 'paused', 'ended')),
        CONSTRAINT tutoring_classes_paused_chk CHECK ((status = 'paused') = (paused_at IS NOT NULL)),
        CONSTRAINT tutoring_classes_ended_chk CHECK (
          (status = 'ended') = (ended_on IS NOT NULL)
          AND (status = 'ended') = (ended_reason IS NOT NULL)
        ),
        CONSTRAINT tutoring_classes_ended_on_chk CHECK (ended_on IS NULL OR ended_on >= started_on)
      )
    `);
    // Lớp của gia sư (danh sách, lớp đang học trước).
    await queryRunner.query(
      `CREATE INDEX tutoring_classes_tutor_idx ON tutoring_classes (tutor_id, status)`,
    );
    await queryRunner.query(`
      ALTER TABLE conversations
        ADD CONSTRAINT conversations_class_fk FOREIGN KEY (class_id) REFERENCES tutoring_classes (id)
    `);

    await queryRunner.query(`
      CREATE TABLE class_enrollments (
        id                     uuid         PRIMARY KEY DEFAULT uuidv7(),
        class_id               uuid         NOT NULL REFERENCES tutoring_classes (id),
        learner_id             uuid         NOT NULL REFERENCES learners (id),
        client_user_id         uuid         NOT NULL REFERENCES users (id),
        connection_request_id  uuid         REFERENCES connection_requests (id),
        status                 text         NOT NULL DEFAULT 'active',
        joined_on              date         NOT NULL,
        left_on                date,
        initial_assessment     text,
        teaching_notes         text,
        created_at             timestamptz  NOT NULL DEFAULT now(),
        updated_at             timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT class_enrollments_request_uq UNIQUE (connection_request_id),
        CONSTRAINT class_enrollments_status_chk CHECK (status IN ('active', 'paused', 'left')),
        CONSTRAINT class_enrollments_left_chk CHECK ((status = 'left') = (left_on IS NOT NULL))
      )
    `);
    // Một học sinh chỉ ghi danh một lần trong một lớp khi chưa rời lớp.
    await queryRunner.query(`
      CREATE UNIQUE INDEX class_enrollments_active_uq ON class_enrollments (class_id, learner_id)
        WHERE status <> 'left'
    `);
    // Lớp của một học sinh (phụ huynh, học sinh xem; teachesStudent; chặn xóa hồ sơ con còn lớp).
    await queryRunner.query(
      `CREATE INDEX class_enrollments_learner_idx ON class_enrollments (learner_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX class_enrollments_class_idx ON class_enrollments (class_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE enrollment_fee_rates (
        id                 uuid         PRIMARY KEY DEFAULT uuidv7(),
        enrollment_id      uuid         NOT NULL REFERENCES class_enrollments (id),
        session_price_vnd  bigint       NOT NULL,
        session_minutes    smallint     NOT NULL,
        status             text         NOT NULL,
        note               text,
        effective_from     timestamptz,
        proposed_by        uuid         NOT NULL REFERENCES users (id),
        decided_by         uuid         REFERENCES users (id),
        decided_at         timestamptz,
        source_terms_id    uuid         REFERENCES connection_terms (id),
        created_at         timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT enrollment_fee_rates_price_chk CHECK (session_price_vnd >= 0),
        CONSTRAINT enrollment_fee_rates_minutes_chk CHECK (session_minutes BETWEEN 15 AND 600),
        CONSTRAINT enrollment_fee_rates_status_chk
          CHECK (status IN ('proposed', 'active', 'rejected', 'superseded', 'withdrawn')),
        CONSTRAINT enrollment_fee_rates_effective_chk
          CHECK ((status IN ('active', 'superseded')) = (effective_from IS NOT NULL)),
        CONSTRAINT enrollment_fee_rates_decided_chk
          CHECK (status <> 'proposed' OR decided_at IS NULL)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX enrollment_fee_rates_active_uq ON enrollment_fee_rates (enrollment_id)
        WHERE status = 'active'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX enrollment_fee_rates_proposed_uq ON enrollment_fee_rates (enrollment_id)
        WHERE status = 'proposed'
    `);
    // Lịch sử mức học phí của một ghi danh.
    await queryRunner.query(`
      CREATE INDEX enrollment_fee_rates_enrollment_idx ON enrollment_fee_rates (enrollment_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE learning_goals (
        id             uuid         PRIMARY KEY DEFAULT uuidv7(),
        enrollment_id  uuid         NOT NULL REFERENCES class_enrollments (id),
        period_type    text         NOT NULL,
        period_start   date         NOT NULL,
        period_end     date         NOT NULL,
        description    text         NOT NULL,
        status         text         NOT NULL DEFAULT 'active',
        progress_note  text,
        created_by     uuid         NOT NULL REFERENCES users (id),
        created_at     timestamptz  NOT NULL DEFAULT now(),
        updated_at     timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT learning_goals_period_type_chk CHECK (period_type IN ('month', 'term', 'custom')),
        CONSTRAINT learning_goals_period_chk CHECK (period_end >= period_start),
        CONSTRAINT learning_goals_description_chk CHECK (length(btrim(description)) > 0),
        CONSTRAINT learning_goals_status_chk
          CHECK (status IN ('active', 'achieved', 'partially_achieved', 'not_achieved'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX learning_goals_enrollment_idx ON learning_goals (enrollment_id, period_start DESC)
    `);

    // Yêu cầu đã xác nhận hợp tác ở G5 (trước khi có bảng lớp): tạo lớp, ghi danh, mức học phí đầu tiên như
    // service làm khi xác nhận. Ngày bắt đầu: theo điều khoản, không có thì ngày xác nhận (giờ Việt Nam).
    await queryRunner.query(`
      WITH src AS (
        SELECT r.id AS request_id, r.tutor_id, r.client_user_id, r.learner_id, r.confirmed_at,
               t.id AS terms_id, t.subject_id, t.grade_level_id, t.teaching_mode,
               t.session_price_vnd, t.session_minutes, t.proposed_by,
               COALESCE(t.start_date, (r.confirmed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS started_on
          FROM connection_requests r
          JOIN connection_terms t ON t.id = r.agreed_terms_id
         WHERE r.status = 'confirmed'
      ), classes AS (
        INSERT INTO tutoring_classes
               (tutor_id, subject_id, grade_level_id, teaching_mode, started_on, created_from_request_id)
        SELECT tutor_id, subject_id, grade_level_id, teaching_mode, started_on, request_id FROM src
        RETURNING id, created_from_request_id
      ), enrollments AS (
        INSERT INTO class_enrollments (class_id, learner_id, client_user_id, connection_request_id, joined_on)
        SELECT c.id, s.learner_id, s.client_user_id, s.request_id, s.started_on
          FROM classes c JOIN src s ON s.request_id = c.created_from_request_id
        RETURNING id, connection_request_id
      )
      INSERT INTO enrollment_fee_rates
             (enrollment_id, session_price_vnd, session_minutes, status, effective_from, proposed_by,
              source_terms_id, created_at)
      SELECT e.id, s.session_price_vnd, s.session_minutes, 'active', s.confirmed_at, s.proposed_by,
             s.terms_id, s.confirmed_at
        FROM enrollments e JOIN src s ON s.request_id = e.connection_request_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE learning_goals`);
    await queryRunner.query(`DROP TABLE enrollment_fee_rates`);
    await queryRunner.query(`DROP TABLE class_enrollments`);
    await queryRunner.query(`ALTER TABLE conversations DROP CONSTRAINT conversations_class_fk`);
    await queryRunner.query(`DROP TABLE tutoring_classes`);
  }
}
