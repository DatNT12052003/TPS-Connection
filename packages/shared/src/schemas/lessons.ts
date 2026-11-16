// Lịch học, buổi học, điểm danh, xác nhận buổi, khiếu nại, điểm và nhận xét (G6 đợt 2, §7, §9;
// docs/thiet_ke_co_so_du_lieu.md mục 7.2–7.4; trạng thái B.6–B.8).
// - Lịch lặp hằng tuần: các thứ trong tuần + giờ bắt đầu theo giờ Việt Nam; hệ thống sinh trước buổi học trong 8 tuần
//   (D27). Buổi lẻ và buổi bù do gia sư tạo. Thời điểm lưu UTC, trả ISO 8601.
// - Gia sư điểm danh sau giờ bắt đầu; phụ huynh có 48 giờ để xác nhận hoặc khiếu nại, hết hạn thì tự chốt (C5).
//   Khiếu nại: hai bên có 3 ngày tự thống nhất, rồi Manager quyết định và chỉ sửa bản ghi (C5, D38).
// - Tính tiền (C5): chỉ buổi đã dạy và học sinh có mặt. Mỗi điểm danh lưu giá học phí áp dụng lúc ghi (D17).
// - Học sinh chỉ xem: không thấy học phí, không xác nhận hay khiếu nại.
import { z } from 'zod';
import {
  AssessmentKind,
  AttendanceConfirmationStatus,
  AttendanceDisputeStatus,
  AttendanceStatus,
  ClassRole,
  ClassScheduleStatus,
  LessonCancelKind,
  LessonMode,
  LessonStatus,
} from '../statuses.js';
import { Id, optionalText } from './common.js';
import { CONNECTION_LIMITS } from './connections.js';
import { TimeOfDay } from './tutors.js';

export const LESSON_LIMITS = {
  /** Sinh trước buổi học từ lịch lặp bao xa (D27). */
  generateWeeks: 8,
  /** Báo hủy dưới số giờ này trước giờ học là hủy muộn (C5). */
  lateCancelHours: 2,
  /** Hạn phụ huynh xác nhận buổi sau khi gia sư điểm danh (C5). */
  confirmHours: 48,
  /** Nhắc phụ huynh khi còn chừng này giờ trước hạn xác nhận (một lần, C5). */
  confirmReminderHours: 24,
  /** Hai bên tự thống nhất khiếu nại trong chừng này ngày, sau đó chuyển Manager (C5). */
  disputeNegotiateDays: 3,
  /** Nhắc gia sư điểm danh khi buổi đã kết thúc chừng này giờ (D36). */
  attendanceReminderHours: 24,
  /** Nhắc buổi học sắp diễn ra trước chừng này giờ. */
  upcomingReminderHours: 24,
  /** Khoảng tối đa của một lần xem lịch (một tháng và vài ngày đệm hai đầu). */
  calendarMaxDays: 62,
  /** Buổi lẻ, buổi bù: không tạo lùi quá chừng này ngày (ghi lại buổi đã dạy ngoài lịch). */
  pastLessonDays: 30,
  /** Không xếp buổi xa hơn chừng này ngày. */
  futureLessonDays: 366,
  schedulesPerClass: 7,
  reasonLength: 500,
  contentLength: 4000,
  commentLength: 2000,
  locationLength: 300,
  urlLength: 500,
  assessmentTitleLength: 200,
  maxScore: 1000,
} as const;

const CalendarDate = z.iso.date({ error: 'invalid_calendar_date' });
const Instant = z.iso.datetime({ offset: true, error: 'invalid_datetime' });

const requiredText = (max: number) =>
  z.string().trim().min(1, { error: 'required' }).max(max, { error: 'too_long' });

const nullableText = (max: number) => optionalText(max).transform((v) => v ?? null);

const DurationMinutes = z
  .int({ error: 'required' })
  .min(CONNECTION_LIMITS.minSessionMinutes, { error: 'invalid_session_minutes' })
  .max(CONNECTION_LIMITS.maxSessionMinutes, { error: 'invalid_session_minutes' });

