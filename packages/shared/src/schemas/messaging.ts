// Nhắn tin (G5 đợt 2, §5.4; docs/thiet_ke_co_so_du_lieu.md mục 6.5).
// - Hội thoại `connection` mở khi bên nhận chấp nhận yêu cầu kết nối (D14). Bản đầu chỉ gia sư và phụ huynh (C7).
// - Gửi được khi yêu cầu đang trao đổi hoặc đã xác nhận hợp tác; yêu cầu đã hủy thì chỉ còn xem (D32, 409
//   `conversation_closed`). Tài khoản bị hạn chế không gửi tin mới (B.9.3).
// - Gửi tin bằng REST; Socket.IO chỉ đẩy sự kiện (`REALTIME_EVENTS`) tới phòng của từng người dùng.
// - Tin nhắn không chứa id người dùng: client biết tin của mình qua `isMine`, bên kia qua `senderRole`.
import { z } from 'zod';
import {
  ConnectionRequestStatus,
  ConversationKind,
  ConversationParticipantRole,
  MessageKind,
} from '../statuses.js';
import { Id, PaginationQuery, paginated } from './common.js';

export const MESSAGING_LIMITS = {
  bodyLength: 4000,
  attachmentsPerMessage: 5,
  pageSizeDefault: 30,
  pageSizeMax: 100,
  /** Số tin một tài khoản gửi trong một phút (mọi hội thoại). */
  sendPerMinute: 30,
  /** Độ dài đoạn trích tin cuối trong danh sách hội thoại. */
  previewLength: 140,
  /** Đếm tin chưa đọc tối đa đến số này (giao diện hiện "99+"). */
  unreadCap: 99,
  /** Hạn của URL xem tệp đính kèm. */
  attachmentUrlSeconds: 300,
} as const;

export const ConversationIdParams = z.object({ conversationId: Id });
export type ConversationIdParams = z.infer<typeof ConversationIdParams>;

export const MessageIdParams = z.object({ conversationId: Id, messageId: Id });
export type MessageIdParams = z.infer<typeof MessageIdParams>;

export const AttachmentParams = z.object({ conversationId: Id, fileId: Id });
export type AttachmentParams = z.infer<typeof AttachmentParams>;

/** Danh sách hội thoại của tôi, hoạt động gần nhất trước. */
export const ConversationListQuery = PaginationQuery;
export type ConversationListQuery = z.infer<typeof ConversationListQuery>;

/**
 * Trang tin nhắn theo khóa (id là UUIDv7, tăng theo thời gian). Không có `before`/`after`: các tin mới nhất.
 * `before`: tin cũ hơn tin đó (cuộn lên). `after`: tin mới hơn tin đó (bắt kịp sau khi mất kết nối).
 */
export const MessageListQuery = z
  .object({
    before: Id.optional(),
    after: Id.optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MESSAGING_LIMITS.pageSizeMax)
      .default(MESSAGING_LIMITS.pageSizeDefault),
  })
  .refine((q) => !(q.before && q.after), { path: ['after'], error: 'invalid' });
export type MessageListQuery = z.infer<typeof MessageListQuery>;

/** Gửi tin: chữ, tệp đính kèm (đã tải lên với `purpose: message_attachment`), hoặc cả hai. */
export const SendMessageRequest = z
  .object({
    body: z
      .string()
      .trim()
      .max(MESSAGING_LIMITS.bodyLength, { error: 'too_long' })
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
    fileIds: z
      .array(Id)
      .max(MESSAGING_LIMITS.attachmentsPerMessage, { error: 'too_many' })
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, { error: 'invalid' }),
  })
  .refine((m) => m.body !== null || m.fileIds.length > 0, { path: ['body'], error: 'required' });
export type SendMessageRequest = z.input<typeof SendMessageRequest>;
export type SendMessageInput = z.output<typeof SendMessageRequest>;

/** Đánh dấu đã đọc đến tin `messageId` (chỉ tiến, không lùi). */
export const MarkReadRequest = z.object({ messageId: Id });
export type MarkReadRequest = z.infer<typeof MarkReadRequest>;

// ---- Response ---------------------------------------------------------------------------------

export const MessageAttachment = z.object({
  fileId: Id,
  fileName: z.string().nullable(),
  mimeType: z.string(),
  sizeBytes: z.int().nonnegative(),
});
export type MessageAttachment = z.infer<typeof MessageAttachment>;

/** Một tin nhắn. Tin đã xóa: `body` null, không có tệp, có `deletedAt`. */
export const Message = z.object({
  id: Id,
  conversationId: Id,
  kind: MessageKind,
  /** Vai trò người gửi trong hội thoại; null với tin hệ thống. */
  senderRole: ConversationParticipantRole.nullable(),
  isMine: z.boolean(),
  body: z.string().nullable(),
  attachments: z.array(MessageAttachment),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});
