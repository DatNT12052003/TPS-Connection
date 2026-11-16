import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lịch học, buổi học, điểm danh, khiếu nại, điểm và nhận xét (docs/thiet_ke_co_so_du_lieu.md mục 7.2–7.4; trạng thái
 * B.6–B.8; G6 đợt 2), và các loại thông báo của lớp học.
 *
 * - `class_schedules`: lịch lặp hằng tuần. Khác thiết kế: lưu các thứ trong tuần ở `weekdays` (ISO, 1 = thứ Hai) để
 *   sinh buổi bằng SQL; `rrule` (RFC 5545, `FREQ=WEEKLY;BYDAY=…`) vẫn lưu để trao đổi với lịch ngoài. Buổi lẻ, buổi bù
 *   không cần dòng lịch (`lessons.schedule_id` NULL), nên không có `kind = 'one_off'`.
 * - `lessons`: buổi cụ thể. Sinh trước 8 tuần (D27); `lessons_occurrence_uq` chống sinh trùng. Thêm so với thiết kế:
 *   `cancel_kind` (ai / việc gì hủy: học lại thì khôi phục các buổi hủy vì tạm nghỉ), mốc đã nhắc buổi sắp tới và
 *   nhắc điểm danh (D36), `created_by`.
 * - `lesson_attendances`: mỗi học sinh mỗi buổi một dòng, chụp giá học phí lúc ghi (D17), xác nhận của phụ huynh (C5).
 * - `attendance_disputes`: khiếu nại; `case_id` chưa có khóa ngoại (G8 cùng `moderation_cases`).
 * - `assessments`: điểm và nhận xét; `submission_id` chưa có khóa ngoại (bản 3 cùng bài tập).
 */
