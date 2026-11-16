// Chặn và báo cáo (G5 đợt 3, §5.4, §13).
// - Chặn: theo gia sư (id công khai) hoặc theo hội thoại (bên kia). Hai người chặn nhau thì không gửi yêu cầu kết nối
//   hay tin nhắn cho nhau; các yêu cầu đang mở giữa hai người bị hủy.
// - Báo cáo: tài khoản (gia sư, hoặc bên kia của một hội thoại), bài tuyển, bài tìm gia sư, tin nhắn. Mỗi người chỉ
//   một báo cáo đang mở cho mỗi đối tượng (báo lại: bỏ qua). Manager xử lý ở G8.
import { z } from 'zod';
import { ReportReason } from '../statuses.js';
import { Id, optionalText } from './common.js';

export const SAFETY_LIMITS = {
  reportDescriptionLength: 1000,
  reportsPerHour: 10,
  blocksPerHour: 30,
} as const;

/** Người bị chặn: gia sư (`tutorId`) hoặc bên kia của hội thoại (`conversationId`). Đúng một trường. */
export const CreateBlockRequest = z
  .object({ tutorId: Id.optional(), conversationId: Id.optional() })
  .refine((v) => (v.tutorId === undefined) !== (v.conversationId === undefined), {
    path: ['tutorId'],
    error: 'required',
  });
export type CreateBlockRequest = z.infer<typeof CreateBlockRequest>;

export const BlockedUserParams = z.object({ userId: Id });
export type BlockedUserParams = z.infer<typeof BlockedUserParams>;

export const BlockedUser = z.object({
  userId: Id,
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  blockedAt: z.iso.datetime(),
});
export type BlockedUser = z.infer<typeof BlockedUser>;

export const BlockList = z.object({ items: z.array(BlockedUser) });
export type BlockList = z.infer<typeof BlockList>;

const reportFields = {
  reasonCode: ReportReason,
  description: optionalText(SAFETY_LIMITS.reportDescriptionLength),
};

export const CreateReportRequest = z.discriminatedUnion('targetType', [
  z.object({ targetType: z.literal('tutor'), tutorId: Id, ...reportFields }),
  /** Bên kia của một hội thoại. */
  z.object({ targetType: z.literal('conversation_user'), conversationId: Id, ...reportFields }),
  z.object({ targetType: z.literal('tutor_post'), tutorPostId: Id, ...reportFields }),
  z.object({ targetType: z.literal('request_post'), requestPostId: Id, ...reportFields }),
  z.object({
    targetType: z.literal('message'),
    conversationId: Id,
    messageId: Id,
    ...reportFields,
  }),
]);
export type CreateReportRequest = z.infer<typeof CreateReportRequest>;

/** Báo cáo đã được ghi nhận (kể cả khi đã có báo cáo đang mở cho cùng đối tượng). */
export const ReportReceived = z.object({ status: z.literal('received') });
export type ReportReceived = z.infer<typeof ReportReceived>;