export type Message = z.infer<typeof Message>;

/** Tin theo thứ tự thời gian (cũ trước). `hasMore`: còn tin theo chiều đang tải. */
export const MessagePage = z.object({
  items: z.array(Message),
  hasMore: z.boolean(),
});
export type MessagePage = z.infer<typeof MessagePage>;

/** Bên kia trong hội thoại, ở dạng hiển thị (không email, số điện thoại, họ tên thật). */
export const ConversationCounterpart = z.object({
  role: ConversationParticipantRole,
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  /** Đường dẫn hồ sơ `/tutors/<slug>` khi bên kia là gia sư. */
  tutorSlug: z.string().nullable(),
});
export type ConversationCounterpart = z.infer<typeof ConversationCounterpart>;

export const ConversationLastMessage = z.object({
  id: Id,
  kind: MessageKind,
  isMine: z.boolean(),
  /** Đoạn đầu nội dung; null nếu tin chỉ có tệp hoặc đã xóa. */
  preview: z.string().nullable(),
  hasAttachments: z.boolean(),
  deleted: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type ConversationLastMessage = z.infer<typeof ConversationLastMessage>;

export const ConversationSummary = z.object({
  id: Id,
  kind: ConversationKind,
  connectionRequestId: Id.nullable(),
  /** Trạng thái yêu cầu kết nối của hội thoại. */
  requestStatus: ConnectionRequestStatus.nullable(),
  /** Người xem còn gửi được tin (yêu cầu chưa kết thúc, tài khoản đang hoạt động, không chặn nhau). */
  canSend: z.boolean(),
  myRole: ConversationParticipantRole,
  counterpart: ConversationCounterpart,
  /** Môn của yêu cầu kết nối. */
  subjectId: z.int().nullable(),
  /** Hồ sơ con: chỉ phụ huynh thấy (D16). */
  learner: z.object({ id: Id, name: z.string() }).nullable(),
  lastMessage: ConversationLastMessage.nullable(),
  /** Số tin của bên kia chưa đọc, tối đa `MESSAGING_LIMITS.unreadCap`. */
  unreadCount: z.int().nonnegative(),
  myLastReadMessageId: Id.nullable(),
  /** Bên kia đã đọc đến tin này (hiện "Đã xem"). */
  counterpartLastReadMessageId: Id.nullable(),
  lastMessageAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type ConversationSummary = z.infer<typeof ConversationSummary>;

export const ConversationList = paginated(ConversationSummary);
export type ConversationList = z.infer<typeof ConversationList>;

/** Số hội thoại có tin chưa đọc (huy hiệu trên thanh điều hướng). */
export const UnreadSummary = z.object({ conversations: z.int().nonnegative() });
export type UnreadSummary = z.infer<typeof UnreadSummary>;

/** URL tạm để xem hoặc tải tệp đính kèm (bucket riêng tư). */
export const AttachmentUrl = z.object({
  url: z.url(),
  fileName: z.string().nullable(),
  mimeType: z.string(),
  expiresAt: z.iso.datetime(),
});
export type AttachmentUrl = z.infer<typeof AttachmentUrl>;

// ---- Realtime (Socket.IO) ---------------------------------------------------------------------

/**
 * Sự kiện server đẩy tới phòng của từng người dùng. Client không gửi sự kiện nào; mọi thao tác đi qua REST.
 * Kết nối: `io(<API_URL>, { withCredentials: true })` (cookie `tps_at`) hoặc `auth: { token }` (mobile). Server
 * ngắt kết nối khi access token hết hạn; client làm mới token rồi kết nối lại và tải tin `after` tin cuối.
 */
export const REALTIME_EVENTS = {
  messageNew: 'message:new',
  messageDeleted: 'message:deleted',
  conversationRead: 'conversation:read',
  conversationOpened: 'conversation:opened',
} as const;

export const MessageNewEvent = z.object({ conversationId: Id, message: Message });
export type MessageNewEvent = z.infer<typeof MessageNewEvent>;

export const MessageDeletedEvent = z.object({ conversationId: Id, messageId: Id });
export type MessageDeletedEvent = z.infer<typeof MessageDeletedEvent>;

/** Một bên đã đọc đến `lastReadMessageId`. */
export const ConversationReadEvent = z.object({
  conversationId: Id,
  readerRole: ConversationParticipantRole,
  isMine: z.boolean(),
  lastReadMessageId: Id,
});
export type ConversationReadEvent = z.infer<typeof ConversationReadEvent>;

/** Hội thoại mới mở (yêu cầu kết nối vừa được chấp nhận). */
export const ConversationOpenedEvent = z.object({
  conversationId: Id,
  connectionRequestId: Id,
});
export type ConversationOpenedEvent = z.infer<typeof ConversationOpenedEvent>;
