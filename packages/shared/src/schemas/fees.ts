// Học phí (G7, §10; docs/thiet_ke_co_so_du_lieu.md mục 8; trạng thái B.10).
// - Bảng học phí tháng lập riêng cho từng học sinh trong từng lớp (D23), phát hành ngày 1 cho tháng trước, không qua
//   nháp (D40); hạn trả ngày 5 tháng kế tiếp (D24). Chỉ gồm buổi đã chốt (xác nhận, tự chốt, Manager quyết định) và tính
//   tiền (`held` + có mặt, C5), với giá đã chụp lúc điểm danh (D17); buổi chốt muộn rơi vào bảng tháng sau.
// - Tiền trả ngoài nền tảng (D6). Một bên ghi nhận khoản đã trả, bên kia xác nhận; chỉ khoản đã xác nhận mới được tính
//   (D41). Bên kia cũng có thể báo "chưa nhận được".
// - Chỉ gia sư và phụ huynh đang quản lý học sinh thấy học phí; học sinh không thấy (G6). Người ngoài: 404.
// - Tháng luôn theo giờ Việt Nam, dạng `YYYY-MM`. Tiền là số nguyên VND.
import { z } from 'zod';
import {
  AttendanceConfirmationStatus,
  AttendanceStatus,
  FeeLineState,
  FeeStatementStatus,
  LessonCancelKind,
  LessonStatus,
  PaymentMethod,
  PaymentStatus,
  TutoringClassStatus,
} from '../statuses.js';
import { Id, optionalText, VndAmount } from './common.js';

export const FEE_LIMITS = {
  /** Hạn trả: ngày này của tháng kế tiếp (D24). */
  dueDay: 5,
  voidReasonLength: 500,
  referenceLength: 300,
  noteLength: 500,
  /** Số khoản thanh toán (mọi trạng thái) của một bảng học phí. */
  paymentsPerStatement: 50,
} as const;

/** Tháng `YYYY-MM` (giờ Việt Nam). */
export const FeeMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'invalid_month' });
export type FeeMonth = z.infer<typeof FeeMonth>;

/** Vai trò với học phí của một học sinh: gia sư của lớp hoặc phụ huynh đang quản lý học sinh. */
export const FeeRole = z.enum(['tutor', 'client']);
export type FeeRole = z.infer<typeof FeeRole>;

/** Hình thức trả người dùng tự ghi nhận (`online_gateway` dành cho thanh toán trực tuyến sau này). */
export const ManualPaymentMethod = PaymentMethod.exclude(['online_gateway']);
export type ManualPaymentMethod = z.infer<typeof ManualPaymentMethod>;

// ---- Request ----------------------------------------------------------------------------------

/** Tổng hợp học phí một tháng qua mọi lớp của tôi. `as`: với vai trò nào (một người có thể vừa dạy vừa là phụ huynh). */
export const FeeOverviewQuery = z.object({ month: FeeMonth, as: FeeRole.optional() });
export type FeeOverviewQuery = z.infer<typeof FeeOverviewQuery>;

export const FeeMonthQuery = z.object({ month: FeeMonth });
export type FeeMonthQuery = z.infer<typeof FeeMonthQuery>;

export const FeeEnrollmentParams = z.object({ enrollmentId: Id });
export type FeeEnrollmentParams = z.infer<typeof FeeEnrollmentParams>;

export const FeeStatementParams = z.object({ statementId: Id });
export type FeeStatementParams = z.infer<typeof FeeStatementParams>;

export const PaymentParams = FeeStatementParams.extend({ paymentId: Id });
export type PaymentParams = z.infer<typeof PaymentParams>;

/** Gia sư hủy bảng học phí để lập lại (B.10.1): bắt buộc lý do. */
export const VoidFeeStatementRequest = z.object({
  reason: z
    .string()
    .trim()
    .min(1, { error: 'required' })
    .max(FEE_LIMITS.voidReasonLength, { error: 'too_long' }),
});
export type VoidFeeStatementRequest = z.infer<typeof VoidFeeStatementRequest>;

