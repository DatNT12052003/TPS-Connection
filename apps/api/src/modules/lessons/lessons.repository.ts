// Truy cập lịch, buổi học, điểm danh, khiếu nại, điểm. Không kiểm tra quyền (service làm qua vai trò trong lớp).
// Mọi phép tính ngày theo giờ địa phương làm trong SQL (`AT TIME ZONE`), thời điểm lưu UTC.
import type {
  AttendanceDisputeStatus,
  AttendanceStatus,
  LessonCancelKind,
  LessonMode,
} from '@tps/shared';
import { LESSON_LIMITS } from '@tps/shared';
import { type EntityManager, In } from 'typeorm';
import {
  AssessmentRow,
  AttendanceDisputeRow,
  ClassScheduleRow,
  LessonAttendanceRow,
  LessonRow,
} from './lesson.entity.js';

const DAY_NAMES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

/** RRULE (RFC 5545) cho các thứ ISO (1 = thứ Hai), để trao đổi với lịch ngoài. */
export function weeklyRrule(weekdays: readonly number[]): string {
  const days = [...weekdays].sort((a, b) => a - b).map((d) => DAY_NAMES[d - 1]);
  return `FREQ=WEEKLY;BYDAY=${days.join(',')}`;
}

/** Ngày cuối cùng được sinh buổi: hôm nay (giờ Việt Nam) + N tuần (D27). */
const HORIZON = `((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + ($1::int * 7))`;

export interface NewSchedule {
  classId: string;
  weekdays: number[];
  startTime: string;
  durationMinutes: number;
  startDate: string;
  untilDate: string | null;
  teachingMode: LessonMode;
  locationNote: string | null;
  onlineUrl: string | null;
  createdBy: string;
}

export interface NewLesson {
  classId: string;
  tutorId: string;
  startsAt: Date;
  endsAt: Date;
  teachingMode: LessonMode;
  locationNote: string | null;
  onlineUrl: string | null;
  makeupForLessonId: string | null;
  createdBy: string;
}

/** Ghi danh cần điểm danh ở một buổi: đã vào lớp trước ngày học và chưa rời lớp trước ngày học. */
export interface LessonEnrollment {
  enrollmentId: string;
  learnerId: string;
  activeRateId: string | null;
  activePrice: number | null;
  activeMinutes: number | null;
}

export interface AttendanceWrite {
  enrollmentId: string;
  status: AttendanceStatus;
  comment: string | null;
  feeRateId: string | null;
  sessionPriceVnd: number;
  sessionMinutes: number;
  isBillable: boolean;
  billableAmountVnd: number;
}

/** Một dòng job vừa đánh dấu (nhắc, tự chốt, chuyển Manager): đủ để dựng thông báo. */
export interface JobLessonRow {
  lessonId: string;
  classId: string;
  startsAt: Date;
  confirmDueAt?: Date;
}

