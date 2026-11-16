// Thông báo (G5 đợt 3, §12; docs/thiet_ke_co_so_du_lieu.md mục 9).
// - Ghi trong cùng transaction với sự kiện; sau commit server đẩy `notification:new` (Socket.IO) và xếp email.
// - `data` chỉ có id và tên hiển thị để client dựng nội dung theo ngôn ngữ của người xem; KHÔNG BAO GIỜ có thông tin
//   nhận dạng của trẻ (§12). Email cũng vậy.
// - Tin nhắn mới: mỗi hội thoại một thông báo chưa đọc, `count` tăng dần; đọc hội thoại thì thông báo thành đã đọc.
import { z } from 'zod';
import { ConnectionDirection, NotificationType, VerificationRequestKind } from '../statuses.js';
import { Id, PaginationQuery, paginated } from './common.js';

export const NOTIFICATION_LIMITS = {
  pageSizeMax: 50,
  /** Đếm thông báo chưa đọc tối đa đến số này ("99+"). */
  unreadCap: 99,
} as const;

/**
 * Mặc định theo loại. `email: null`: loại này không có tùy chọn email (email kết quả xác minh luôn được gửi từ quy
 * trình xác minh, G3). Bảng `notification_preferences` chỉ lưu lựa chọn khác mặc định.
 */
export const NOTIFICATION_DEFAULTS: Record<
  NotificationType,
  { inApp: boolean; email: boolean | null }
> = {
  connection_received: { inApp: true, email: true },
  connection_accepted: { inApp: true, email: true },
  connection_rejected: { inApp: true, email: true },
  connection_expiring: { inApp: true, email: true },
  connection_confirmed: { inApp: true, email: true },
  // Email mỗi hội thoại tối đa một lần cho tới khi người nhận đọc; mặc định tắt để không làm phiền.
  message_new: { inApp: true, email: false },
  verification_result: { inApp: true, email: null },
  // Lớp học (G6).
  class_status: { inApp: true, email: true },
  fee_change: { inApp: true, email: true },
  lesson_upcoming: { inApp: true, email: false },
  lesson_changed: { inApp: true, email: true },
  attendance_reminder: { inApp: true, email: true },
  lesson_to_confirm: { inApp: true, email: true },
  lesson_dispute: { inApp: true, email: true },
  assessment_new: { inApp: true, email: false },
};

// ---- Dữ liệu theo loại ----------------------------------------------------------------------------

/** Tên hiển thị của bên kia; null khi người nhận chưa được biết (gia sư trước khi yêu cầu được chấp nhận). */
const CounterpartName = z.string().nullable();

export const ConnectionNotificationData = z.object({
  requestId: Id,
  direction: ConnectionDirection,
  subjectId: z.int(),
  counterpartName: CounterpartName,
});
export type ConnectionNotificationData = z.infer<typeof ConnectionNotificationData>;

export const ConnectionExpiringData = ConnectionNotificationData.extend({
  status: z.enum(['pending', 'negotiating']),
  expiresAt: z.iso.datetime(),
});
export type ConnectionExpiringData = z.infer<typeof ConnectionExpiringData>;

export const MessageNotificationData = z.object({
  conversationId: Id,
  counterpartName: z.string(),
  /** Số tin mới gộp trong thông báo này. */
  count: z.int().positive(),
});
export type MessageNotificationData = z.infer<typeof MessageNotificationData>;

export const VerificationNotificationData = z.object({
  kind: VerificationRequestKind,
  outcome: z.enum(['approved', 'rejected']),
  credentialTitle: z.string().nullable(),
});
export type VerificationNotificationData = z.infer<typeof VerificationNotificationData>;

/**
 * Thông báo về một lớp (G6): id lớp, môn và tên hiển thị của bên kia (gia sư với phụ huynh và học sinh, phụ huynh với
 * gia sư; null khi hệ thống làm). Không có tên học sinh, nội dung buổi học, điểm hay nhận xét.
 */
const ClassNotificationBase = {
  classId: Id,
  subjectId: z.int(),
  counterpartName: CounterpartName,
};

export const ClassStatusNotificationData = z.object({
  ...ClassNotificationBase,
  status: z.enum(['paused', 'active', 'ended']),
});
export type ClassStatusNotificationData = z.infer<typeof ClassStatusNotificationData>;

export const FeeChangeNotificationData = z.object({
  ...ClassNotificationBase,
  event: z.enum(['proposed', 'accepted', 'rejected', 'withdrawn']),
});
export type FeeChangeNotificationData = z.infer<typeof FeeChangeNotificationData>;

const LessonNotificationBase = {
  ...ClassNotificationBase,
  lessonId: Id,
  startsAt: z.iso.datetime(),
};

export const LessonNotificationData = z.object(LessonNotificationBase);
export type LessonNotificationData = z.infer<typeof LessonNotificationData>;

export const LessonChangedNotificationData = z.object({
  ...LessonNotificationBase,
  change: z.enum(['rescheduled', 'cancelled']),
});
export type LessonChangedNotificationData = z.infer<typeof LessonChangedNotificationData>;

export const LessonToConfirmNotificationData = z.object({
  ...LessonNotificationBase,
  confirmDueAt: z.iso.datetime(),
  /** Nhắc trước hạn (C5) thay vì báo lần đầu. */
  reminder: z.boolean(),
});
export type LessonToConfirmNotificationData = z.infer<typeof LessonToConfirmNotificationData>;