/**
 * Ghi nhận một khoản đã trả (phụ huynh) hoặc đã nhận (gia sư). Số tiền không vượt phần còn lại của bảng (trừ các khoản
 * đang chờ xác nhận); ngày trả không ở tương lai (giờ Việt Nam). Kiểm tra ở service.
 */
export const RecordPaymentRequest = z.object({
  amountVnd: VndAmount.min(1, { error: 'invalid_amount' }),
  method: ManualPaymentMethod,
  paidOn: z.iso.date({ error: 'invalid_calendar_date' }),
  reference: optionalText(FEE_LIMITS.referenceLength).transform((v) => v ?? null),
});
export type RecordPaymentRequest = z.infer<typeof RecordPaymentRequest>;

/** Xác nhận, báo chưa nhận được, hoặc hủy một khoản: ghi chú tùy chọn; không gửi body cũng được. */
export const PaymentNoteRequest = z
  .object({ note: optionalText(FEE_LIMITS.noteLength).transform((v) => v ?? null) })
  .optional()
  .transform((v) => v ?? { note: null });
export type PaymentNoteRequest = z.infer<typeof PaymentNoteRequest>;

// ---- Response ---------------------------------------------------------------------------------

/** Học sinh trong một lớp, từ góc nhìn của gia sư hoặc phụ huynh. */
export const FeeEnrollmentRef = z.object({
  enrollmentId: Id,
  classId: Id,
  /** Tên riêng của lớp (null: ghép từ môn và học sinh). */
  className: z.string().nullable(),
  classStatus: TutoringClassStatus,
  subjectId: z.int(),
  gradeLevelId: z.int(),
  learner: z.object({ id: Id, name: z.string() }),
  tutor: z.object({ id: Id, displayName: z.string() }),
  client: z.object({ displayName: z.string() }),
  myRole: FeeRole,
});
export type FeeEnrollmentRef = z.infer<typeof FeeEnrollmentRef>;

/** Một buổi trong bảng đối chiếu học phí của một học sinh. */
export const FeeLine = z.object({
  lessonId: Id,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  lessonStatus: LessonStatus,
  cancelKind: LessonCancelKind.nullable(),
  isLateCancellation: z.boolean(),
  attendanceStatus: AttendanceStatus.nullable(),
  confirmationStatus: AttendanceConfirmationStatus.nullable(),
  /** Giá và thời lượng đã chụp lúc điểm danh (D17); null khi chưa điểm danh. */
  sessionPriceVnd: VndAmount.nullable(),
  sessionMinutes: z.int().nullable(),
  /** Tiền của buổi: số đã vào bảng, hoặc số sẽ tính (tạm tính khi chờ xác nhận); 0 khi không tính. */
  amountVnd: VndAmount,
  state: FeeLineState,
  /** Tháng của bảng học phí có buổi này. */
  billedIn: FeeMonth.nullable(),
  /** false: buổi của tháng trước được tính vào bảng tháng này (chốt muộn). */
  inMonth: z.boolean(),
});
export type FeeLine = z.infer<typeof FeeLine>;

/** Đếm các buổi diễn ra trong tháng theo trạng thái tính tiền. */
export const FeeSessionCounts = z.object({
  /** Đã chốt và tính tiền (đã hoặc chưa vào bảng). */
  billable: z.int().nonnegative(),
  billableAmountVnd: VndAmount,
  pendingConfirmation: z.int().nonnegative(),
  pendingAmountVnd: VndAmount,
  disputed: z.int().nonnegative(),
  notBillable: z.int().nonnegative(),
  cancelled: z.int().nonnegative(),
  notRecorded: z.int().nonnegative(),
  upcoming: z.int().nonnegative(),
});
export type FeeSessionCounts = z.infer<typeof FeeSessionCounts>;

