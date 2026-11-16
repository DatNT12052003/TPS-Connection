// Lớp học (G6, §6; docs/thiet_ke_co_so_du_lieu.md mục 7.1; trạng thái B.5).
// - Hệ thống tạo lớp khi yêu cầu kết nối chuyển `confirmed` (D9): một lớp 1 kèm 1 (D7), một ghi danh và mức học phí
//   đầu tiên lấy từ điều khoản đã thống nhất.
// - Người xem một lớp có một trong ba vai trò: gia sư của lớp, client (phụ huynh đang quản lý học sinh) hoặc chính học
//   sinh (chỉ xem, D4). Người ngoài: 404.
// - Chỉ gia sư tạm nghỉ, cho học lại, kết thúc lớp (D35). Đổi học phí: gia sư đề xuất, phụ huynh đồng ý; mức mới áp
//   dụng từ lúc đồng ý (D17).
// - Lưu ý giảng dạy chỉ gia sư thấy. Học phí và năng lực ban đầu chỉ gia sư và phụ huynh thấy.
import { z } from 'zod';
import {
  ClassRole,
  EnrollmentStatus,
  FeeRateStatus,
  LearningGoalPeriod,
  LearningGoalStatus,
  RequestPostGoal,
  TeachingMode,
  TutoringClassStatus,
} from '../statuses.js';
import { Id, optionalText, PaginationQuery, paginated } from './common.js';
import {
  CONNECTION_LIMITS,
  ConnectionContact,
  ConnectionLearnerIdentity,
  ConnectionTutor,
} from './connections.js';
import { Assessment, ClassSchedule } from './lessons.js';

export const CLASS_LIMITS = {
  nameLength: 120,
  endReasonLength: 500,
  notesLength: 4000,
  feeNoteLength: 500,
  goalDescriptionLength: 1000,
  goalProgressNoteLength: 2000,
  /** Số mục tiêu của một ghi danh. */
  goalsPerEnrollment: 100,
} as const;

const CalendarDate = z.iso.date({ error: 'invalid_calendar_date' });

const requiredText = (max: number) =>
  z.string().trim().min(1, { error: 'required' }).max(max, { error: 'too_long' });

// ---- Request ----------------------------------------------------------------------------------

export const ClassIdParams = z.object({ classId: Id });
export type ClassIdParams = z.infer<typeof ClassIdParams>;

export const EnrollmentParams = ClassIdParams.extend({ enrollmentId: Id });
export type EnrollmentParams = z.infer<typeof EnrollmentParams>;

export const FeeRateParams = EnrollmentParams.extend({ rateId: Id });
export type FeeRateParams = z.infer<typeof FeeRateParams>;

export const LearningGoalParams = EnrollmentParams.extend({ goalId: Id });
export type LearningGoalParams = z.infer<typeof LearningGoalParams>;

/**
 * Lớp của tôi. `as`: với vai trò nào (một người có thể vừa là gia sư vừa là phụ huynh); `state`: đang học hoặc tạm
 * nghỉ (`current`) hay đã kết thúc (`ended`); `learnerId`: lớp của một học sinh (phụ huynh).
 */
export const ClassListQuery = PaginationQuery.extend({
  as: ClassRole.optional(),
  state: z.enum(['current', 'ended']).optional(),
  learnerId: Id.optional(),
});
export type ClassListQuery = z.infer<typeof ClassListQuery>;

/** Gia sư đặt tên lớp. `null` hoặc chuỗi rỗng: bỏ tên riêng, giao diện ghép tên từ môn và học sinh. */
export const UpdateClassRequest = z.object({
  name: optionalText(CLASS_LIMITS.nameLength).transform((v) => v ?? null),
});
export type UpdateClassRequest = z.infer<typeof UpdateClassRequest>;

/** Kết thúc lớp: bắt buộc ghi lý do (B.5.1). */
export const EndClassRequest = z.object({ reason: requiredText(CLASS_LIMITS.endReasonLength) });
export type EndClassRequest = z.infer<typeof EndClassRequest>;