const OnlineUrl = z
  .union([
    z.literal('').transform(() => null),
    z.url({ protocol: /^https$/, error: 'invalid_url' }).max(LESSON_LIMITS.urlLength, {
      error: 'too_long',
    }),
  ])
  .nullable()
  .optional()
  .transform((v) => v ?? null);

// ---- Request: lịch -----------------------------------------------------------------------------

export const ScheduleParams = z.object({ classId: Id, scheduleId: Id });
export type ScheduleParams = z.infer<typeof ScheduleParams>;

/**
 * Lịch lặp hằng tuần (§7): các thứ (1 = thứ Hai … 7 = Chủ nhật), giờ bắt đầu và thời lượng theo giờ Việt Nam, từ ngày
 * `startDate` tới `untilDate` (không có: tới khi dừng lịch hoặc kết thúc lớp).
 */
export const ScheduleInput = z
  .object({
    weekdays: z
      .array(z.int().min(1).max(7))
      .min(1, { error: 'required' })
      .max(7, { error: 'too_many' }),
    startTime: TimeOfDay,
    durationMinutes: DurationMinutes,
    startDate: CalendarDate,
    untilDate: CalendarDate.nullable()
      .optional()
      .transform((v) => v ?? null),
    teachingMode: LessonMode,
    locationNote: nullableText(LESSON_LIMITS.locationLength),
    onlineUrl: OnlineUrl,
  })
  .superRefine((value, ctx) => {
    if (new Set(value.weekdays).size !== value.weekdays.length) {
      ctx.addIssue({ code: 'custom', path: ['weekdays'], message: 'duplicate' });
    }
    if (value.untilDate && value.untilDate < value.startDate) {
      ctx.addIssue({ code: 'custom', path: ['untilDate'], message: 'period_end_before_start' });
    }
  });
export type ScheduleInput = z.infer<typeof ScheduleInput>;

// ---- Request: buổi học -------------------------------------------------------------------------

export const LessonIdParams = z.object({ lessonId: Id });
export type LessonIdParams = z.infer<typeof LessonIdParams>;

export const AttendanceParams = LessonIdParams.extend({ attendanceId: Id });
export type AttendanceParams = z.infer<typeof AttendanceParams>;

/**
 * Lịch của tôi trong khoảng [`from`, `to`) (tối đa `LESSON_LIMITS.calendarMaxDays` ngày), mọi lớp tôi thấy; lọc theo
 * lớp hoặc theo con. Client tự chia theo ngày, tuần, tháng.
 */
export const LessonListQuery = z
  .object({
    from: Instant,
    to: Instant,
    classId: Id.optional(),
    learnerId: Id.optional(),
  })
  .superRefine((value, ctx) => {
    const span = Date.parse(value.to) - Date.parse(value.from);
    if (!(span > 0)) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'end_before_start' });
    } else if (span > LESSON_LIMITS.calendarMaxDays * 24 * 60 * 60 * 1000) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'range_too_long' });
    }
  });
export type LessonListQuery = z.infer<typeof LessonListQuery>;

/** Việc cần làm của tôi: buổi chờ điểm danh (gia sư), buổi chờ xác nhận (phụ huynh). */
export const LessonTodoQuery = z.object({ classId: Id.optional() });
export type LessonTodoQuery = z.infer<typeof LessonTodoQuery>;

/** Gia sư tạo buổi lẻ, hoặc buổi bù cho một buổi đã hủy / gia sư vắng (`makeupForLessonId`). */
export const CreateLessonRequest = z.object({
  startsAt: Instant,
  durationMinutes: DurationMinutes,
  teachingMode: LessonMode,
  locationNote: nullableText(LESSON_LIMITS.locationLength),
  onlineUrl: OnlineUrl,
  makeupForLessonId: Id.nullable()
    .optional()
    .transform((v) => v ?? null),
});
export type CreateLessonRequest = z.infer<typeof CreateLessonRequest>;