export const LessonDisputeNotificationData = z.object({
  ...LessonNotificationBase,
  event: z.enum(['opened', 'settled', 'withdrawn', 'escalated', 'resolved']),
});
export type LessonDisputeNotificationData = z.infer<typeof LessonDisputeNotificationData>;

export const AssessmentNotificationData = z.object({
  ...ClassNotificationBase,
  assessmentId: Id,
});
export type AssessmentNotificationData = z.infer<typeof AssessmentNotificationData>;

const base = {
  id: Id,
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  /** Lần cập nhật cuối (thông báo tin nhắn gộp thêm tin); danh sách sắp theo trường này. */
  updatedAt: z.iso.datetime(),
};

export const Notification = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('connection_received'), data: ConnectionNotificationData }),
  z.object({ ...base, type: z.literal('connection_accepted'), data: ConnectionNotificationData }),
  z.object({ ...base, type: z.literal('connection_rejected'), data: ConnectionNotificationData }),
  z.object({ ...base, type: z.literal('connection_expiring'), data: ConnectionExpiringData }),
  z.object({ ...base, type: z.literal('connection_confirmed'), data: ConnectionNotificationData }),
  z.object({ ...base, type: z.literal('message_new'), data: MessageNotificationData }),
  z.object({ ...base, type: z.literal('verification_result'), data: VerificationNotificationData }),
  z.object({ ...base, type: z.literal('class_status'), data: ClassStatusNotificationData }),
  z.object({ ...base, type: z.literal('fee_change'), data: FeeChangeNotificationData }),
  z.object({ ...base, type: z.literal('lesson_upcoming'), data: LessonNotificationData }),
  z.object({ ...base, type: z.literal('lesson_changed'), data: LessonChangedNotificationData }),
  z.object({ ...base, type: z.literal('attendance_reminder'), data: LessonNotificationData }),
  z.object({
    ...base,
    type: z.literal('lesson_to_confirm'),
    data: LessonToConfirmNotificationData,
  }),
  z.object({ ...base, type: z.literal('lesson_dispute'), data: LessonDisputeNotificationData }),
  z.object({ ...base, type: z.literal('assessment_new'), data: AssessmentNotificationData }),
]);
export type Notification = z.infer<typeof Notification>;

/** Dữ liệu của một loại thông báo. */
export type NotificationData<T extends NotificationType> = Extract<
  Notification,
  { type: T }
>['data'];

/** Loại và dữ liệu của một thông báo (khi tạo, hoặc dựng nội dung). */
export type NotificationContent = {
  [T in NotificationType]: { type: T; data: NotificationData<T> };
}[NotificationType];

export const NotificationList = paginated(Notification);
export type NotificationList = z.infer<typeof NotificationList>;

export const NotificationListQuery = PaginationQuery.extend({
  pageSize: z.coerce.number().int().min(1).max(NOTIFICATION_LIMITS.pageSizeMax).default(20),
  /** Chỉ thông báo chưa đọc. */
  unread: z.stringbool().optional(),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuery>;

export const NotificationIdParams = z.object({ notificationId: Id });
export type NotificationIdParams = z.infer<typeof NotificationIdParams>;

/** Số thông báo chưa đọc (tối đa `NOTIFICATION_LIMITS.unreadCap`). */
export const NotificationUnread = z.object({ count: z.int().nonnegative() });
export type NotificationUnread = z.infer<typeof NotificationUnread>;

/** Trang đích của một thông báo trên web (cũng là liên kết trong email). */
export function notificationHref(notification: NotificationContent): string {
  switch (notification.type) {
    case 'message_new':
      return `/app/messages/${notification.data.conversationId}`;
    case 'verification_result':
      return '/app/profile';
    case 'class_status':
    case 'fee_change':
    case 'assessment_new':
      return `/app/classes/${notification.data.classId}`;
    case 'lesson_upcoming':
    case 'lesson_changed':
    case 'attendance_reminder':
    case 'lesson_to_confirm':
    case 'lesson_dispute':
      return `/app/classes/${notification.data.classId}/lessons/${notification.data.lessonId}`;
    default:
      return `/app/connections/${notification.data.requestId}`;
  }
}

// ---- Tùy chọn -----------------------------------------------------------------------------------

export const NotificationPreference = z.object({
  type: NotificationType,
  inApp: z.boolean(),
  /** null: loại này không có tùy chọn email. */
  email: z.boolean().nullable(),
});
export type NotificationPreference = z.infer<typeof NotificationPreference>;

export const NotificationPreferences = z.object({ items: z.array(NotificationPreference) });
export type NotificationPreferences = z.infer<typeof NotificationPreferences>;

/** Đổi tùy chọn của một số loại; loại không gửi giữ nguyên. `email` bị bỏ qua với loại không có tùy chọn email. */
export const UpdateNotificationPreferences = z.object({
  items: z
    .array(
      z.object({
        type: NotificationType,
        inApp: z.boolean().optional(),
        email: z.boolean().optional(),
      }),
    )
    .max(NotificationType.options.length, { error: 'too_many' }),
});
export type UpdateNotificationPreferences = z.infer<typeof UpdateNotificationPreferences>;
