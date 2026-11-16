// Yêu cầu kết nối (G5, §5; docs/thiet_ke_co_so_du_lieu.md mục 6.4; trạng thái B.1).
// - Hai chiều: phụ huynh gửi gia sư (`client_to_tutor`, từ hồ sơ hoặc bài tuyển) hoặc gia sư ứng tuyển vào bài tìm
//   gia sư (`tutor_to_client`). Một yêu cầu cho một người học và một môn (D21).
// - pending → negotiating (bên nhận chấp nhận, D15) → confirmed (cả hai xác nhận cùng phiên bản điều khoản mới nhất,
//   C3); nhánh rejected, cancelled. Tự hủy sau 7 ngày chờ / 30 ngày trao đổi.
// - Gia sư chỉ thấy nhu cầu (môn, khối, mục tiêu, hình thức, tỉnh/xã). Email, số điện thoại và danh tính trẻ (họ tên,
//   trường, địa chỉ) chỉ có khi đã xác nhận hợp tác (D8, D16).
import { z } from 'zod';
import {
  ConnectionCancelReason,
  ConnectionDirection,
  ConnectionEventType,
  ConnectionParty,
  ConnectionRequestStatus,
  RequestPostGoal,
  TeachingMode,
} from '../statuses.js';
import { Id, optionalText, PaginationQuery, paginated } from './common.js';
import { TimeOfDay } from './tutors.js';

export const CONNECTION_LIMITS = {
  messageLength: 1000,
  goalNoteLength: 500,
  rejectionNoteLength: 500,
  termsNoteLength: 1000,
  /** Số buổi trong lịch dự kiến của một phiên bản điều khoản. */
  scheduleEntries: 14,
  maxSessionPriceVnd: 100_000_000,
  minSessionMinutes: 15,
  maxSessionMinutes: 600,
  /** Yêu cầu một người đã gửi mà bên kia chưa trả lời. */
  pendingSent: 30,
  /** Số lần gửi yêu cầu (kể cả đã rút) trong một giờ của một tài khoản. */
  sendPerHour: 20,
  /** Hạn chờ phản hồi và hạn trao đổi (C3). */
  pendingDays: 7,
  negotiatingDays: 30,
  /** Nhắc trước khi hết hạn (D30). */
  pendingReminderHours: 24,
  negotiatingReminderDays: 3,
} as const;

const CalendarDate = z.iso.date({ error: 'invalid_calendar_date' });

const nullable = <T extends z.ZodType>(schema: T) =>
  schema
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const AreaId = z.int().positive();

const Message = z
  .string()
  .trim()
  .min(1, { error: 'required' })
  .max(CONNECTION_LIMITS.messageLength, { error: 'too_long' });

/** Nhu cầu học kèm theo yêu cầu: không có thông tin nhận dạng nào của trẻ (D16). */
const NeedInput = {
  subjectId: z.int().positive(),
  gradeLevelId: z.int().positive(),
  goal: RequestPostGoal,
  goalNote: optionalText(CONNECTION_LIMITS.goalNoteLength).transform((v) => v ?? null),
  teachingMode: TeachingMode,
  provinceId: nullable(AreaId),
  communeId: nullable(AreaId),
};

function checkLocation(
  value: { teachingMode: TeachingMode; provinceId: number | null },
  ctx: z.RefinementCtx,
) {
  if (value.teachingMode !== 'online' && value.provinceId === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['provinceId'],
      message: 'province_required_for_in_person',
    });
  }
}

/** Phụ huynh gửi gia sư cho một hồ sơ con (§5.1), có thể từ một bài tuyển của gia sư đó. */
export const SendToTutorRequest = z
  .object({
    direction: z.literal('client_to_tutor'),
    tutorId: Id,
    learnerId: Id,
    tutorPostId: nullable(Id),
    ...NeedInput,
    message: Message,
  })
  .superRefine(checkLocation);
export type SendToTutorRequest = z.infer<typeof SendToTutorRequest>;

/** Gia sư ứng tuyển vào một bài tìm gia sư (§5.2). Nhu cầu lấy từ bài. */
export const ApplyToRequestPostRequest = z.object({
  direction: z.literal('tutor_to_client'),
  requestPostId: Id,
  message: Message,
});
export type ApplyToRequestPostRequest = z.infer<typeof ApplyToRequestPostRequest>;

export const CreateConnectionRequest = z.discriminatedUnion('direction', [
  SendToTutorRequest,
  ApplyToRequestPostRequest,
]);
export type CreateConnectionRequest = z.infer<typeof CreateConnectionRequest>;

/** Từ chối, có thể kèm lời nhắn. Không gửi thân request cũng được. */
export const RejectConnectionRequest = z
  .object({
    note: optionalText(CONNECTION_LIMITS.rejectionNoteLength).transform((v) => v ?? null),
  })
  .prefault({});