export const Payment = z.object({
  id: Id,
  amountVnd: VndAmount,
  method: PaymentMethod,
  channel: z.enum(['manual', 'online']),
  paidOn: z.iso.date(),
  reference: z.string().nullable(),
  status: PaymentStatus,
  /** Ai ghi nhận: gia sư (đã nhận) hay phụ huynh (đã trả). */
  recordedBy: FeeRole,
  recordedByName: z.string(),
  /** Tôi ghi nhận khoản này (được hủy khi bên kia chưa xác nhận). */
  mine: z.boolean(),
  /** Chờ tôi xác nhận hoặc báo chưa nhận được. */
  awaitingMe: z.boolean(),
  decidedAt: z.iso.datetime().nullable(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Payment = z.infer<typeof Payment>;

export const FeeStatement = z.object({
  id: Id,
  month: FeeMonth,
  status: FeeStatementStatus,
  billableSessions: z.int().nonnegative(),
  totalAmountVnd: VndAmount,
  /** Tổng các khoản bên kia đã xác nhận (D41). */
  paidAmountVnd: VndAmount,
  /** Tổng các khoản đang chờ xác nhận. */
  pendingAmountVnd: VndAmount,
  /** Còn phải trả = tổng − đã trả. */
  balanceVnd: VndAmount,
  dueDate: z.iso.date(),
  /** Quá hạn và chưa trả đủ. */
  overdue: z.boolean(),
  issuedAt: z.iso.datetime(),
  voidedAt: z.iso.datetime().nullable(),
  voidReason: z.string().nullable(),
  /** Có khoản thanh toán chờ tôi xác nhận. */
  awaitingMe: z.boolean(),
});
export type FeeStatement = z.infer<typeof FeeStatement>;

/** Một học sinh trong tổng hợp tháng: số buổi theo trạng thái và bảng học phí của tháng (nếu đã lập). */
export const FeeOverviewRow = FeeEnrollmentRef.extend({
  sessions: FeeSessionCounts,
  statement: FeeStatement.nullable(),
});
export type FeeOverviewRow = z.infer<typeof FeeOverviewRow>;

/** Khoản thanh toán chờ tôi xác nhận, ở bất kỳ tháng nào. */
export const AwaitingPayment = z.object({
  payment: Payment,
  statementId: Id,
  month: FeeMonth,
  enrollment: FeeEnrollmentRef,
});
export type AwaitingPayment = z.infer<typeof AwaitingPayment>;

export const FeeOverview = z.object({
  month: FeeMonth,
  rows: z.array(FeeOverviewRow),
  totals: z.object({
    /** Tổng các bảng học phí của tháng. */
    totalVnd: VndAmount,
    paidVnd: VndAmount,
    outstandingVnd: VndAmount,
    /** Tạm tính của các học sinh chưa có bảng tháng này (buổi đã chốt + chờ xác nhận). */
    provisionalVnd: VndAmount,
    disputedSessions: z.int().nonnegative(),
  }),
  /** Bảng của các tháng khác còn chưa trả đủ. */
  unpaidOtherMonths: z.object({ count: z.int().nonnegative(), balanceVnd: VndAmount }),
  awaitingMe: z.array(AwaitingPayment),
});
export type FeeOverview = z.infer<typeof FeeOverview>;

/**
 * Đối chiếu học phí một tháng của một học sinh: mọi buổi trong tháng (kể cả buổi không tính tiền, kèm lý do), các
 * buổi tháng trước được tính vào bảng tháng này, bảng học phí và các khoản thanh toán.
 */
export const FeeMonthDetail = FeeEnrollmentRef.extend({
  month: FeeMonth,
  sessions: FeeSessionCounts,
  lines: z.array(FeeLine),
  statement: FeeStatement.nullable(),
  payments: z.array(Payment),
  /** Bảng của tháng này đã bị hủy để lập lại. */
  voidedStatements: z.array(FeeStatement),
});
export type FeeMonthDetail = z.infer<typeof FeeMonthDetail>;