/** Gia sư dời giờ hoặc đổi hình thức, địa điểm của một buổi chưa diễn ra. Không gửi trường thì giữ nguyên. */
export const UpdateLessonRequest = z
  .object({
    startsAt: Instant.optional(),
    durationMinutes: DurationMinutes.optional(),
    teachingMode: LessonMode.optional(),
    locationNote: optionalText(LESSON_LIMITS.locationLength),
    onlineUrl: z
      .union([
        z.literal('').transform(() => null),
        z.url({ protocol: /^https$/, error: 'invalid_url' }).max(LESSON_LIMITS.urlLength, {
          error: 'too_long',
        }),
      ])
      .nullable()
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'nothing_to_update' });
export type UpdateLessonRequest = z.infer<typeof UpdateLessonRequest>;

/** Gia sư hoặc phụ huynh báo hủy một buổi chưa diễn ra (dưới 2 giờ: hủy muộn, C5). */
export const CancelLessonRequest = z.object({
  reason: requiredText(LESSON_LIMITS.reasonLength),
});
export type CancelLessonRequest = z.infer<typeof CancelLessonRequest>;

export const AttendanceInput = z.object({
  enrollmentId: Id,
  status: z.enum(['present', 'absent_notified', 'absent_no_show']),
  comment: nullableText(LESSON_LIMITS.commentLength),
});
export type AttendanceInput = z.infer<typeof AttendanceInput>;

/**
 * Gia sư điểm danh sau giờ bắt đầu (B.6, B.7): buổi có diễn ra (`held`, điểm danh từng học sinh) hoặc gia sư vắng
 * (`tutor_absent`, mọi học sinh `not_applicable`). Gửi lại khi phụ huynh chưa xác nhận là sửa điểm danh (D37).
 */
export const RecordAttendanceRequest = z
  .object({
    outcome: z.enum(['held', 'tutor_absent']),
    contentTaught: nullableText(LESSON_LIMITS.contentLength),
    notes: nullableText(LESSON_LIMITS.contentLength),
    actualMinutes: z
      .int()
      .min(0, { error: 'invalid' })
      .max(CONNECTION_LIMITS.maxSessionMinutes, { error: 'invalid' })
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    attendances: z.array(AttendanceInput).max(50, { error: 'too_many' }).default([]),
  })
  .superRefine((value, ctx) => {
    const ids = value.attendances.map((a) => a.enrollmentId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['attendances'], message: 'duplicate' });
    }
  });
export type RecordAttendanceRequest = z.infer<typeof RecordAttendanceRequest>;

/** Phụ huynh khiếu nại điểm danh (C5): lý do và tình trạng phụ huynh cho là đúng (nếu có). */
export const OpenDisputeRequest = z.object({
  reason: requiredText(LESSON_LIMITS.reasonLength),
  claimedStatus: AttendanceStatus.nullable()
    .optional()
    .transform((v) => v ?? null),
});
export type OpenDisputeRequest = z.infer<typeof OpenDisputeRequest>;

// ---- Request: điểm và nhận xét -------------------------------------------------------------------

export const AssessmentParams = z.object({ classId: Id, enrollmentId: Id, assessmentId: Id });
export type AssessmentParams = z.infer<typeof AssessmentParams>;

const Score = z.number().min(0, { error: 'invalid_score' }).max(LESSON_LIMITS.maxScore, {
  error: 'invalid_score',
});

