// Học phí (G7, §10, B.10). Bảng học phí tháng do job lập (`fees-maintenance.ts`); module này lo xem tổng hợp tháng,
// đối chiếu buổi của một học sinh, hủy bảng để lập lại, ghi nhận và xác nhận thanh toán.
//
// Quyền: theo các dòng "lớp × học sinh" người gọi thấy (`allVisibleRows` của lớp học). Gia sư của lớp và phụ huynh
// đang quản lý học sinh thấy học phí; học sinh: 403 (G6: học sinh không thấy học phí); người ngoài: 404.
// - Chỉ gia sư hủy bảng (B.10.1), khi chưa có khoản nào được xác nhận; bảng được lập lại ngay từ các buổi đã chốt.
// - Một bên ghi nhận khoản đã trả / đã nhận; bên còn lại xác nhận hoặc báo chưa nhận được; người ghi nhận hủy được khi
//   bên kia chưa trả lời. Chỉ khoản đã xác nhận được tính vào số đã trả (D41).
// - Lớp đã kết thúc, tài khoản bị hạn chế vẫn đối chiếu và ghi nhận học phí được.
// - Mọi thao tác ghi khóa dòng bảng học phí trong transaction; thông báo bên kia sau khi commit.
import {
  type AwaitingPayment,
  FEE_LIMITS,
  type FeeEnrollmentRef,
  type FeeLine,
  type FeeMonthDetail,
  type FeeOverview,
  type FeeOverviewQuery,
  type FeeOverviewRow,
  type FeeRole,
  type FeeSessionCounts,
  type FeeStatement,
  type Payment,
  type RecordPaymentRequest,
} from '@tps/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AppError, forbidden, invalidStateTransition, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import {
  type ClassRecipient,
  displayNameOf,
  recordClassNotices,
} from '../classes/class-notifications.js';
import { type ClassRow, createClassesRepository } from '../classes/classes.repository.js';
import {
  noopNotifier,
  type Notifier,
  type PendingNotification,
} from '../notifications/notifications.service.js';
import {
  createFeesRepository,
  type FeeLineRow,
  type PaymentWithNames,
  type SessionCountRow,
  type StatementRow,
} from './fees.repository.js';

type FeeEvent =
  | 'issued'
  | 'due'
  | 'voided'
  | 'payment_recorded'
  | 'payment_acknowledged'
  | 'payment_declined'
  | 'payment_voided';

const fieldError = (path: string, code: string, message: string) =>
  new AppError('validation_failed', message, [{ path, code, message }]);

const monthStartOf = (month: string) => `${month}-01`;

export const emptyCounts = (): FeeSessionCounts => ({
  billable: 0,
  billableAmountVnd: 0,
  pendingConfirmation: 0,
  pendingAmountVnd: 0,
  disputed: 0,
  notBillable: 0,
  cancelled: 0,
  notRecorded: 0,
  upcoming: 0,
});

/** Cộng một nhóm buổi (theo trạng thái tính tiền) vào bộ đếm. */
function addCount(
  counts: FeeSessionCounts,
  state: SessionCountRow['state'],
  n: number,
  amount: number,
) {
  switch (state) {
    case 'billed':
    case 'billable':
      counts.billable += n;
      counts.billableAmountVnd += amount;
      break;
    case 'pending_confirmation':
      counts.pendingConfirmation += n;
      counts.pendingAmountVnd += amount;
      break;
    case 'disputed':
      counts.disputed += n;
      break;
    case 'not_billable':
      counts.notBillable += n;
      break;
    case 'cancelled':
      counts.cancelled += n;
      break;
    case 'not_recorded':
      counts.notRecorded += n;
      break;
    case 'upcoming':
      counts.upcoming += n;
      break;
  }
}

function toRef(row: ClassRow): FeeEnrollmentRef {
  return {
    enrollmentId: row.enrollmentId,
    classId: row.id,
    className: row.name,
    classStatus: row.status,
    subjectId: row.subjectId,
    gradeLevelId: row.gradeLevelId,
    learner: { id: row.learnerId, name: row.learnerName },
    tutor: { id: row.tutorId, displayName: row.tutorName },
    client: { displayName: row.clientName },
    myRole: row.myRole as FeeRole,
  };
}