export type RejectConnectionRequest = z.infer<typeof RejectConnectionRequest>;

/** Một buổi trong lịch dự kiến: thứ (1 = thứ Hai … 7 = Chủ nhật) và giờ bắt đầu; độ dài theo `sessionMinutes`. */
export const TermsScheduleEntry = z.object({
  weekday: z.int().min(1).max(7),
  startTime: TimeOfDay,
});
export type TermsScheduleEntry = z.infer<typeof TermsScheduleEntry>;

/**
 * Đề xuất một phiên bản điều kiện hợp tác (C6, D18): học phí theo buổi kèm thời lượng mỗi buổi. Môn cố định theo
 * yêu cầu (D21). Phiên bản mới làm mất hiệu lực mọi xác nhận trên phiên bản cũ.
 */
export const ProposeTermsRequest = z
  .object({
    gradeLevelId: z.int().positive(),
    goal: RequestPostGoal,
    goalNote: optionalText(CONNECTION_LIMITS.goalNoteLength).transform((v) => v ?? null),
    teachingMode: TeachingMode,
    provinceId: nullable(AreaId),
    communeId: nullable(AreaId),
    sessionPriceVnd: z
      .int({ error: 'required' })
      .positive({ error: 'invalid_amount' })
      .max(CONNECTION_LIMITS.maxSessionPriceVnd, { error: 'invalid_amount' }),
    sessionMinutes: z
      .int({ error: 'required' })
      .min(CONNECTION_LIMITS.minSessionMinutes, { error: 'invalid_session_minutes' })
      .max(CONNECTION_LIMITS.maxSessionMinutes, { error: 'invalid_session_minutes' }),
    sessionsPerWeek: nullable(z.int().min(1).max(14)),
    schedule: z
      .array(TermsScheduleEntry)
      .max(CONNECTION_LIMITS.scheduleEntries, { error: 'too_many' })
      .default([]),
    startDate: nullable(CalendarDate),
    note: optionalText(CONNECTION_LIMITS.termsNoteLength).transform((v) => v ?? null),
  })
  .superRefine((value, ctx) => {
    checkLocation(value, ctx);
    const keys = value.schedule.map((s) => `${s.weekday}@${s.startTime}`);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: 'custom', path: ['schedule'], message: 'duplicate' });
    }
  });
export type ProposeTermsRequest = z.infer<typeof ProposeTermsRequest>;

/** Xác nhận hợp tác theo một phiên bản điều khoản; phải là phiên bản mới nhất (khác: 409 `terms_outdated`). */
export const ConfirmTermsRequest = z.object({ version: z.int().positive() });
export type ConfirmTermsRequest = z.infer<typeof ConfirmTermsRequest>;

export const ConnectionRequestIdParams = z.object({ requestId: Id });
export type ConnectionRequestIdParams = z.infer<typeof ConnectionRequestIdParams>;

/**
 * Danh sách yêu cầu của tôi. `as`: với vai trò gia sư hay client (một người có thể có cả hai vai trò);
 * `box`: đã nhận hay đã gửi; `state`: đang mở (pending, negotiating) hay đã kết thúc.
 */
export const ConnectionRequestListQuery = PaginationQuery.extend({
  as: ConnectionParty.optional(),
  box: z.enum(['received', 'sent']).optional(),
  state: z.enum(['open', 'closed']).optional(),
  status: ConnectionRequestStatus.optional(),
  learnerId: Id.optional(),
  requestPostId: Id.optional(),
  tutorPostId: Id.optional(),
});
export type ConnectionRequestListQuery = z.infer<typeof ConnectionRequestListQuery>;

// ---- Response ---------------------------------------------------------------------------------

/** Nhu cầu học chụp lúc gửi yêu cầu. Không có thông tin nhận dạng của trẻ. */
export const ConnectionNeed = z.object({
  subjectId: z.int(),
  gradeLevelId: z.int(),
  goal: RequestPostGoal,
  goalNote: z.string().nullable(),
  teachingMode: TeachingMode,
  provinceId: z.int().nullable(),
  communeId: z.int().nullable(),
});
export type ConnectionNeed = z.infer<typeof ConnectionNeed>;

/** Gia sư trong yêu cầu, ở dạng công khai (không email, số điện thoại, họ tên thật). */
export const ConnectionTutor = z.object({
  id: Id,
  displayName: z.string(),
  /** Đường dẫn hồ sơ `/tutors/<slug>`. */
  slug: z.string(),
  avatarUrl: z.string().nullable(),
});
export type ConnectionTutor = z.infer<typeof ConnectionTutor>;