/** Điểm luôn kèm nhận xét (§9). `score` để trống được (chỉ nhận xét). Điểm lưu 2 chữ số thập phân. */
export const CreateAssessmentRequest = z
  .object({
    kind: AssessmentKind,
    title: requiredText(LESSON_LIMITS.assessmentTitleLength),
    score: Score.nullable()
      .optional()
      .transform((v) => v ?? null),
    maxScore: Score.positive({ error: 'invalid_score' }).default(10),
    comment: requiredText(LESSON_LIMITS.commentLength),
    assessedOn: CalendarDate,
    lessonId: Id.nullable()
      .optional()
      .transform((v) => v ?? null),
  })
  .superRefine((value, ctx) => {
    if (value.score !== null && value.score > value.maxScore) {
      ctx.addIssue({ code: 'custom', path: ['score'], message: 'score_above_max' });
    }
  });
export type CreateAssessmentRequest = z.infer<typeof CreateAssessmentRequest>;

/** Sửa điểm và nhận xét. Không gửi trường thì giữ nguyên. */
export const UpdateAssessmentRequest = z
  .object({
    kind: AssessmentKind.optional(),
    title: requiredText(LESSON_LIMITS.assessmentTitleLength).optional(),
    score: Score.nullable().optional(),
    maxScore: Score.positive({ error: 'invalid_score' }).optional(),
    comment: requiredText(LESSON_LIMITS.commentLength).optional(),
    assessedOn: CalendarDate.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'nothing_to_update' });
export type UpdateAssessmentRequest = z.infer<typeof UpdateAssessmentRequest>;

// ---- Request: Manager xử lý khiếu nại ------------------------------------------------------------

export const DisputeIdParams = z.object({ disputeId: Id });
export type DisputeIdParams = z.infer<typeof DisputeIdParams>;

export const AdminDisputeListQuery = z.object({
  status: z.enum(['escalated', 'resolved_by_manager']).default('escalated'),
  page: z.coerce.number().int().min(1).max(100).default(1),
});
export type AdminDisputeListQuery = z.infer<typeof AdminDisputeListQuery>;

/** Manager quyết định (B.8): chỉ sửa bản ghi buổi và điểm danh, không hoàn tiền (D6). */
export const ResolveDisputeRequest = z
  .object({
    lessonStatus: z.enum(['held', 'tutor_absent']),
    attendanceStatus: AttendanceStatus,
    note: requiredText(LESSON_LIMITS.reasonLength),
  })
  .superRefine((value, ctx) => {
    const notApplicable = value.attendanceStatus === 'not_applicable';
    if ((value.lessonStatus === 'tutor_absent') !== notApplicable) {
      ctx.addIssue({ code: 'custom', path: ['attendanceStatus'], message: 'invalid' });
    }
  });
export type ResolveDisputeRequest = z.infer<typeof ResolveDisputeRequest>;

// ---- Response ---------------------------------------------------------------------------------

export const ClassSchedule = z.object({
  id: Id,
  weekdays: z.array(z.int()),
  startTime: z.string(),
  durationMinutes: z.int(),
  startDate: z.iso.date(),
  untilDate: z.iso.date().nullable(),
  teachingMode: LessonMode,
  locationNote: z.string().nullable(),
  onlineUrl: z.string().nullable(),
  status: ClassScheduleStatus,
  createdAt: z.iso.datetime(),
});
export type ClassSchedule = z.infer<typeof ClassSchedule>;