/** Gia sư ghi năng lực ban đầu và lưu ý giảng dạy. Không gửi trường thì giữ nguyên; `null` để xóa. */
export const UpdateEnrollmentNotesRequest = z
  .object({
    initialAssessment: optionalText(CLASS_LIMITS.notesLength),
    teachingNotes: optionalText(CLASS_LIMITS.notesLength),
  })
  .refine((v) => v.initialAssessment !== undefined || v.teachingNotes !== undefined, {
    error: 'nothing_to_update',
  });
export type UpdateEnrollmentNotesRequest = z.infer<typeof UpdateEnrollmentNotesRequest>;

/** Gia sư đề xuất mức học phí mới (D17). Cùng giới hạn với điều kiện hợp tác. */
export const ProposeFeeRateRequest = z.object({
  sessionPriceVnd: z
    .int({ error: 'required' })
    .positive({ error: 'invalid_amount' })
    .max(CONNECTION_LIMITS.maxSessionPriceVnd, { error: 'invalid_amount' }),
  sessionMinutes: z
    .int({ error: 'required' })
    .min(CONNECTION_LIMITS.minSessionMinutes, { error: 'invalid_session_minutes' })
    .max(CONNECTION_LIMITS.maxSessionMinutes, { error: 'invalid_session_minutes' }),
  note: optionalText(CLASS_LIMITS.feeNoteLength).transform((v) => v ?? null),
});
export type ProposeFeeRateRequest = z.infer<typeof ProposeFeeRateRequest>;

const checkPeriod = (
  value: { periodStart?: string | undefined; periodEnd?: string | undefined },
  ctx: z.RefinementCtx,
) => {
  if (value.periodStart && value.periodEnd && value.periodEnd < value.periodStart) {
    ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: 'period_end_before_start' });
  }
};

/** Mục tiêu học tập theo tháng, học kỳ hoặc khoảng tự chọn (§6). */
export const CreateLearningGoalRequest = z
  .object({
    periodType: LearningGoalPeriod,
    periodStart: CalendarDate,
    periodEnd: CalendarDate,
    description: requiredText(CLASS_LIMITS.goalDescriptionLength),
  })
  .superRefine(checkPeriod);
export type CreateLearningGoalRequest = z.infer<typeof CreateLearningGoalRequest>;

/** Sửa mục tiêu, cập nhật kết quả và ghi chú tiến độ. Không gửi trường thì giữ nguyên. */
export const UpdateLearningGoalRequest = z
  .object({
    periodType: LearningGoalPeriod.optional(),
    periodStart: CalendarDate.optional(),
    periodEnd: CalendarDate.optional(),
    description: requiredText(CLASS_LIMITS.goalDescriptionLength).optional(),
    status: LearningGoalStatus.optional(),
    progressNote: optionalText(CLASS_LIMITS.goalProgressNoteLength),
  })
  .superRefine((value, ctx) => {
    checkPeriod(value, ctx);
    if (Object.values(value).every((v) => v === undefined)) {
      ctx.addIssue({ code: 'custom', path: [], message: 'nothing_to_update' });
    }
  });
export type UpdateLearningGoalRequest = z.infer<typeof UpdateLearningGoalRequest>;

// ---- Response ---------------------------------------------------------------------------------

/** Học sinh của lớp: id hồ sơ và tên gọi (biệt danh, không có thì họ tên). */
export const ClassLearner = z.object({ id: Id, name: z.string() });
export type ClassLearner = z.infer<typeof ClassLearner>;

/** Mức học phí đang áp dụng. */
export const ClassFee = z.object({
  sessionPriceVnd: z.int().nonnegative(),
  sessionMinutes: z.int(),
  effectiveFrom: z.iso.datetime(),
});
export type ClassFee = z.infer<typeof ClassFee>;