/** Client (phụ huynh) trong yêu cầu: tên hiển thị. Gia sư chỉ thấy sau khi yêu cầu được chấp nhận. */
export const ConnectionClient = z.object({ displayName: z.string() });
export type ConnectionClient = z.infer<typeof ConnectionClient>;

/** Hồ sơ con gắn với yêu cầu: chỉ phụ huynh thấy (gia sư thấy `learnerIdentity` sau khi xác nhận hợp tác). */
export const ConnectionLearner = z.object({ id: Id, name: z.string() });
export type ConnectionLearner = z.infer<typeof ConnectionLearner>;

/** Liên hệ của bên kia, chỉ có khi đã xác nhận hợp tác (D16). */
export const ConnectionContact = z.object({
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});
export type ConnectionContact = z.infer<typeof ConnectionContact>;

/** Danh tính của trẻ cho gia sư, chỉ có khi đã xác nhận hợp tác (D16). */
export const ConnectionLearnerIdentity = z.object({
  fullName: z.string().nullable(),
  nickname: z.string().nullable(),
  schoolName: z.string().nullable(),
  addressLine: z.string().nullable(),
});
export type ConnectionLearnerIdentity = z.infer<typeof ConnectionLearnerIdentity>;

export const ConnectionTerms = z.object({
  version: z.int().positive(),
  proposedBy: ConnectionParty,
  subjectId: z.int(),
  gradeLevelId: z.int(),
  goal: RequestPostGoal,
  goalNote: z.string().nullable(),
  teachingMode: TeachingMode,
  provinceId: z.int().nullable(),
  communeId: z.int().nullable(),
  sessionPriceVnd: z.int().nonnegative(),
  sessionMinutes: z.int(),
  sessionsPerWeek: z.int().nullable(),
  schedule: z.array(TermsScheduleEntry),
  startDate: z.iso.date().nullable(),
  note: z.string().nullable(),
  tutorConfirmedAt: z.iso.datetime().nullable(),
  clientConfirmedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type ConnectionTerms = z.infer<typeof ConnectionTerms>;

export const ConnectionEvent = z.object({
  event: ConnectionEventType,
  /** Ai làm: gia sư, client, hoặc hệ thống (job, thao tác khác). */
  actor: z.enum(['tutor', 'client', 'system']),
  fromStatus: ConnectionRequestStatus.nullable(),
  toStatus: ConnectionRequestStatus.nullable(),
  createdAt: z.iso.datetime(),
});
export type ConnectionEvent = z.infer<typeof ConnectionEvent>;

/** Một yêu cầu trong danh sách. */
export const ConnectionRequestSummary = z.object({
  id: Id,
  direction: ConnectionDirection,
  status: ConnectionRequestStatus,
  cancelReason: ConnectionCancelReason.nullable(),
  /** Vai trò của người đang xem trong yêu cầu này. */
  myRole: ConnectionParty,
  /** Người đang xem là bên gửi. */
  isSender: z.boolean(),
  /** Đang chờ người xem làm gì đó: trả lời yêu cầu, hoặc xác nhận phiên bản điều khoản mới nhất. */
  awaitingMe: z.boolean(),
  need: ConnectionNeed,
  tutor: ConnectionTutor,
  client: ConnectionClient.nullable(),
  learner: ConnectionLearner.nullable(),
  tutorPostId: Id.nullable(),
  requestPostId: Id.nullable(),
  /** Hạn tự hủy, chỉ khi còn mở. */
  expiresAt: z.iso.datetime().nullable(),
  /** Hội thoại của yêu cầu, có từ khi bên nhận chấp nhận (D14). */
  conversationId: Id.nullable(),
  /** Lớp hệ thống tạo khi hai bên xác nhận hợp tác (D9, G6). */
  classId: Id.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConnectionRequestSummary = z.infer<typeof ConnectionRequestSummary>;

export const ConnectionRequestList = paginated(ConnectionRequestSummary);
export type ConnectionRequestList = z.infer<typeof ConnectionRequestList>;

export const ConnectionRequestDetail = ConnectionRequestSummary.extend({
  message: z.string(),
  rejectionNote: z.string().nullable(),
  acceptedAt: z.iso.datetime().nullable(),
  confirmedAt: z.iso.datetime().nullable(),
  closedAt: z.iso.datetime().nullable(),
  /** Phiên bản điều khoản mới nhất (khi đã xác nhận: phiên bản đã chốt). */
  terms: ConnectionTerms.nullable(),
  contact: ConnectionContact.nullable(),
  learnerIdentity: ConnectionLearnerIdentity.nullable(),
  events: z.array(ConnectionEvent),
});
export type ConnectionRequestDetail = z.infer<typeof ConnectionRequestDetail>;
