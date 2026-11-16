// Truy cập bảng học phí, dòng học phí, thanh toán (G7). Không kiểm tra quyền (service làm qua các dòng "lớp × học
// sinh" người gọi thấy). Tháng luôn theo giờ Việt Nam; `$n::date` là ngày đầu tháng (`YYYY-MM-01`).
import {
  type AttendanceConfirmationStatus,
  type AttendanceStatus,
  FEE_LIMITS,
  type FeeLineState,
  type FeeStatementStatus,
  type LessonCancelKind,
  type LessonStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '@tps/shared';
import type { EntityManager } from 'typeorm';

const TZ = `'Asia/Ho_Chi_Minh'`;
/** Ngày hôm nay theo giờ Việt Nam, tính trong database (cùng đồng hồ với `now()`). */
const TODAY_VN = `(now() AT TIME ZONE ${TZ})::date`;
/** Thời điểm bắt đầu / kết thúc của tháng `expr` (ngày đầu tháng) theo giờ Việt Nam. */
const monthStartAt = (expr: string) => `((${expr})::timestamp AT TIME ZONE ${TZ})`;
const monthEndAt = (expr: string) =>
  `(((${expr}) + interval '1 month')::timestamp AT TIME ZONE ${TZ})`;
/** Buổi đã chốt (C5): chỉ các trạng thái này mới vào bảng học phí. */
const FINAL = `('confirmed', 'auto_confirmed', 'resolved')`;

/**
 * Trạng thái tính tiền của một buổi với một học sinh (`FeeLineState`), từ các alias `l` (lessons), `a` (điểm danh của
 * học sinh, có thể NULL), `i` (dòng học phí chưa hủy của điểm danh, có thể NULL).
 */
const LINE_STATE = `CASE
    WHEN i.id IS NOT NULL THEN 'billed'
    WHEN l.status = 'cancelled' THEN 'cancelled'
    WHEN a.id IS NOT NULL AND a.confirmation_status = 'pending' THEN 'pending_confirmation'
    WHEN a.id IS NOT NULL AND a.confirmation_status = 'disputed' THEN 'disputed'
    WHEN a.id IS NOT NULL AND a.is_billable THEN 'billable'
    WHEN a.id IS NOT NULL OR l.status IN ('held', 'tutor_absent') THEN 'not_billable'
    WHEN l.starts_at <= now() THEN 'not_recorded'
    ELSE 'upcoming'
  END`;

/** Buổi của lớp với điểm danh của học sinh `e` và dòng học phí (nếu đã tính). */
const LESSON_JOINS = `
    FROM lessons l
    JOIN class_enrollments e ON e.class_id = l.class_id
    LEFT JOIN lesson_attendances a ON a.lesson_id = l.id AND a.enrollment_id = e.id
    LEFT JOIN fee_statement_items i ON i.attendance_id = a.id AND i.voided_at IS NULL
    LEFT JOIN fee_statements s ON s.id = i.statement_id`;

export interface FeeLineRow {
  lessonId: string;
  startsAt: Date;
  endsAt: Date;
  lessonStatus: LessonStatus;
  cancelKind: LessonCancelKind | null;
  isLateCancellation: boolean;
  attendanceStatus: AttendanceStatus | null;
  confirmationStatus: AttendanceConfirmationStatus | null;
  sessionPriceVnd: number | null;
  sessionMinutes: number | null;
  amountVnd: number;
  state: FeeLineState;
  billedIn: string | null;
  inMonth: boolean;
}

export interface SessionCountRow {
  enrollmentId: string;
  state: FeeLineState;
  count: number;
  amountVnd: number;
}

export interface StatementRow {
  id: string;
  enrollmentId: string;
  tutorId: string;
  month: string;
  status: FeeStatementStatus;
  billableSessions: number;
  totalAmountVnd: number;
  paidAmountVnd: number;
  pendingAmountVnd: number;
  /** Số khoản chờ xác nhận do gia sư / phụ huynh ghi nhận. */
  pendingByTutor: number;
  pendingByClient: number;
  dueDate: string;
  pastDue: boolean;
  issuedAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
}

export interface PaymentWithNames {
  id: string;
  statementId: string;
  amountVnd: number;
  method: PaymentMethod;
  channel: 'manual' | 'online';
  paidOn: string;
  reference: string | null;
  status: PaymentStatus;
  recordedBy: string;
  recordedByName: string;
  /** Gia sư của bảng (để biết ai ghi nhận). */
  tutorId: string;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}

/** Bảng vừa lập (job, lập lại sau khi hủy). */
export interface IssuedStatement {
  statementId: string;
  enrollmentId: string;
  classId: string;
  month: string;
}

const STATEMENT_SELECT = `
  SELECT s.id, s.enrollment_id AS "enrollmentId", s.tutor_id AS "tutorId",
         to_char(s.period_month, 'YYYY-MM') AS month, s.status,
         s.billable_sessions AS "billableSessions", s.total_amount_vnd AS "totalAmountVnd",
         s.paid_amount_vnd AS "paidAmountVnd",
         COALESCE(sum(p.amount_vnd) FILTER (WHERE p.status = 'recorded'), 0)::bigint AS "pendingAmountVnd",
         count(p.id) FILTER (WHERE p.status = 'recorded' AND p.recorded_by = s.tutor_id)::int AS "pendingByTutor",
         count(p.id) FILTER (WHERE p.status = 'recorded' AND p.recorded_by <> s.tutor_id)::int AS "pendingByClient",
         s.due_date::text AS "dueDate", (s.due_date < ${TODAY_VN}) AS "pastDue",
         s.issued_at AS "issuedAt", s.voided_at AS "voidedAt", s.void_reason AS "voidReason"
    FROM fee_statements s
    LEFT JOIN payments p ON p.statement_id = s.id`;
const STATEMENT_GROUP = ` GROUP BY s.id`;

const PAYMENT_SELECT = `
  SELECT p.id, p.statement_id AS "statementId", p.amount_vnd AS "amountVnd", p.method, p.channel,
         p.paid_on::text AS "paidOn", p.reference, p.status, p.recorded_by AS "recordedBy",
         u.display_name AS "recordedByName", s.tutor_id AS "tutorId",
         p.decided_at AS "decidedAt", p.decision_note AS "decisionNote", p.created_at AS "createdAt"
    FROM payments p
    JOIN fee_statements s ON s.id = p.statement_id
    JOIN users u ON u.id = p.recorded_by`;

export function createFeesRepository(manager: EntityManager) {
  return {
    /** Hôm nay theo giờ Việt Nam (`YYYY-MM-DD`). */
    async todayVn(): Promise<string> {
      const [row] = await manager.query<{ today: string }[]>(`SELECT ${TODAY_VN}::text AS today`);
      return row!.today;
    },

    // ---- Đối chiếu buổi học --------------------------------------------------------------------

    /**
     * Các buổi trong tháng của học sinh (mọi trạng thái), cộng các buổi tháng khác đã tính vào bảng `statementId`.
     */
    lines(
      enrollmentId: string,
      monthStart: string,
      statementId: string | null,
    ): Promise<FeeLineRow[]> {
      return manager.query<FeeLineRow[]>(
        `SELECT l.id AS "lessonId", l.starts_at AS "startsAt", l.ends_at AS "endsAt",
                l.status AS "lessonStatus", l.cancel_kind AS "cancelKind",
                l.is_late_cancellation AS "isLateCancellation",
                a.status AS "attendanceStatus", a.confirmation_status AS "confirmationStatus",
                a.session_price_vnd AS "sessionPriceVnd", a.session_minutes AS "sessionMinutes",
                COALESCE(i.amount_vnd, a.billable_amount_vnd, 0) AS "amountVnd",
                ${LINE_STATE} AS state,
                to_char(s.period_month, 'YYYY-MM') AS "billedIn",
                (l.starts_at >= ${monthStartAt('$2::date')} AND l.starts_at < ${monthEndAt('$2::date')})
                  AS "inMonth"
           ${LESSON_JOINS}
          WHERE e.id = $1
            AND ((l.starts_at >= ${monthStartAt('$2::date')} AND l.starts_at < ${monthEndAt('$2::date')})
                 OR (i.statement_id = $3::uuid))
          ORDER BY l.starts_at, l.id`,
        [enrollmentId, monthStart, statementId],
      );
    },

    /** Số buổi và số tiền theo trạng thái tính tiền, của các buổi trong tháng, theo từng học sinh. */
    sessionCounts(enrollmentIds: string[], monthStart: string): Promise<SessionCountRow[]> {
      if (enrollmentIds.length === 0) return Promise.resolve([]);
      return manager.query<SessionCountRow[]>(
        `SELECT x.enrollment_id AS "enrollmentId", x.state, count(*)::int AS count,
                COALESCE(sum(x.amount), 0)::bigint AS "amountVnd"
           FROM (
             SELECT e.id AS enrollment_id, ${LINE_STATE} AS state,
                    COALESCE(i.amount_vnd, a.billable_amount_vnd, 0) AS amount
               ${LESSON_JOINS}
              WHERE e.id = ANY($1::uuid[])
                AND l.starts_at >= ${monthStartAt('$2::date')} AND l.starts_at < ${monthEndAt('$2::date')}
           ) x
          GROUP BY x.enrollment_id, x.state`,
        [enrollmentIds, monthStart],
      );
    },

    // ---- Bảng học phí ----------------------------------------------------------------------------

    /** Bảng còn hiệu lực của các học sinh trong một tháng. */
    statementsOfMonth(enrollmentIds: string[], monthStart: string): Promise<StatementRow[]> {
      if (enrollmentIds.length === 0) return Promise.resolve([]);
      return manager.query<StatementRow[]>(
        `${STATEMENT_SELECT}
          WHERE s.enrollment_id = ANY($1::uuid[]) AND s.period_month = $2::date AND s.status <> 'void'
          ${STATEMENT_GROUP}`,
        [enrollmentIds, monthStart],
      );
    },

    /** Bảng đã hủy của một học sinh trong một tháng (mới nhất trước). */
    voidedStatements(enrollmentId: string, monthStart: string): Promise<StatementRow[]> {
      return manager.query<StatementRow[]>(
        `${STATEMENT_SELECT}
          WHERE s.enrollment_id = $1 AND s.period_month = $2::date AND s.status = 'void'
          ${STATEMENT_GROUP}
          ORDER BY s.voided_at DESC`,
        [enrollmentId, monthStart],
      );
    },

    async statement(id: string): Promise<StatementRow | null> {
      const [row] = await manager.query<StatementRow[]>(
        `${STATEMENT_SELECT} WHERE s.id = $1 ${STATEMENT_GROUP}`,
        [id],
      );
      return row ?? null;
    },

    /** Khóa bảng (mọi thao tác thanh toán, hủy bảng đi qua đây). */
    async lockStatement(id: string): Promise<{
      id: string;
      enrollmentId: string;
      month: string;
      status: FeeStatementStatus;
    } | null> {
      const [row] = await manager.query<
        { id: string; enrollmentId: string; month: string; status: FeeStatementStatus }[]
      >(
        `SELECT id, enrollment_id AS "enrollmentId", to_char(period_month, 'YYYY-MM') AS month, status
           FROM fee_statements WHERE id = $1 FOR UPDATE`,
        [id],
      );
      return row ?? null;
    },

    /** Bảng của các tháng khác còn chưa trả đủ: số bảng và số tiền còn lại. */
    async unpaidOtherMonths(
      enrollmentIds: string[],
      monthStart: string,
    ): Promise<{ count: number; balanceVnd: number }> {
      if (enrollmentIds.length === 0) return { count: 0, balanceVnd: 0 };
      const [row] = await manager.query<{ count: number; balanceVnd: number }[]>(
        `SELECT count(*)::int AS count,
                COALESCE(sum(total_amount_vnd - paid_amount_vnd), 0)::bigint AS "balanceVnd"
           FROM fee_statements
          WHERE enrollment_id = ANY($1::uuid[]) AND period_month <> $2::date
            AND status IN ('issued', 'partially_paid')`,
        [enrollmentIds, monthStart],
      );
      return row ?? { count: 0, balanceVnd: 0 };
    },

    /**
     * Lập bảng tháng `monthStart` cho tối đa `limit` học sinh có buổi đã chốt, tính tiền, chưa thuộc bảng nào, diễn ra
     * trước cuối tháng đó (buổi chốt muộn của tháng trước cũng vào đây), và chưa có bảng còn hiệu lực của tháng.
     * `enrollmentIds`: chỉ các học sinh này (lập lại sau khi hủy). Bỏ qua học sinh đang bị transaction khác khóa (job
     * chạy lại sau). Hạn trả ngày 5 tháng kế tiếp (D24), không sớm hơn hôm nay; bảng lập vào hoặc sau ngày hạn (lần
     * chạy bị lỡ, lập lại sau khi hủy) coi như đã nhắc đến hạn: thông báo bảng mới là đủ.
     */
    async issue(
      monthStart: string,
      options: { limit: number; enrollmentIds?: string[] },
    ): Promise<IssuedStatement[]> {
      const eligible = `
        SELECT a.id, a.enrollment_id, a.billable_amount_vnd
          FROM lesson_attendances a
          JOIN lessons l ON l.id = a.lesson_id
         WHERE a.is_billable AND a.confirmation_status IN ${FINAL}
           AND l.starts_at < ${monthEndAt('$1::date')}
           AND NOT EXISTS (
             SELECT 1 FROM fee_statement_items i WHERE i.attendance_id = a.id AND i.voided_at IS NULL
           )`;
      // Bước 1: chọn và khóa học sinh. FOR NO KEY UPDATE không chặn việc ghi điểm danh tham chiếu ghi danh.
      const picked = await manager.query<{ id: string }[]>(
        `SELECT e.id
           FROM class_enrollments e
          WHERE ($3::uuid[] IS NULL OR e.id = ANY($3::uuid[]))
            AND NOT EXISTS (
              SELECT 1 FROM fee_statements s
               WHERE s.enrollment_id = e.id AND s.period_month = $1::date AND s.status <> 'void'
            )
            AND EXISTS (SELECT 1 FROM (${eligible}) x WHERE x.enrollment_id = e.id)
          ORDER BY e.id
          LIMIT $2
          FOR NO KEY UPDATE OF e ${options.enrollmentIds ? '' : 'SKIP LOCKED'}`,
        [monthStart, options.limit, options.enrollmentIds ?? null],
      );
      if (picked.length === 0) return [];
      // Bước 2: bảng và các dòng trong một câu lệnh.
      return manager.query<IssuedStatement[]>(
        `WITH elig AS (
           SELECT x.* FROM (${eligible}) x WHERE x.enrollment_id = ANY($2::uuid[])
         ), st AS (
           INSERT INTO fee_statements
                  (enrollment_id, tutor_id, client_user_id, period_month, billable_sessions, total_amount_vnd,
                   due_date, due_reminded_at)
           SELECT e.id, c.tutor_id, e.client_user_id, $1::date, count(*), sum(x.billable_amount_vnd),
                  d.due, CASE WHEN d.due <= ${TODAY_VN} THEN now() END
             FROM elig x
             JOIN class_enrollments e ON e.id = x.enrollment_id
             JOIN tutoring_classes c ON c.id = e.class_id
            CROSS JOIN (
              SELECT GREATEST(
                       ($1::date + interval '1 month' + interval '${FEE_LIMITS.dueDay - 1} days')::date,
                       ${TODAY_VN}
                     ) AS due
            ) d
            GROUP BY e.id, c.tutor_id, e.client_user_id, d.due
           RETURNING id, enrollment_id
         ), items AS (
           INSERT INTO fee_statement_items (statement_id, attendance_id, item_type, amount_vnd)
           SELECT st.id, x.id, 'session', x.billable_amount_vnd FROM elig x JOIN st ON st.enrollment_id = x.enrollment_id
           RETURNING statement_id
         )
         SELECT st.id AS "statementId", st.enrollment_id AS "enrollmentId", e.class_id AS "classId",
                to_char($1::date, 'YYYY-MM') AS month
           FROM st JOIN class_enrollments e ON e.id = st.enrollment_id
          WHERE EXISTS (SELECT 1 FROM items WHERE items.statement_id = st.id)`,
        [monthStart, picked.map((p) => p.id)],
      );
    },

    /**
     * Hủy bảng (B.10.1): dòng học phí nhả buổi ra (`voided_at`), khoản thanh toán đang chờ xác nhận bị hủy theo. Gọi
     * khi đã khóa bảng và chắc chắn chưa có khoản nào được xác nhận.
     */
    async voidStatement(id: string, by: string, reason: string): Promise<void> {
      await manager.query(
        `UPDATE fee_statements
            SET status = 'void', voided_at = now(), voided_by = $2, void_reason = $3, updated_at = now()
          WHERE id = $1`,
        [id, by, reason],
      );
      await manager.query(
        `UPDATE fee_statement_items SET voided_at = now() WHERE statement_id = $1 AND voided_at IS NULL`,
        [id],
      );
      await manager.query(
        `UPDATE payments
            SET status = 'voided', decided_by = $2, decided_at = now(), decision_note = 'statement_void',
                updated_at = now()
          WHERE statement_id = $1 AND status = 'recorded'`,
        [id, by],
      );
    },

    /** Khóa ghi danh (lập lại bảng sau khi hủy, cùng thứ tự khóa với job). */
    async lockEnrollment(enrollmentId: string): Promise<void> {
      await manager.query(`SELECT 1 FROM class_enrollments WHERE id = $1 FOR NO KEY UPDATE`, [
        enrollmentId,
      ]);
    },

    /** Đánh dấu nhắc đến hạn (một lần) cho tối đa `limit` bảng đã tới hạn mà chưa trả đủ. */
    markDueReminders(limit: number): Promise<IssuedStatement[]> {
      return manager.query<IssuedStatement[]>(
        `WITH due AS (
           SELECT s.id FROM fee_statements s
            WHERE s.status IN ('issued', 'partially_paid') AND s.due_reminded_at IS NULL
              AND s.due_date <= ${TODAY_VN}
            ORDER BY s.due_date, s.id
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         ), marked AS (
           UPDATE fee_statements s SET due_reminded_at = now()
             FROM due WHERE s.id = due.id
           RETURNING s.id, s.enrollment_id, s.period_month
         )
         SELECT m.id AS "statementId", m.enrollment_id AS "enrollmentId", e.class_id AS "classId",
                to_char(m.period_month, 'YYYY-MM') AS month
           FROM marked m JOIN class_enrollments e ON e.id = m.enrollment_id`,
        [limit],
      );
    },

    // ---- Thanh toán ------------------------------------------------------------------------------

    paymentsOf(statementIds: string[]): Promise<PaymentWithNames[]> {
      if (statementIds.length === 0) return Promise.resolve([]);
      return manager.query<PaymentWithNames[]>(
        `${PAYMENT_SELECT} WHERE p.statement_id = ANY($1::uuid[]) ORDER BY p.created_at DESC, p.id DESC`,
        [statementIds],
      );
    },

    /** Khoản đang chờ xác nhận của các học sinh (mọi tháng), kèm tháng của bảng. */
    recordedPaymentsOf(
      enrollmentIds: string[],
    ): Promise<(PaymentWithNames & { enrollmentId: string; month: string })[]> {
      if (enrollmentIds.length === 0) return Promise.resolve([]);
      return manager.query(
        `SELECT x.*, s2.enrollment_id AS "enrollmentId", to_char(s2.period_month, 'YYYY-MM') AS month
           FROM (${PAYMENT_SELECT} WHERE p.status = 'recorded' AND s.enrollment_id = ANY($1::uuid[])) x
           JOIN fee_statements s2 ON s2.id = x."statementId"
          ORDER BY x."createdAt", x.id`,
        [enrollmentIds],
      );
    },

    async findPayment(statementId: string, paymentId: string): Promise<PaymentWithNames | null> {
      const [row] = await manager.query<PaymentWithNames[]>(
        `${PAYMENT_SELECT} WHERE p.statement_id = $1 AND p.id = $2`,
        [statementId, paymentId],
      );
      return row ?? null;
    },

    /** Tổng các khoản còn hiệu lực (chờ xác nhận + đã xác nhận) và số khoản của bảng. */
    async paymentTotals(
      statementId: string,
    ): Promise<{ openVnd: number; count: number; total: number }> {
      const [row] = await manager.query<{ openVnd: number; count: number; total: number }[]>(
        `SELECT COALESCE(sum(p.amount_vnd) FILTER (WHERE p.status IN ('recorded', 'acknowledged')), 0)::bigint
                  AS "openVnd",
                count(p.id)::int AS count, s.total_amount_vnd AS total
           FROM fee_statements s LEFT JOIN payments p ON p.statement_id = s.id
          WHERE s.id = $1
          GROUP BY s.id`,
        [statementId],
      );
      return row ?? { openVnd: 0, count: 0, total: 0 };
    },

    async insertPayment(data: {
      statementId: string;
      amountVnd: number;
      method: PaymentMethod;
      paidOn: string;
      reference: string | null;
      recordedBy: string;
    }): Promise<string> {
      const [row] = await manager.query<{ id: string }[]>(
        `INSERT INTO payments (statement_id, amount_vnd, method, paid_on, reference, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          data.statementId,
          data.amountVnd,
          data.method,
          data.paidOn,
          data.reference,
          data.recordedBy,
        ],
      );
      return row!.id;
    },

    async decidePayment(
      paymentId: string,
      status: 'acknowledged' | 'declined' | 'voided',
      by: string,
      note: string | null,
    ): Promise<void> {
      await manager.query(
        `UPDATE payments
            SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4, updated_at = now()
          WHERE id = $1`,
        [paymentId, status, by, note],
      );
    },

    /** Tính lại số đã trả từ các khoản đã xác nhận (D41) và trạng thái bảng (B.10.1). */
    async refreshPaid(statementId: string): Promise<void> {
      await manager.query(
        `UPDATE fee_statements s
            SET paid_amount_vnd = x.paid,
                status = CASE WHEN x.paid >= s.total_amount_vnd THEN 'paid'
                              WHEN x.paid > 0 THEN 'partially_paid'
                              ELSE 'issued' END,
                updated_at = now()
           FROM (
             SELECT COALESCE(sum(amount_vnd), 0)::bigint AS paid
               FROM payments WHERE statement_id = $1 AND status = 'acknowledged'
           ) x
          WHERE s.id = $1`,
        [statementId],
      );
    },
  };
}

export type FeesRepository = ReturnType<typeof createFeesRepository>;