export function createLessonsRepository(manager: EntityManager) {
  const schedules = manager.getRepository(ClassScheduleRow);
  const lessons = manager.getRepository(LessonRow);
  const attendances = manager.getRepository(LessonAttendanceRow);
  const disputes = manager.getRepository(AttendanceDisputeRow);
  const assessments = manager.getRepository(AssessmentRow);

  return {
    // ---- Lịch lặp --------------------------------------------------------------------------------

    schedulesOf(classId: string): Promise<ClassScheduleRow[]> {
      return schedules.find({ where: { classId }, order: { createdAt: 'ASC', id: 'ASC' } });
    },

    findSchedule(classId: string, scheduleId: string): Promise<ClassScheduleRow | null> {
      return schedules.findOneBy({ id: scheduleId, classId });
    },

    countActiveSchedules(classId: string): Promise<number> {
      return schedules.countBy({ classId, status: 'active' });
    },

    async createSchedule(data: NewSchedule): Promise<ClassScheduleRow> {
      const { startTime, ...rest } = data;
      return schedules.save(
        schedules.create({
          ...rest,
          localStartTime: startTime,
          rrule: weeklyRrule(data.weekdays),
          status: 'active',
        }),
      );
    },

    async replaceSchedule(id: string, data: Omit<NewSchedule, 'classId' | 'createdBy'>) {
      const { startTime, ...rest } = data;
      await schedules.update(
        { id },
        {
          ...rest,
          localStartTime: startTime,
          rrule: weeklyRrule(data.weekdays),
          generatedUntil: null,
        },
      );
    },

    async endSchedule(id: string): Promise<void> {
      await schedules.update({ id }, { status: 'ended', endedAt: new Date() });
    },

    /** Kết thúc lớp: mọi lịch của lớp dừng. */
    async endSchedulesOfClass(classId: string): Promise<void> {
      await manager.query(
        `UPDATE class_schedules SET status = 'ended', ended_at = now(), updated_at = now()
          WHERE class_id = $1 AND status = 'active'`,
        [classId],
      );
    },

    /**
     * Xóa các buổi tương lai còn `scheduled` sinh từ một lịch (sửa hoặc dừng lịch). Buổi đã qua, đã dời rồi hủy, đã
     * điểm danh giữ nguyên (§7: thay đổi không làm đổi buổi đã diễn ra).
     */
    async deleteFutureOfSchedule(scheduleId: string): Promise<number> {
      const rows = await manager.query<{ id: string }[]>(
        `WITH deleted AS (
           DELETE FROM lessons
            WHERE schedule_id = $1 AND status = 'scheduled' AND starts_at > now()
           RETURNING id
         ) SELECT id FROM deleted`,
        [scheduleId],
      );
      return rows.length;
    },

    /**
     * Sinh buổi học từ lịch đang áp dụng của lớp đang học, từ hôm nay tới hôm nay + N tuần (D27), chỉ buổi chưa bắt
     * đầu. `lessons_occurrence_uq` bỏ qua buổi đã có (kể cả đã dời, đã hủy), nên chạy lại không sinh trùng.
     * `scheduleIds`: chỉ các lịch này (vừa tạo, vừa sửa, lớp vừa học lại); không có: mọi lịch chưa sinh đủ (job).
     * Trả số buổi mới.
     */
    async generate(
      scheduleIds: string[] | null,
      weeks: number = LESSON_LIMITS.generateWeeks,
    ): Promise<number> {
      const [row] = await manager.query<{ n: number }[]>(
        `WITH s AS (
           SELECT sc.*, c.tutor_id
             FROM class_schedules sc JOIN tutoring_classes c ON c.id = sc.class_id
            WHERE sc.status = 'active' AND c.status = 'active'
              AND ($2::uuid[] IS NOT NULL OR sc.generated_until IS NULL OR sc.generated_until < ${HORIZON})
              AND ($2::uuid[] IS NULL OR sc.id = ANY($2::uuid[]))
            FOR UPDATE OF sc
         ), occ AS (
           SELECT s.id AS schedule_id, s.class_id, s.tutor_id, s.teaching_mode, s.location_note, s.online_url,
                  s.duration_minutes,
                  ((d::date + s.local_start_time) AT TIME ZONE s.timezone) AS occurrence_start
             FROM s,
                  generate_series(
                    GREATEST(s.start_date, (now() AT TIME ZONE s.timezone)::date),
                    LEAST(COALESCE(s.until_date, ${HORIZON}), ${HORIZON}),
                    interval '1 day'
                  ) AS d
            WHERE extract(isodow FROM d)::smallint = ANY(s.weekdays)
         ), ins AS (
           INSERT INTO lessons (class_id, tutor_id, schedule_id, occurrence_start, starts_at, ends_at,
                                teaching_mode, location_note, online_url)
           SELECT class_id, tutor_id, schedule_id, occurrence_start, occurrence_start,
                  occurrence_start + make_interval(mins => duration_minutes),
                  teaching_mode, location_note, online_url
             FROM occ
            WHERE occurrence_start > now()
           ON CONFLICT (schedule_id, occurrence_start) WHERE schedule_id IS NOT NULL DO NOTHING
           RETURNING id
         ), marked AS (
           UPDATE class_schedules SET generated_until = ${HORIZON}
            WHERE id IN (SELECT id FROM s)
           RETURNING id
         )
         SELECT (SELECT count(*) FROM ins)::int AS n, (SELECT count(*) FROM marked)::int AS m`,
        [weeks, scheduleIds],
      );
      return row?.n ?? 0;
    },

    // ---- Buổi học --------------------------------------------------------------------------------

    findLesson(id: string, options: { lock?: boolean } = {}): Promise<LessonRow | null> {
      const query = lessons.createQueryBuilder('l').where('l.id = :id', { id });
      if (options.lock) query.setLock('pessimistic_write');
      return query.getOne();
    },

    /** Buổi của các lớp trong khoảng [from, to), sớm trước. */
    lessonsInRange(classIds: string[], from: Date, to: Date): Promise<LessonRow[]> {
      if (classIds.length === 0) return Promise.resolve([]);
      return lessons
        .createQueryBuilder('l')
        .where('l.classId IN (:...classIds)', { classIds })
        .andWhere('l.startsAt < :to AND l.endsAt > :from', { from, to })
        .orderBy('l.startsAt', 'ASC')
        .addOrderBy('l.id', 'ASC')
        .getMany();
    },

    /** Buổi đã bắt đầu mà gia sư chưa điểm danh (lớp chưa kết thúc), cũ trước. */
    awaitingAttendance(classIds: string[]): Promise<LessonRow[]> {
      if (classIds.length === 0) return Promise.resolve([]);
      return lessons
        .createQueryBuilder('l')
        .where('l.classId IN (:...classIds)', { classIds })
        .andWhere(`l.status = 'scheduled' AND l.startsAt <= now()`)
        .orderBy('l.startsAt', 'ASC')
        .limit(100)
        .getMany();
    },

    /** Buổi có điểm danh đang chờ xác nhận của các ghi danh này, cũ trước. */
    async awaitingConfirmation(enrollmentIds: string[]): Promise<LessonRow[]> {
      if (enrollmentIds.length === 0) return [];
      return lessons
        .createQueryBuilder('l')
        .where(
          `EXISTS (SELECT 1 FROM lesson_attendances a
                    WHERE a.lesson_id = l.id AND a.confirmation_status = 'pending'
                      AND a.enrollment_id IN (:...enrollmentIds))`,
          { enrollmentIds },
        )
        .orderBy('l.startsAt', 'ASC')
        .limit(100)
        .getMany();
    },

    async createLesson(data: NewLesson): Promise<LessonRow> {
      return lessons.save(lessons.create({ ...data, status: 'scheduled' }));
    },

    async updateLesson(id: string, changes: Partial<LessonRow>): Promise<void> {
      await lessons.update({ id }, changes);
    },

    /**
     * Hệ thống hủy các buổi tương lai còn `scheduled` của lớp (tạm nghỉ, kết thúc; B.5.1). Không tính hủy muộn.
     * Trả số buổi đã hủy.
     */
    async cancelFutureOfClass(classId: string, kind: LessonCancelKind): Promise<number> {
      const rows = await manager.query<{ id: string }[]>(
        `WITH updated AS (
           UPDATE lessons
              SET status = 'cancelled', cancelled_at = now(), cancel_kind = $2, updated_at = now()
            WHERE class_id = $1 AND status = 'scheduled' AND starts_at > now()
           RETURNING id
         ) SELECT id FROM updated`,
        [classId, kind],
      );
      return rows.length;
    },

    /**
     * Học lại (D35): khôi phục các buổi tương lai đã hủy vì lớp tạm nghỉ (buổi của lịch đã dừng thì không). Buổi
     * mới của lịch còn hiệu lực do `generate` sinh tiếp.
     */
    async restorePausedOfClass(classId: string): Promise<number> {
      const rows = await manager.query<{ id: string }[]>(
        `WITH updated AS (
           UPDATE lessons l
              SET status = 'scheduled', cancelled_at = NULL, cancel_kind = NULL, cancel_reason = NULL,
                  upcoming_reminded_at = NULL, updated_at = now()
            WHERE l.class_id = $1 AND l.cancel_kind = 'class_paused' AND l.starts_at > now()
              AND (l.schedule_id IS NULL OR EXISTS (
                SELECT 1 FROM class_schedules s WHERE s.id = l.schedule_id AND s.status = 'active'))
           RETURNING id
         ) SELECT id FROM updated`,
        [classId],
      );
      return rows.length;
    },

    activeScheduleIds(classId: string): Promise<string[]> {
      return schedules.findBy({ classId, status: 'active' }).then((rows) => rows.map((r) => r.id));
    },

    // ---- Điểm danh -------------------------------------------------------------------------------

    /** Ghi danh cần điểm danh ở buổi `lessonId`, kèm mức học phí đang áp dụng (chụp giá, D17). */
    async enrollmentsForLesson(lessonId: string): Promise<LessonEnrollment[]> {
      const rows = await manager.query<
        {
          enrollment_id: string;
          learner_id: string;
          rate_id: string | null;
          price: number | null;
          minutes: number | null;
        }[]
      >(
        `SELECT e.id AS enrollment_id, e.learner_id, r.id AS rate_id,
                r.session_price_vnd AS price, r.session_minutes AS minutes
           FROM lessons l
           JOIN class_enrollments e ON e.class_id = l.class_id
           LEFT JOIN enrollment_fee_rates r ON r.enrollment_id = e.id AND r.status = 'active'
          WHERE l.id = $1
            AND e.joined_on <= (l.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            AND (e.left_on IS NULL OR e.left_on >= (l.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
          ORDER BY e.joined_on, e.id`,
        [lessonId],
      );
      return rows.map((r) => ({
        enrollmentId: r.enrollment_id,
        learnerId: r.learner_id,
        activeRateId: r.rate_id,
        activePrice: r.price,
        activeMinutes: r.minutes,
      }));
    },

    attendancesOf(lessonIds: string[]): Promise<LessonAttendanceRow[]> {
      if (lessonIds.length === 0) return Promise.resolve([]);
      return attendances.find({
        where: { lessonId: In(lessonIds) },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
    },

    findAttendance(lessonId: string, attendanceId: string): Promise<LessonAttendanceRow | null> {
      return attendances.findOneBy({ id: attendanceId, lessonId });
    },

    /**
     * Ghi hoặc sửa điểm danh của một buổi. Dòng mới: chụp giá, hạn xác nhận `due`. Dòng có sẵn: giữ giá đã chụp;
     * `due` khác null thì đặt lại hạn và bỏ mốc đã nhắc (D37).
     */
    async upsertAttendances(
      lessonId: string,
      rows: AttendanceWrite[],
      due: Date | null,
    ): Promise<void> {
      for (const r of rows) {
        await manager.query(
          `INSERT INTO lesson_attendances
                  (lesson_id, enrollment_id, status, tutor_comment, fee_rate_id, session_price_vnd,
                   session_minutes, is_billable, billable_amount_vnd, confirm_due_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, now()))
           ON CONFLICT (lesson_id, enrollment_id) DO UPDATE
              SET status = EXCLUDED.status,
                  tutor_comment = EXCLUDED.tutor_comment,
                  is_billable = EXCLUDED.is_billable,
                  billable_amount_vnd = CASE WHEN EXCLUDED.is_billable
                                             THEN lesson_attendances.session_price_vnd ELSE 0 END,
                  confirm_due_at = COALESCE($10::timestamptz, lesson_attendances.confirm_due_at),
                  confirm_reminded_at = CASE WHEN $10::timestamptz IS NULL
                                             THEN lesson_attendances.confirm_reminded_at END,
                  updated_at = now()`,
          [
            lessonId,
            r.enrollmentId,
            r.status,
            r.comment,
            r.feeRateId,
            r.sessionPriceVnd,
            r.sessionMinutes,
            r.isBillable,
            r.billableAmountVnd,
            due,
          ],
        );
      }
    },

    async updateAttendance(id: string, changes: Partial<LessonAttendanceRow>): Promise<void> {
      await attendances.update({ id }, changes);
    },

    // ---- Khiếu nại -------------------------------------------------------------------------------

    /** Khiếu nại gần nhất của mỗi điểm danh. */
    async latestDisputes(attendanceIds: string[]): Promise<Map<string, AttendanceDisputeRow>> {
      const result = new Map<string, AttendanceDisputeRow>();
      if (attendanceIds.length === 0) return result;
      const rows = await disputes.find({
        where: { attendanceId: In(attendanceIds) },
        order: { createdAt: 'ASC' },
      });
      for (const row of rows) result.set(row.attendanceId, row);
      return result;
    },

    findActiveDispute(attendanceId: string): Promise<AttendanceDisputeRow | null> {
      return disputes
        .createQueryBuilder('d')
        .where('d.attendanceId = :attendanceId', { attendanceId })
        .andWhere(`d.status IN ('open', 'escalated')`)
        .setLock('pessimistic_write')
        .getOne();
    },

    findDispute(
      id: string,
      options: { lock?: boolean } = {},
    ): Promise<AttendanceDisputeRow | null> {
      const query = disputes.createQueryBuilder('d').where('d.id = :id', { id });
      if (options.lock) query.setLock('pessimistic_write');
      return query.getOne();
    },

    async openDispute(data: {
      attendanceId: string;
      openedBy: string;
      reason: string;
      claimedStatus: AttendanceStatus | null;
      negotiateUntil: Date;
    }): Promise<AttendanceDisputeRow> {
      return disputes.save(disputes.create({ ...data, status: 'open' }));
    },

    async updateDispute(id: string, changes: Partial<AttendanceDisputeRow>): Promise<void> {
      await disputes.update({ id }, changes);
    },

    /** Hàng chờ của Manager: khiếu nại đã chuyển (cũ trước) hoặc đã quyết định (mới trước). */
    async adminDisputes(
      status: Extract<AttendanceDisputeStatus, 'escalated' | 'resolved_by_manager'>,
      page: number,
      pageSize: number,
    ): Promise<{ ids: string[]; total: number }> {
      const order = status === 'escalated' ? 'ASC' : 'DESC';
      const [rows, total] = await disputes
        .createQueryBuilder('d')
        .where('d.status = :status', { status })
        .orderBy(status === 'escalated' ? 'd.escalatedAt' : 'd.resolvedAt', order)
        .addOrderBy('d.id', order)
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount();
      return { ids: rows.map((r) => r.id), total };
    },

    /** Cột hiển thị cho Manager: không có tên hay hồ sơ của trẻ. */
    async adminDisputeRows(ids: string[]) {
      if (ids.length === 0) return [];
      return manager.query<
        {
          id: string;
          status: AttendanceDisputeStatus;
          reason: string;
          claimed_status: AttendanceStatus | null;
          negotiate_until: Date;
          created_at: Date;
          resolution_note: string | null;
          resolved_at: Date | null;
          subject_id: number;
          tutor_name: string;
          client_name: string;
          lesson_id: string;
          lesson_status: LessonRow['status'];
          starts_at: Date;
          ends_at: Date;
          content_taught: string | null;
          actual_minutes: number | null;
          attendance_id: string;
          attendance_status: AttendanceStatus;
          tutor_comment: string | null;
          session_price_vnd: number;
        }[]
      >(
        `SELECT d.id, d.status, d.reason, d.claimed_status, d.negotiate_until, d.created_at,
                d.resolution_note, d.resolved_at,
                c.subject_id, tu.display_name AS tutor_name, cu.display_name AS client_name,
                l.id AS lesson_id, l.status AS lesson_status, l.starts_at, l.ends_at, l.content_taught,
                l.actual_minutes,
                a.id AS attendance_id, a.status AS attendance_status, a.tutor_comment, a.session_price_vnd
           FROM attendance_disputes d
           JOIN lesson_attendances a ON a.id = d.attendance_id
           JOIN lessons l ON l.id = a.lesson_id
           JOIN tutoring_classes c ON c.id = l.class_id
           JOIN users tu ON tu.id = c.tutor_id
           JOIN users cu ON cu.id = d.opened_by
          WHERE d.id = ANY($1::uuid[])`,
        [ids],
      );
    },

    // ---- Điểm và nhận xét ------------------------------------------------------------------------

    assessmentsOf(where: {
      enrollmentIds?: string[];
      lessonId?: string;
    }): Promise<AssessmentRow[]> {
      const query = assessments.createQueryBuilder('s');
      if (where.enrollmentIds) {
        if (where.enrollmentIds.length === 0) return Promise.resolve([]);
        query.where('s.enrollmentId IN (:...ids)', { ids: where.enrollmentIds });
      }
      if (where.lessonId) query.andWhere('s.lessonId = :lessonId', { lessonId: where.lessonId });
      return query.orderBy('s.assessedOn', 'DESC').addOrderBy('s.createdAt', 'DESC').getMany();
    },

    findAssessment(enrollmentId: string, id: string): Promise<AssessmentRow | null> {
      return assessments.findOneBy({ id, enrollmentId });
    },

    async createAssessment(
      data: Pick<
        AssessmentRow,
        'enrollmentId' | 'lessonId' | 'kind' | 'title' | 'comment' | 'assessedOn' | 'createdBy'
      > & { score: number | null; maxScore: number },
    ): Promise<AssessmentRow> {
      return assessments.save(
        assessments.create({
          ...data,
          score: data.score === null ? null : String(data.score),
          maxScore: String(data.maxScore),
        }),
      );
    },

    async updateAssessment(id: string, changes: Partial<AssessmentRow>): Promise<void> {
      await assessments.update({ id }, changes);
    },

    // ---- Job -------------------------------------------------------------------------------------

    /** Đánh dấu nhắc buổi sắp diễn ra (lớp đang học, chưa nhắc, bắt đầu trong N giờ tới). */
    async markUpcomingReminders(limit: number, hours: number): Promise<JobLessonRow[]> {
      const rows = await manager.query<{ id: string; class_id: string; starts_at: Date }[]>(
        `WITH target AS (
           SELECT l.id FROM lessons l JOIN tutoring_classes c ON c.id = l.class_id
            WHERE l.status = 'scheduled' AND l.upcoming_reminded_at IS NULL AND c.status = 'active'
              AND l.starts_at > now() AND l.starts_at <= now() + make_interval(hours => $2)
            ORDER BY l.starts_at
            LIMIT $1
            FOR UPDATE OF l SKIP LOCKED
         ), updated AS (
           UPDATE lessons l SET upcoming_reminded_at = now()
             FROM target t WHERE l.id = t.id
           RETURNING l.id, l.class_id, l.starts_at
         ) SELECT id, class_id, starts_at FROM updated`,
        [limit, hours],
      );
      return rows.map((r) => ({ lessonId: r.id, classId: r.class_id, startsAt: r.starts_at }));
    },

    /** Đánh dấu nhắc điểm danh (D36): buổi kết thúc quá N giờ vẫn `scheduled`, trong 30 ngày gần đây. */
    async markAttendanceReminders(limit: number, hours: number): Promise<JobLessonRow[]> {
      const rows = await manager.query<{ id: string; class_id: string; starts_at: Date }[]>(
        `WITH target AS (
           SELECT l.id FROM lessons l
            WHERE l.status = 'scheduled' AND l.attendance_reminded_at IS NULL
              AND l.ends_at <= now() - make_interval(hours => $2)
              AND l.ends_at > now() - interval '30 days'
            ORDER BY l.ends_at
            LIMIT $1
            FOR UPDATE OF l SKIP LOCKED
         ), updated AS (
           UPDATE lessons l SET attendance_reminded_at = now()
             FROM target t WHERE l.id = t.id
           RETURNING l.id, l.class_id, l.starts_at
         ) SELECT id, class_id, starts_at FROM updated`,
        [limit, hours],
      );
      return rows.map((r) => ({ lessonId: r.id, classId: r.class_id, startsAt: r.starts_at }));
    },

    /** Đánh dấu nhắc phụ huynh xác nhận (một lần, C5): còn chưa tới N giờ trước hạn. */
    async markConfirmReminders(
      limit: number,
      hours: number,
    ): Promise<(JobLessonRow & { enrollmentId: string })[]> {
      const rows = await manager.query<
        {
          lesson_id: string;
          class_id: string;
          starts_at: Date;
          confirm_due_at: Date;
          enrollment_id: string;
        }[]
      >(
        `WITH target AS (
           SELECT a.id FROM lesson_attendances a
            WHERE a.confirmation_status = 'pending' AND a.confirm_reminded_at IS NULL
              AND a.confirm_due_at > now() AND a.confirm_due_at <= now() + make_interval(hours => $2)
            ORDER BY a.confirm_due_at
            LIMIT $1
            FOR UPDATE OF a SKIP LOCKED
         ), updated AS (
           UPDATE lesson_attendances a SET confirm_reminded_at = now()
             FROM target t WHERE a.id = t.id
           RETURNING a.lesson_id, a.enrollment_id, a.confirm_due_at
         )
         SELECT u.lesson_id, l.class_id, l.starts_at, u.confirm_due_at, u.enrollment_id
           FROM updated u JOIN lessons l ON l.id = u.lesson_id`,
        [limit, hours],
      );
      return rows.map((r) => ({
        lessonId: r.lesson_id,
        classId: r.class_id,
        startsAt: r.starts_at,
        confirmDueAt: r.confirm_due_at,
        enrollmentId: r.enrollment_id,
      }));
    },

    /** Tự chốt điểm danh quá hạn xác nhận (C5). Trả số dòng. */
    async autoConfirmOverdue(limit: number): Promise<number> {
      const rows = await manager.query<{ id: string }[]>(
        `WITH target AS (
           SELECT id FROM lesson_attendances
            WHERE confirmation_status = 'pending' AND confirm_due_at <= now()
            ORDER BY confirm_due_at
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         ), updated AS (
           UPDATE lesson_attendances a
              SET confirmation_status = 'auto_confirmed', confirmed_at = now(), updated_at = now()
             FROM target t WHERE a.id = t.id
           RETURNING a.id
         ) SELECT id FROM updated`,
        [limit],
      );
      return rows.length;
    },

    /** Chuyển Manager các khiếu nại hết thời gian tự thống nhất (C5). */
    async escalateOverdue(limit: number): Promise<JobLessonRow[]> {
      const rows = await manager.query<{ lesson_id: string; class_id: string; starts_at: Date }[]>(
        `WITH target AS (
           SELECT id FROM attendance_disputes
            WHERE status = 'open' AND negotiate_until <= now()
            ORDER BY negotiate_until
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         ), updated AS (
           UPDATE attendance_disputes d
              SET status = 'escalated', escalated_at = now(), updated_at = now()
             FROM target t WHERE d.id = t.id
           RETURNING d.attendance_id
         )
         SELECT l.id AS lesson_id, l.class_id, l.starts_at
           FROM updated u
           JOIN lesson_attendances a ON a.id = u.attendance_id
           JOIN lessons l ON l.id = a.lesson_id`,
        [limit],
      );
      return rows.map((r) => ({
        lessonId: r.lesson_id,
        classId: r.class_id,
        startsAt: r.starts_at,
      }));
    },
  };
}

export type LessonsRepository = ReturnType<typeof createLessonsRepository>;