function toStatementDto(row: StatementRow, role: FeeRole): FeeStatement {
  const total = Number(row.totalAmountVnd);
  const paid = Number(row.paidAmountVnd);
  const open = row.status === 'issued' || row.status === 'partially_paid';
  return {
    id: row.id,
    month: row.month,
    status: row.status,
    billableSessions: row.billableSessions,
    totalAmountVnd: total,
    paidAmountVnd: paid,
    pendingAmountVnd: Number(row.pendingAmountVnd),
    balanceVnd: row.status === 'void' ? 0 : Math.max(total - paid, 0),
    dueDate: row.dueDate,
    overdue: open && row.pastDue,
    issuedAt: row.issuedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
    awaitingMe:
      row.status !== 'void' &&
      (role === 'tutor' ? row.pendingByClient > 0 : row.pendingByTutor > 0),
  };
}

/** Ai ghi nhận khoản thanh toán: gia sư của bảng hay phía phụ huynh. */
const recorderRole = (p: PaymentWithNames): FeeRole =>
  p.recordedBy === p.tutorId ? 'tutor' : 'client';

function toPaymentDto(p: PaymentWithNames, userId: string, role: FeeRole): Payment {
  const recordedBy = recorderRole(p);
  return {
    id: p.id,
    amountVnd: Number(p.amountVnd),
    method: p.method,
    channel: p.channel,
    paidOn: p.paidOn,
    reference: p.reference,
    status: p.status,
    recordedBy,
    recordedByName: p.recordedByName,
    mine: p.recordedBy === userId,
    awaitingMe: p.status === 'recorded' && recordedBy !== role,
    decidedAt: p.decidedAt?.toISOString() ?? null,
    // Ghi chú hệ thống (bảng bị hủy kéo theo khoản đang chờ) không hiển thị như lời nhắn.
    note: p.decisionNote === 'statement_void' ? null : p.decisionNote,
    createdAt: p.createdAt.toISOString(),
  };
}

function toLineDto(row: FeeLineRow): FeeLine {
  return {
    lessonId: row.lessonId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    lessonStatus: row.lessonStatus,
    cancelKind: row.cancelKind,
    isLateCancellation: row.isLateCancellation,
    attendanceStatus: row.attendanceStatus,
    confirmationStatus: row.confirmationStatus,
    sessionPriceVnd: row.sessionPriceVnd === null ? null : Number(row.sessionPriceVnd),
    sessionMinutes: row.sessionMinutes,
    amountVnd: Number(row.amountVnd),
    state: row.state,
    billedIn: row.billedIn,
    inMonth: row.inMonth,
  };
}