export class CreateLessons1794971400000 implements MigrationInterface {
  name = 'CreateLessons1794971400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE class_schedules (
        id                uuid         PRIMARY KEY DEFAULT uuidv7(),
        class_id          uuid         NOT NULL REFERENCES tutoring_classes (id),
        weekdays          smallint[]   NOT NULL,
        rrule             text         NOT NULL,
        start_date        date         NOT NULL,
        until_date        date,
        local_start_time  time         NOT NULL,
        duration_minutes  smallint     NOT NULL,
        timezone          text         NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
        teaching_mode     text         NOT NULL,
        location_note     text,
        online_url        text,
        generated_until   date,
        status            text         NOT NULL DEFAULT 'active',
        ended_at          timestamptz,
        created_by        uuid         NOT NULL REFERENCES users (id),
        created_at        timestamptz  NOT NULL DEFAULT now(),
        updated_at        timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT class_schedules_weekdays_chk CHECK (
          cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
        ),
        CONSTRAINT class_schedules_until_chk CHECK (until_date IS NULL OR until_date >= start_date),
        CONSTRAINT class_schedules_duration_chk CHECK (duration_minutes BETWEEN 15 AND 600),
        CONSTRAINT class_schedules_teaching_mode_chk CHECK (teaching_mode IN ('online', 'in_person')),
        CONSTRAINT class_schedules_status_chk CHECK (status IN ('active', 'ended')),
        CONSTRAINT class_schedules_ended_chk CHECK ((status = 'ended') = (ended_at IS NOT NULL))
      )
    `);
    // Lịch của một lớp; job sinh buổi đọc lịch đang áp dụng.
    await queryRunner.query(
      `CREATE INDEX class_schedules_class_idx ON class_schedules (class_id) WHERE status = 'active'`,
    );

    await queryRunner.query(`
      CREATE TABLE lessons (
        id                      uuid         PRIMARY KEY DEFAULT uuidv7(),
        class_id                uuid         NOT NULL REFERENCES tutoring_classes (id),
        tutor_id                uuid         NOT NULL REFERENCES tutor_profiles (user_id),
        schedule_id             uuid         REFERENCES class_schedules (id),
        occurrence_start        timestamptz,
        starts_at               timestamptz  NOT NULL,
        ends_at                 timestamptz  NOT NULL,
        teaching_mode           text         NOT NULL,
        location_note           text,
        online_url              text,
        status                  text         NOT NULL DEFAULT 'scheduled',
        makeup_for_lesson_id    uuid         REFERENCES lessons (id),
        cancelled_by            uuid         REFERENCES users (id),
        cancelled_at            timestamptz,
        cancel_kind             text,
        cancel_reason           text,
        is_late_cancellation    boolean      NOT NULL DEFAULT false,
        content_taught          text,
        tutor_notes             text,
        actual_minutes          smallint,
        recorded_at             timestamptz,
        recorded_by             uuid         REFERENCES users (id),
        upcoming_reminded_at    timestamptz,
        attendance_reminded_at  timestamptz,
        created_by              uuid         REFERENCES users (id),
        created_at              timestamptz  NOT NULL DEFAULT now(),
        updated_at              timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT lessons_time_chk CHECK (ends_at > starts_at),
        CONSTRAINT lessons_occurrence_chk CHECK ((schedule_id IS NULL) = (occurrence_start IS NULL)),
        CONSTRAINT lessons_teaching_mode_chk CHECK (teaching_mode IN ('online', 'in_person')),
        CONSTRAINT lessons_status_chk CHECK (status IN ('scheduled', 'held', 'cancelled', 'tutor_absent')),
        CONSTRAINT lessons_cancel_kind_chk CHECK (cancel_kind IN ('party', 'class_paused', 'class_ended')),
        CONSTRAINT lessons_cancelled_chk CHECK (
          (status = 'cancelled') = (cancelled_at IS NOT NULL)
          AND (status = 'cancelled') = (cancel_kind IS NOT NULL)
        ),
        CONSTRAINT lessons_party_cancel_chk CHECK (cancel_kind IS DISTINCT FROM 'party' OR cancelled_by IS NOT NULL),
        CONSTRAINT lessons_late_cancel_chk CHECK (NOT is_late_cancellation OR cancel_kind = 'party'),
        CONSTRAINT lessons_recorded_chk CHECK ((status IN ('held', 'tutor_absent')) = (recorded_at IS NOT NULL)),
        CONSTRAINT lessons_actual_minutes_chk CHECK (actual_minutes BETWEEN 0 AND 600),
        CONSTRAINT lessons_makeup_chk CHECK (makeup_for_lesson_id IS NULL OR makeup_for_lesson_id <> id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX lessons_occurrence_uq ON lessons (schedule_id, occurrence_start)
        WHERE schedule_id IS NOT NULL
    `);
    // Lịch theo ngày/tuần/tháng của gia sư.
    await queryRunner.query(`CREATE INDEX lessons_tutor_time_idx ON lessons (tutor_id, starts_at)`);
    // Lịch của lớp (phụ huynh, học sinh xem qua ghi danh).
    await queryRunner.query(`CREATE INDEX lessons_class_time_idx ON lessons (class_id, starts_at)`);
    // Job nhắc buổi sắp diễn ra và nhắc điểm danh.
    await queryRunner.query(
      `CREATE INDEX lessons_upcoming_idx ON lessons (starts_at) WHERE status = 'scheduled'`,
    );

    await queryRunner.query(`
      CREATE TABLE lesson_attendances (
        id                    uuid         PRIMARY KEY DEFAULT uuidv7(),
        lesson_id             uuid         NOT NULL REFERENCES lessons (id),
        enrollment_id         uuid         NOT NULL REFERENCES class_enrollments (id),
        status                text         NOT NULL,
        tutor_comment         text,
        fee_rate_id           uuid         REFERENCES enrollment_fee_rates (id),
        session_price_vnd     bigint       NOT NULL,
        session_minutes       smallint     NOT NULL,
        is_billable           boolean      NOT NULL DEFAULT false,
        billable_amount_vnd   bigint       NOT NULL DEFAULT 0,
        confirmation_status   text         NOT NULL DEFAULT 'pending',
        confirm_due_at        timestamptz  NOT NULL,
        confirm_reminded_at   timestamptz,
        confirmed_at          timestamptz,
        confirmed_by          uuid         REFERENCES users (id),
        created_at            timestamptz  NOT NULL DEFAULT now(),
        updated_at            timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT lesson_attendances_lesson_enrollment_uq UNIQUE (lesson_id, enrollment_id),
        CONSTRAINT lesson_attendances_status_chk CHECK (
          status IN ('present', 'absent_notified', 'absent_no_show', 'not_applicable')
        ),
        CONSTRAINT lesson_attendances_price_chk CHECK (session_price_vnd >= 0),
        CONSTRAINT lesson_attendances_amount_chk CHECK (billable_amount_vnd >= 0),
        CONSTRAINT lesson_attendances_billable_chk CHECK (is_billable OR billable_amount_vnd = 0),
        CONSTRAINT lesson_attendances_confirmation_chk CHECK (
          confirmation_status IN ('pending', 'confirmed', 'auto_confirmed', 'disputed', 'resolved')
        ),
        CONSTRAINT lesson_attendances_confirmed_chk CHECK (
          (confirmation_status IN ('confirmed', 'auto_confirmed', 'resolved')) = (confirmed_at IS NOT NULL)
        )
      )
    `);
    // Job nhắc và tự chốt sau 48 giờ.
    await queryRunner.query(`
      CREATE INDEX lesson_attendances_due_idx ON lesson_attendances (confirm_due_at)
        WHERE confirmation_status = 'pending'
    `);
    // Lịch sử điểm danh của một học sinh; tổng hợp học phí theo tháng (G7).
    await queryRunner.query(`
      CREATE INDEX lesson_attendances_enrollment_idx ON lesson_attendances (enrollment_id, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE attendance_disputes (
        id               uuid         PRIMARY KEY DEFAULT uuidv7(),
        attendance_id    uuid         NOT NULL REFERENCES lesson_attendances (id),
        opened_by        uuid         NOT NULL REFERENCES users (id),
        reason           text         NOT NULL,
        claimed_status   text,
        status           text         NOT NULL DEFAULT 'open',
        negotiate_until  timestamptz  NOT NULL,
        escalated_at     timestamptz,
        case_id          uuid,
        resolution_note  text,
        resolved_by      uuid         REFERENCES users (id),
        resolved_at      timestamptz,
        created_at       timestamptz  NOT NULL DEFAULT now(),
        updated_at       timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT attendance_disputes_claimed_chk CHECK (
          claimed_status IN ('present', 'absent_notified', 'absent_no_show', 'not_applicable')
        ),
        CONSTRAINT attendance_disputes_status_chk CHECK (
          status IN ('open', 'settled_by_parties', 'escalated', 'resolved_by_manager', 'withdrawn')
        ),
        CONSTRAINT attendance_disputes_escalated_chk CHECK (
          status NOT IN ('escalated', 'resolved_by_manager') OR escalated_at IS NOT NULL
        ),
        CONSTRAINT attendance_disputes_resolved_chk CHECK (
          (status IN ('settled_by_parties', 'resolved_by_manager', 'withdrawn')) = (resolved_at IS NOT NULL)
        ),
        CONSTRAINT attendance_disputes_manager_chk CHECK (
          status <> 'resolved_by_manager' OR (resolved_by IS NOT NULL AND resolution_note IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX attendance_disputes_active_uq ON attendance_disputes (attendance_id)
        WHERE status IN ('open', 'escalated')
    `);
    // Job chuyển Manager khi hết 3 ngày.
    await queryRunner.query(`
      CREATE INDEX attendance_disputes_deadline_idx ON attendance_disputes (negotiate_until)
        WHERE status = 'open'
    `);
    // Hàng chờ của Manager.
    await queryRunner.query(`
      CREATE INDEX attendance_disputes_queue_idx ON attendance_disputes (status, escalated_at)
        WHERE status IN ('escalated', 'resolved_by_manager')
    `);
    await queryRunner.query(
      `CREATE INDEX attendance_disputes_attendance_idx ON attendance_disputes (attendance_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE assessments (
        id             uuid          PRIMARY KEY DEFAULT uuidv7(),
        enrollment_id  uuid          NOT NULL REFERENCES class_enrollments (id),
        lesson_id      uuid          REFERENCES lessons (id),
        submission_id  uuid,
        kind           text          NOT NULL,
        title          text          NOT NULL,
        score          numeric(6,2),
        max_score      numeric(6,2)  NOT NULL DEFAULT 10,
        comment        text          NOT NULL,
        assessed_on    date          NOT NULL,
        created_by     uuid          NOT NULL REFERENCES users (id),
        created_at     timestamptz   NOT NULL DEFAULT now(),
        updated_at     timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT assessments_kind_chk CHECK (kind IN ('lesson', 'quiz', 'test', 'assignment')),
        CONSTRAINT assessments_title_chk CHECK (length(btrim(title)) > 0),
        CONSTRAINT assessments_comment_chk CHECK (length(btrim(comment)) > 0),
        CONSTRAINT assessments_max_score_chk CHECK (max_score > 0),
        CONSTRAINT assessments_score_chk CHECK (score IS NULL OR score BETWEEN 0 AND max_score)
      )
    `);
    // Điểm theo thời gian của một học sinh. Không có bảng hay view xếp hạng giữa các học sinh (§9).
    await queryRunner.query(
      `CREATE INDEX assessments_enrollment_idx ON assessments (enrollment_id, assessed_on)`,
    );
    await queryRunner.query(
      `CREATE INDEX assessments_lesson_idx ON assessments (lesson_id) WHERE lesson_id IS NOT NULL`,
    );

    await this.setNotificationTypes(queryRunner, [...BASE_TYPES, ...CLASS_TYPES]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM notifications WHERE type = ANY($1::text[])`, [
      CLASS_TYPES,
    ]);
    await queryRunner.query(`DELETE FROM notification_preferences WHERE type = ANY($1::text[])`, [
      CLASS_TYPES,
    ]);
    await this.setNotificationTypes(queryRunner, BASE_TYPES);
    await queryRunner.query(`DROP TABLE assessments`);
    await queryRunner.query(`DROP TABLE attendance_disputes`);
    await queryRunner.query(`DROP TABLE lesson_attendances`);
    await queryRunner.query(`DROP TABLE lessons`);
    await queryRunner.query(`DROP TABLE class_schedules`);
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

const BASE_TYPES = [
  'connection_received',
  'connection_accepted',
  'connection_rejected',
  'connection_expiring',
  'connection_confirmed',
  'message_new',
  'verification_result',
] as const;

const CLASS_TYPES = [
  'class_status',
  'fee_change',
  'lesson_upcoming',
  'lesson_changed',
  'attendance_reminder',
  'lesson_to_confirm',
  'lesson_dispute',
  'assessment_new',
] as const;