/** Một lớp trong danh sách (mỗi dòng là một học sinh của lớp; bản đầu lớp nào cũng 1 kèm 1). */
export const ClassSummary = z.object({
  id: Id,
  /** Tên riêng do gia sư đặt; `null` thì giao diện ghép từ môn và tên học sinh. */
  name: z.string().nullable(),
  status: TutoringClassStatus,
  myRole: ClassRole,
  subjectId: z.int(),
  gradeLevelId: z.int(),
  teachingMode: TeachingMode,
  startedOn: z.iso.date(),
  endedOn: z.iso.date().nullable(),
  tutor: ConnectionTutor,
  client: z.object({ displayName: z.string() }),
  learner: ClassLearner,
  enrollmentId: Id,
  /** Học phí đang áp dụng; học sinh không xem học phí. */
  currentFee: ClassFee.nullable(),
  /** Có đề xuất đổi học phí đang chờ phụ huynh (false với học sinh). */
  feeChangePending: z.boolean(),
  /** Hội thoại gia sư – phụ huynh từ yêu cầu kết nối (học sinh: null, C7). */
  conversationId: Id.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ClassSummary = z.infer<typeof ClassSummary>;

export const ClassList = paginated(ClassSummary);
export type ClassList = z.infer<typeof ClassList>;

export const FeeRate = z.object({
  id: Id,
  sessionPriceVnd: z.int().nonnegative(),
  sessionMinutes: z.int(),
  status: FeeRateStatus,
  note: z.string().nullable(),
  /** Từ thời điểm này các buổi học dùng mức này (chỉ khi đã có hiệu lực). */
  effectiveFrom: z.iso.datetime().nullable(),
  /** Mức đầu tiên lấy từ điều khoản hợp tác (`terms`), các mức sau do gia sư đề xuất. */
  source: z.enum(['terms', 'proposal']),
  decidedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type FeeRate = z.infer<typeof FeeRate>;

export const LearningGoal = z.object({
  id: Id,
  periodType: LearningGoalPeriod,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  description: z.string(),
  status: LearningGoalStatus,
  progressNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type LearningGoal = z.infer<typeof LearningGoal>;

export const ClassEnrollment = z.object({
  id: Id,
  status: EnrollmentStatus,
  joinedOn: z.iso.date(),
  leftOn: z.iso.date().nullable(),
  learner: ClassLearner,
  /** Năng lực ban đầu do gia sư ghi: gia sư và phụ huynh thấy (học sinh: null). */
  initialAssessment: z.string().nullable(),
  /** Lưu ý giảng dạy: chỉ gia sư thấy. */
  teachingNotes: z.string().nullable(),
  /** Lịch sử mức học phí, mới nhất trước: gia sư và phụ huynh thấy (học sinh: rỗng). */
  feeRates: z.array(FeeRate),
  /** Mục tiêu học tập, mới nhất trước. */
  goals: z.array(LearningGoal),
  /** Điểm và nhận xét (§9), mới nhất trước. */
  assessments: z.array(Assessment),
});
export type ClassEnrollment = z.infer<typeof ClassEnrollment>;

export const ClassDetail = ClassSummary.extend({
  /** Mục tiêu, ghi chú và khu vực theo điều khoản đã thống nhất. */
  goal: RequestPostGoal,
  goalNote: z.string().nullable(),
  provinceId: z.int().nullable(),
  communeId: z.int().nullable(),
  endedReason: z.string().nullable(),
  /** Yêu cầu kết nối đã tạo lớp (gia sư và phụ huynh; học sinh: null). */
  connectionRequestId: Id.nullable(),
  enrollments: z.array(ClassEnrollment),
  /** Lịch lặp hằng tuần của lớp (cả lịch đã dừng). */
  schedules: z.array(ClassSchedule),
  /** Liên hệ của bên kia (gia sư thấy phụ huynh, phụ huynh thấy gia sư; học sinh: null). */
  contact: ConnectionContact.nullable(),
  /** Danh tính học sinh cho gia sư (D16); người khác: null. */
  learnerIdentity: ConnectionLearnerIdentity.nullable(),
});
export type ClassDetail = z.infer<typeof ClassDetail>;