export function createFeesService(deps: {
  dataSource: DataSource;
  logger: Logger;
  /** Thông báo bảng học phí, thanh toán. Mặc định: không thông báo. */
  notifier?: Notifier;
}) {
  const { dataSource, logger } = deps;
  const notifier = deps.notifier ?? noopNotifier;

  /**
   * Thông báo học phí của một học sinh cho `to`. `actorId`: người vừa làm thao tác (gia sư nhận tên của họ).
   */
  async function feeNotice(
    manager: EntityManager,
    ref: { classId: string; enrollmentId: string; month: string },
    to: readonly ClassRecipient[],
    event: FeeEvent,
    actorId?: string,
  ): Promise<PendingNotification[]> {
    return recordClassNotices(
      manager,
      notifier,
      ref.classId,
      to,
      (base) => ({
        type: 'fee_statement',
        data: { ...base, enrollmentId: ref.enrollmentId, month: ref.month, event },
      }),
      {
        enrollmentId: ref.enrollmentId,
        ...(actorId ? { except: actorId } : {}),
        ...(actorId && to.includes('tutor')
          ? { actorName: await displayNameOf(manager, actorId) }
          : {}),
      },
    );
  }

  /** Dòng "lớp × học sinh" của ghi danh mà U được xem học phí. Không thấy: 404; học sinh: 403. */
  async function feeRow(manager: EntityManager, userId: string, enrollmentId: string) {
    const [row] = await createClassesRepository(manager).allVisibleRows(userId, { enrollmentId });
    if (!row) throw notFound('Enrollment');
    if (row.myRole === 'student') throw forbidden('Students do not see tuition');
    return row;
  }

  async function monthDetail(
    userId: string,
    row: ClassRow,
    month: string,
  ): Promise<FeeMonthDetail> {
    const repo = createFeesRepository(dataSource.manager);
    const role = row.myRole as FeeRole;
    const monthStart = monthStartOf(month);
    const [current] = await repo.statementsOfMonth([row.enrollmentId], monthStart);
    const lines = await repo.lines(row.enrollmentId, monthStart, current?.id ?? null);
    const voided = await repo.voidedStatements(row.enrollmentId, monthStart);
    const payments = current ? await repo.paymentsOf([current.id]) : [];
    const sessions = emptyCounts();
    for (const line of lines) {
      if (line.inMonth) addCount(sessions, line.state, 1, Number(line.amountVnd));
    }
    return {
      ...toRef(row),
      month,
      sessions,
      lines: lines.map(toLineDto),
      statement: current ? toStatementDto(current, role) : null,
      payments: payments.map((p) => toPaymentDto(p, userId, role)),
      voidedStatements: voided.map((s) => toStatementDto(s, role)),
    };
  }

  /**
   * Chạy `fn` trong transaction với bảng `statementId` đã khóa, khi U là gia sư hoặc phụ huynh của học sinh. Không
   * thấy: 404; học sinh: 403; bảng đã hủy: 409.
   */
  async function mutateStatement<T>(
    userId: string,
    statementId: string,
    fn: (ctx: {
      manager: EntityManager;
      row: ClassRow;
      role: FeeRole;
      statement: { id: string; enrollmentId: string; month: string; status: string };
    }) => Promise<T>,
  ): Promise<{ result: T; row: ClassRow; month: string }> {
    return dataSource.transaction(async (manager) => {
      const repo = createFeesRepository(manager);
      const head = await repo.statement(statementId);
      if (!head) throw notFound('Fee statement');
      const row = await feeRow(manager, userId, head.enrollmentId);
      const statement = await repo.lockStatement(statementId);
      if (!statement) throw notFound('Fee statement');
      if (statement.status === 'void') throw invalidStateTransition('Fee statement is void');
      const result = await fn({ manager, row, role: row.myRole as FeeRole, statement });
      return { result, row, month: statement.month };
    });
  }

  const ref = (row: ClassRow, month: string) => ({
    classId: row.id,
    enrollmentId: row.enrollmentId,
    month,
  });

  /** Phía bên kia của `role` trong thông báo. */
  const otherSide = (role: FeeRole): ClassRecipient[] =>
    role === 'tutor' ? ['clients'] : ['tutor'];

  return {
    /**
     * Tổng hợp một tháng qua mọi học sinh tôi dạy hoặc quản lý: số buổi theo trạng thái, bảng học phí của tháng (nếu
     * đã lập), các khoản chờ tôi xác nhận ở mọi tháng. Chỉ các học sinh có buổi trong tháng hoặc có bảng của tháng.
     */
    async overview(userId: string, query: FeeOverviewQuery): Promise<FeeOverview> {
      const manager = dataSource.manager;
      const repo = createFeesRepository(manager);
      const monthStart = monthStartOf(query.month);
      const all = (await createClassesRepository(manager).allVisibleRows(userId)).filter(
        (r) => r.myRole !== 'student' && (!query.as || r.myRole === query.as),
      );
      const ids = all.map((r) => r.enrollmentId);
      const counts = await repo.sessionCounts(ids, monthStart);
      const statements = await repo.statementsOfMonth(ids, monthStart);
      const unpaid = await repo.unpaidOtherMonths(ids, monthStart);
      const recorded = await repo.recordedPaymentsOf(ids);

      const byEnrollment = new Map(all.map((r) => [r.enrollmentId, r]));
      const countsOf = new Map<string, FeeSessionCounts>();
      for (const c of counts) {
        const target = countsOf.get(c.enrollmentId) ?? emptyCounts();
        addCount(target, c.state, c.count, Number(c.amountVnd));
        countsOf.set(c.enrollmentId, target);
      }
      const statementOf = new Map(statements.map((s) => [s.enrollmentId, s]));

      const rows: FeeOverviewRow[] = all
        .filter((r) => countsOf.has(r.enrollmentId) || statementOf.has(r.enrollmentId))
        .map((r) => {
          const statement = statementOf.get(r.enrollmentId);
          return {
            ...toRef(r),
            sessions: countsOf.get(r.enrollmentId) ?? emptyCounts(),
            statement: statement ? toStatementDto(statement, r.myRole as FeeRole) : null,
          };
        });

      const totals = {
        totalVnd: 0,
        paidVnd: 0,
        outstandingVnd: 0,
        provisionalVnd: 0,
        disputedSessions: 0,
      };
      for (const r of rows) {
        totals.disputedSessions += r.sessions.disputed;
        if (r.statement) {
          totals.totalVnd += r.statement.totalAmountVnd;
          totals.paidVnd += r.statement.paidAmountVnd;
          totals.outstandingVnd += r.statement.balanceVnd;
        } else {
          totals.provisionalVnd += r.sessions.billableAmountVnd + r.sessions.pendingAmountVnd;
        }
      }

      const awaitingMe: AwaitingPayment[] = [];
      for (const p of recorded) {
        const row = byEnrollment.get(p.enrollmentId);
        if (!row) continue;
        const dto = toPaymentDto(p, userId, row.myRole as FeeRole);
        if (!dto.awaitingMe) continue;
        awaitingMe.push({
          payment: dto,
          statementId: p.statementId,
          month: p.month,
          enrollment: toRef(row),
        });
      }

      return {
        month: query.month,
        rows,
        totals,
        unpaidOtherMonths: { count: unpaid.count, balanceVnd: Number(unpaid.balanceVnd) },
        awaitingMe,
      };
    },

    /** Đối chiếu học phí một tháng của một học sinh. */
    async month(userId: string, enrollmentId: string, month: string): Promise<FeeMonthDetail> {
      const row = await feeRow(dataSource.manager, userId, enrollmentId);
      return monthDetail(userId, row, month);
    },

    /** Đối chiếu của tháng có bảng `statementId` (kể cả bảng đã hủy: trả bảng hiện hành của tháng đó). */
    async statement(userId: string, statementId: string): Promise<FeeMonthDetail> {
      const head = await createFeesRepository(dataSource.manager).statement(statementId);
      if (!head) throw notFound('Fee statement');
      const row = await feeRow(dataSource.manager, userId, head.enrollmentId);
      return monthDetail(userId, row, head.month);
    },

    /**
     * Gia sư hủy bảng để lập lại (B.10.1): chỉ khi chưa có khoản nào được xác nhận (`issued`). Khoản đang chờ xác nhận
     * bị hủy theo; các buổi được nhả ra và bảng mới của cùng tháng được lập ngay từ các buổi đã chốt tới thời điểm này
     * (có thể không có bảng mới nếu không còn buổi nào). Báo phụ huynh.
     */
    async voidStatement(
      userId: string,
      statementId: string,
      reason: string,
    ): Promise<FeeMonthDetail> {
      const {
        result: pending,
        row,
        month,
      } = await mutateStatement(userId, statementId, async ({ manager, row, role, statement }) => {
        if (role !== 'tutor') throw forbidden('Only the tutor can void a statement');
        if (statement.status !== 'issued') {
          throw invalidStateTransition(`Fee statement is ${statement.status}`);
        }
        const repo = createFeesRepository(manager);
        await repo.voidStatement(statement.id, userId, reason);
        await repo.lockEnrollment(row.enrollmentId);
        await repo.issue(monthStartOf(statement.month), {
          limit: 1,
          enrollmentIds: [row.enrollmentId],
        });
        return feeNotice(manager, ref(row, statement.month), ['clients'], 'voided', userId);
      });
      await notifier.dispatch(pending);
      logger.info({ userId, statementId }, 'Fee statement voided');
      return monthDetail(userId, row, month);
    },

    /**
     * Ghi nhận một khoản đã trả (phụ huynh) hoặc đã nhận (gia sư). Không vượt phần còn lại của bảng sau khi trừ các
     * khoản còn hiệu lực (422 `payment_exceeds_balance`); ngày trả không ở tương lai (422 `paid_on_in_future`). Báo
     * bên kia để xác nhận.
     */
    async recordPayment(
      userId: string,
      statementId: string,
      input: RecordPaymentRequest,
    ): Promise<FeeMonthDetail> {
      const {
        result: pending,
        row,
        month,
      } = await mutateStatement(userId, statementId, async ({ manager, row, role, statement }) => {
        const repo = createFeesRepository(manager);
        if (input.paidOn > (await repo.todayVn())) {
          throw fieldError('paidOn', 'paid_on_in_future', 'Payment date is in the future');
        }
        const totals = await repo.paymentTotals(statement.id);
        if (totals.count >= FEE_LIMITS.paymentsPerStatement) {
          throw new AppError('limit_reached', 'Too many payments on this statement', undefined, {
            meta: { limit: FEE_LIMITS.paymentsPerStatement },
          });
        }
        if (input.amountVnd > Number(totals.total) - Number(totals.openVnd)) {
          throw fieldError(
            'amountVnd',
            'payment_exceeds_balance',
            'Amount is more than the remaining balance',
          );
        }
        await repo.insertPayment({
          statementId: statement.id,
          amountVnd: input.amountVnd,
          method: input.method,
          paidOn: input.paidOn,
          reference: input.reference,
          recordedBy: userId,
        });
        return feeNotice(
          manager,
          ref(row, statement.month),
          otherSide(role),
          'payment_recorded',
          userId,
        );
      });
      await notifier.dispatch(pending);
      logger.info({ userId, statementId }, 'Payment recorded');
      return monthDetail(userId, row, month);
    },

    /**
     * Quyết định về một khoản đang chờ: bên còn lại xác nhận (`acknowledge`, tính vào số đã trả, D41) hoặc báo chưa
     * nhận được (`decline`); người ghi nhận hủy (`void`). Khoản không còn chờ: 409; sai bên: 403.
     */
    async decidePayment(
      userId: string,
      statementId: string,
      paymentId: string,
      decision: 'acknowledge' | 'decline' | 'void',
      note: string | null,
    ): Promise<FeeMonthDetail> {
      const {
        result: pending,
        row,
        month,
      } = await mutateStatement(userId, statementId, async ({ manager, row, role, statement }) => {
        const repo = createFeesRepository(manager);
        const payment = await repo.findPayment(statement.id, paymentId);
        if (!payment) throw notFound('Payment');
        const recorder = recorderRole(payment);
        if (decision === 'void') {
          if (payment.recordedBy !== userId)
            throw forbidden('Only the recorder can void a payment');
        } else if (recorder === role) {
          throw forbidden('The other party confirms this payment');
        }
        if (payment.status !== 'recorded') {
          throw invalidStateTransition(`Payment is ${payment.status}`);
        }
        const status =
          decision === 'acknowledge'
            ? 'acknowledged'
            : decision === 'decline'
              ? 'declined'
              : 'voided';
        await repo.decidePayment(payment.id, status, userId, note);
        if (status === 'acknowledged') await repo.refreshPaid(statement.id);
        const event: FeeEvent =
          decision === 'acknowledge'
            ? 'payment_acknowledged'
            : decision === 'decline'
              ? 'payment_declined'
              : 'payment_voided';
        return feeNotice(manager, ref(row, statement.month), otherSide(role), event, userId);
      });
      await notifier.dispatch(pending);
      logger.info({ userId, statementId, paymentId, decision }, 'Payment decided');
      return monthDetail(userId, row, month);
    },
  };
}

export type FeesService = ReturnType<typeof createFeesService>;

export type { FeeEvent };