export const Assessment = z.object({
  id: Id,
  enrollmentId: Id,
  lessonId: Id.nullable(),
  kind: AssessmentKind,
  title: z.string(),
  score: z.number().nullable(),
  maxScore: z.number(),
  comment: z.string(),
  assessedOn: z.iso.date(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Assessment = z.infer<typeof Assessment>;

/** Ai hủy buổi: gia sư, client, hoặc hệ thống (lớp tạm nghỉ, kết thúc). */
export const LessonCancelledBy = z.enum(['tutor', 'client', 'system']);
export type LessonCancelledBy = z.infer<typeof LessonCancelledBy>;

/** Một buổi trên lịch. */
export const Lesson = z.object({
  id: Id,
  classId: Id,
  /** Tên riêng của lớp (null: ghép từ môn và học sinh). */
  className: z.string().nullable(),
  subjectId: z.int(),
  learnerNames: z.array(z.string()),
  tutorName: z.string(),
  myRole: ClassRole,
  status: LessonStatus,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  teachingMode: LessonMode,
  locationNote: z.string().nullable(),
  onlineUrl: z.string().nullable(),
  scheduleId: Id.nullable(),
  makeupForLessonId: Id.nullable(),
  /** Đã dời khỏi giờ gốc của lịch. */
  rescheduled: z.boolean(),
  cancelledBy: LessonCancelledBy.nullable(),
  cancelKind: LessonCancelKind.nullable(),
  cancelReason: z.string().nullable(),
  isLateCancellation: z.boolean(),
  /**
   * Đang chờ người xem: gia sư chưa điểm danh buổi đã bắt đầu; phụ huynh chưa xác nhận điểm danh. Học sinh: false.
   */
  awaitingMe: z.boolean(),
  /** Điểm danh và xác nhận của từng học sinh người xem thấy (không có học phí). Rỗng khi chưa điểm danh. */
  attendanceStates: z.array(
    z.object({
      enrollmentId: Id,
      status: AttendanceStatus,
      confirmationStatus: AttendanceConfirmationStatus,
    }),
  ),
});
export type Lesson = z.infer<typeof Lesson>;

export const LessonList = z.object({ items: z.array(Lesson) });
export type LessonList = z.infer<typeof LessonList>;

export const AttendanceDispute = z.object({
  id: Id,
  status: AttendanceDisputeStatus,
  reason: z.string(),
  claimedStatus: AttendanceStatus.nullable(),
  negotiateUntil: z.iso.datetime(),
  resolutionNote: z.string().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type AttendanceDispute = z.infer<typeof AttendanceDispute>;

export const LessonAttendance = z.object({
  id: Id,
  enrollmentId: Id,
  learner: z.object({ id: Id, name: z.string() }),
  status: AttendanceStatus,
  comment: z.string().nullable(),
  /** Giá áp dụng lúc ghi (D17); học sinh: null. */
  sessionPriceVnd: z.int().nullable(),
  sessionMinutes: z.int(),
  isBillable: z.boolean().nullable(),
  billableAmountVnd: z.int().nullable(),
  confirmationStatus: AttendanceConfirmationStatus,
  confirmDueAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
  /** Khiếu nại đang mở hoặc gần nhất. */
  dispute: AttendanceDispute.nullable(),
});
export type LessonAttendance = z.infer<typeof LessonAttendance>;

export const LessonDetail = Lesson.extend({
  contentTaught: z.string().nullable(),
  notes: z.string().nullable(),
  actualMinutes: z.int().nullable(),
  recordedAt: z.iso.datetime().nullable(),
  attendances: z.array(LessonAttendance),
  assessments: z.array(Assessment),
});
export type LessonDetail = z.infer<typeof LessonDetail>;

/** Khiếu nại trong hàng chờ của Manager: không có danh tính của trẻ, không có tin nhắn. */
export const AdminDispute = z.object({
  id: Id,
  status: AttendanceDisputeStatus,
  reason: z.string(),
  claimedStatus: AttendanceStatus.nullable(),
  negotiateUntil: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  resolutionNote: z.string().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  subjectId: z.int(),
  tutorName: z.string(),
  clientName: z.string(),
  lesson: z.object({
    id: Id,
    status: LessonStatus,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    contentTaught: z.string().nullable(),
    actualMinutes: z.int().nullable(),
  }),
  attendance: z.object({
    id: Id,
    status: AttendanceStatus,
    comment: z.string().nullable(),
    sessionPriceVnd: z.int(),
  }),
});
export type AdminDispute = z.infer<typeof AdminDispute>;

export const AdminDisputeList = z.object({
  items: z.array(AdminDispute),
  page: z.int(),
  pageSize: z.int(),
  total: z.int(),
});
export type AdminDisputeList = z.infer<typeof AdminDisputeList>;
