// Nhắn tin (G5 đợt 2, §5.4). Hội thoại mở khi bên nhận chấp nhận yêu cầu kết nối (D14, connections.service), chỉ
// gia sư và phụ huynh (C7). Gửi được khi yêu cầu đang trao đổi hoặc đã xác nhận hợp tác; yêu cầu đã hủy thì chỉ còn
// xem (D32). Người không tham gia hội thoại: 404. Sự kiện realtime đẩy sau khi transaction commit. Không phụ thuộc
// Express.
//
// Chưa làm ở đợt này: thông báo và email tin nhắn mới, báo cáo tin nhắn, chặn từ giao diện (đợt 3).
import {
  type AttachmentUrl,
  type ConversationList,
  type ConversationListQuery,
  type ConversationParticipantRole,
  type ConversationReadEvent,
  type ConversationSummary,
  MESSAGING_LIMITS,
  type Message,
  type MessageDeletedEvent,
  type MessageListQuery,
  type MessageNewEvent,
  type MessagePage,
  publicSlug,
  REALTIME_EVENTS,
  type SendMessageInput,
  type UnreadSummary,
  type UserStatus,
} from '@tps/shared';
import type { DataSource } from 'typeorm';
import { AppError, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import type { Storage } from '../../lib/storage.js';
import type { RealtimePublisher } from '../../realtime/realtime.js';
import type { FilesService } from '../files/files.service.js';
import {
  type ConversationContext,
  type ConversationRow,
  createMessagingRepository,
  type MessageRecord,
} from './messaging.repository.js';

/** Người đang thao tác (từ `req.auth`). */
export interface MessagingActor {
  userId: string;
  status: UserStatus;
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

/** Yêu cầu kết nối ở các trạng thái này thì hội thoại còn gửi được tin (D32: đã hủy thì chỉ xem). */
const canSendForStatus = (status: ConversationContext['requestStatus']) =>
  status === 'negotiating' || status === 'confirmed';

const conversationClosed = () =>
  new AppError('conversation_closed', 'The conversation is read-only');

const fileNotUploaded = () =>
  new AppError('validation_failed', 'File is not uploaded', [
    { path: 'fileIds', code: 'file_not_uploaded', message: 'File is not uploaded' },
  ]);

/** Một tệp đã gắn vào tin khác (`message_attachments_file_uq`). */
function isAttachedElsewhere(error: unknown): boolean {
  const driverError = (error as { driverError?: { code?: string; constraint?: string } })
    .driverError;
  return driverError?.code === '23505' && driverError.constraint === 'message_attachments_file_uq';
}

export function createMessagingService(deps: {
  dataSource: DataSource;
  files: Pick<FilesService, 'claimUploaded'>;
  storage: Pick<Storage, 'createDownloadUrl'>;
  realtime: RealtimePublisher;
  logger: Logger;
  /** URL công khai của tệp ở bucket public (ảnh đại diện). */
  publicFileUrl: (storageKey: string) => string;
}) {
  const { dataSource, realtime, logger } = deps;

  function toMessage(
    record: MessageRecord,
    viewerId: string,
    roles: Map<string, ConversationParticipantRole>,
  ): Message {
    const deleted = record.deletedAt !== null;
    return {
      id: record.id,
      conversationId: record.conversationId,
      kind: record.kind,
      senderRole: record.senderId === null ? null : (roles.get(record.senderId) ?? null),
      isMine: record.senderId === viewerId,
      body: deleted ? null : record.body,
      attachments: deleted
        ? []
        : record.attachments.map((a) => ({ ...a, sizeBytes: Number(a.sizeBytes) })),
      createdAt: record.createdAt.toISOString(),
      deletedAt: iso(record.deletedAt),
    };
  }

  const rolesOf = (viewerId: string, ctx: ConversationContext) =>
    new Map<string, ConversationParticipantRole>([
      [viewerId, ctx.myRole],
      [ctx.otherUserId, ctx.otherRole],
    ]);

  function toSummary(row: ConversationRow, viewer: MessagingActor): ConversationSummary {
    return {
      id: row.id,
      kind: row.kind,
      connectionRequestId: row.connectionRequestId,
      requestStatus: row.requestStatus,
      canSend: canSendForStatus(row.requestStatus) && viewer.status === 'active' && !row.blocked,
      myRole: row.myRole,
      counterpart: {
        role: row.otherRole,
        displayName: row.otherName,
        avatarUrl: row.otherAvatarKey ? deps.publicFileUrl(row.otherAvatarKey) : null,
        tutorSlug: row.otherPublicCode ? publicSlug(row.otherName, row.otherPublicCode) : null,
      },
      subjectId: row.subjectId,
      learner:
        row.learnerId && row.learnerName !== null
          ? { id: row.learnerId, name: row.learnerName }
          : null,
      lastMessage: row.lastMessage
        ? {
            id: row.lastMessage.id,
            kind: row.lastMessage.kind,
            isMine: row.lastMessage.senderId === viewer.userId,
            preview: row.lastMessage.body,
            hasAttachments: row.lastMessage.hasAttachments,
            deleted: row.lastMessage.deleted,
            createdAt: row.lastMessage.createdAt.toISOString(),
          }
        : null,
      unreadCount: row.unreadCount,
      myLastReadMessageId: row.myLastReadMessageId,
      counterpartLastReadMessageId: row.otherLastReadMessageId,
      lastMessageAt: iso(row.lastMessageAt),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Hội thoại U đang tham gia; không phải: 404 (không nói hội thoại có tồn tại hay không). */
  async function contextFor(userId: string, conversationId: string): Promise<ConversationContext> {
    const ctx = await createMessagingRepository(dataSource.manager).findForParticipant(
      conversationId,
      userId,
    );
    if (!ctx) throw notFound('Conversation');
    return ctx;
  }

  return {
    async list(viewer: MessagingActor, query: ConversationListQuery): Promise<ConversationList> {
      const { rows, total } = await createMessagingRepository(dataSource.manager).list(
        viewer.userId,
        query.page,
        query.pageSize,
      );
      return {
        items: rows.map((row) => toSummary(row, viewer)),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    },

    async get(viewer: MessagingActor, conversationId: string): Promise<ConversationSummary> {
      const { rows } = await createMessagingRepository(dataSource.manager).list(
        viewer.userId,
        1,
        1,
        conversationId,
      );
      const row = rows[0];
      if (!row) throw notFound('Conversation');
      return toSummary(row, viewer);
    },

    async unread(userId: string): Promise<UnreadSummary> {
      return {
        conversations: await createMessagingRepository(dataSource.manager).countUnreadConversations(
          userId,
        ),
      };
    },

    async messages(
      userId: string,
      conversationId: string,
      query: MessageListQuery,
    ): Promise<MessagePage> {
      const ctx = await contextFor(userId, conversationId);
      const page = await createMessagingRepository(dataSource.manager).messages(
        ctx.id,
        { before: query.before, after: query.after },
        query.limit,
      );
      const roles = rolesOf(userId, ctx);
      return { items: page.items.map((m) => toMessage(m, userId, roles)), hasMore: page.hasMore };
    },

    /**
     * Gửi tin (chữ và/hoặc tệp đã tải lên với `purpose: message_attachment`). Trong một transaction: khóa chia sẻ
     * yêu cầu kết nối và kiểm tra còn gửi được, không chặn nhau, nhận tệp, ghi tin, cập nhật hoạt động của hội
     * thoại và đánh dấu người gửi đã đọc tin của mình. Sau commit: đẩy `message:new` cho cả hai bên.
     */
    async send(
      actor: MessagingActor,
      conversationId: string,
      input: SendMessageInput,
    ): Promise<Message> {
      if (actor.status !== 'active') {
        throw new AppError('account_restricted', 'Account is restricted');
      }
      let ctx: ConversationContext | undefined;
      let record: MessageRecord | undefined;
      try {
        await dataSource.transaction(async (manager) => {
          const repo = createMessagingRepository(manager);
          ctx = (await repo.findForParticipant(conversationId, actor.userId)) ?? undefined;
          if (!ctx) throw notFound('Conversation');
          const status = ctx.connectionRequestId
            ? await repo.lockRequestStatus(ctx.connectionRequestId)
            : null;
          if (!canSendForStatus(status)) throw conversationClosed();
          if (await repo.isBlocked(actor.userId, ctx.otherUserId)) throw conversationClosed();

          const files = [];
          for (const fileId of input.fileIds) {
            // claimUploaded báo lỗi ở trường `fileId`; trong tin nhắn trường là `fileIds`.
            const file = await deps.files
              .claimUploaded(manager, actor.userId, fileId, 'message_attachment')
              .catch((error: unknown) => {
                throw error instanceof AppError && error.code === 'validation_failed'
                  ? fileNotUploaded()
                  : error;
              });
            files.push(file);
          }
          const created = await repo.insertMessage({
            conversationId: ctx.id,
            senderId: actor.userId,
            kind: files.length > 0 ? 'attachment' : 'text',
            body: input.body,
          });
          await repo.attachFiles(
            created.id,
            files.map((f) => f.id),
          );
          await repo.touch(ctx.id, created.createdAt);
          await repo.markRead(ctx.id, actor.userId, created.id);
          record = {
            id: created.id,
            conversationId: ctx.id,
            senderId: actor.userId,
            kind: files.length > 0 ? 'attachment' : 'text',
            body: input.body,
            createdAt: created.createdAt,
            deletedAt: null,
            attachments: files.map((f) => ({
              fileId: f.id,
              fileName: f.originalName,
              mimeType: f.mimeType,
              sizeBytes: Number(f.sizeBytes),
            })),
          };
        });
      } catch (error) {
        if (isAttachedElsewhere(error)) throw fileNotUploaded();
        throw error;
      }
      const context = ctx!;
      const saved = record!;
      const roles = rolesOf(actor.userId, context);
      for (const userId of [actor.userId, context.otherUserId]) {
        const event: MessageNewEvent = {
          conversationId: context.id,
          message: toMessage(saved, userId, roles),
        };
        realtime.emitToUser(userId, REALTIME_EVENTS.messageNew, event);
      }
      logger.info(
        { userId: actor.userId, conversationId: context.id, messageId: saved.id },
        'Message sent',
      );
      return toMessage(saved, actor.userId, roles);
    },

    /** Đánh dấu đã đọc đến một tin của hội thoại (chỉ tiến). Đọc được cả khi hội thoại chỉ còn xem. */
    async markRead(userId: string, conversationId: string, messageId: string): Promise<void> {
      const ctx = await contextFor(userId, conversationId);
      const repo = createMessagingRepository(dataSource.manager);
      if (!(await repo.messageExists(ctx.id, messageId))) throw notFound('Message');
      if (!(await repo.markRead(ctx.id, userId, messageId))) return;
      for (const target of [userId, ctx.otherUserId]) {
        const event: ConversationReadEvent = {
          conversationId: ctx.id,
          readerRole: ctx.myRole,
          isMine: target === userId,
          lastReadMessageId: messageId,
        };
        realtime.emitToUser(target, REALTIME_EVENTS.conversationRead, event);
      }
    },

    /**
     * Xóa tin của chính mình (xóa mềm: hai bên thấy "tin đã xóa"; nội dung giữ lại cho xử lý báo cáo vi phạm, G8).
     * Tin của người khác hoặc không có: 404.
     */
    async deleteMessage(userId: string, conversationId: string, messageId: string): Promise<void> {
      const ctx = await contextFor(userId, conversationId);
      const deleted = await createMessagingRepository(dataSource.manager).softDeleteOwn(
        ctx.id,
        messageId,
        userId,
      );
      if (!deleted) throw notFound('Message');
      const event: MessageDeletedEvent = { conversationId: ctx.id, messageId };
      for (const target of [userId, ctx.otherUserId]) {
        realtime.emitToUser(target, REALTIME_EVENTS.messageDeleted, event);
      }
      logger.info({ userId, conversationId: ctx.id, messageId }, 'Message deleted');
    },

    /** URL tạm (5 phút) để xem tệp đính kèm của một tin chưa xóa trong hội thoại. */
    async attachmentUrl(
      userId: string,
      conversationId: string,
      fileId: string,
    ): Promise<AttachmentUrl> {
      const ctx = await contextFor(userId, conversationId);
      const file = await createMessagingRepository(dataSource.manager).attachmentFile(
        ctx.id,
        fileId,
      );
      if (!file) throw notFound('Attachment');
      // Không đặt Content-Disposition tải về: ảnh và PDF mở thẳng trong trình duyệt.
      const url = await deps.storage.createDownloadUrl(file.bucket, file.storageKey, {
        expiresInSeconds: MESSAGING_LIMITS.attachmentUrlSeconds,
      });
      return {
        url,
        fileName: file.originalName,
        mimeType: file.mimeType,
        expiresAt: new Date(
          Date.now() + MESSAGING_LIMITS.attachmentUrlSeconds * 1000,
        ).toISOString(),
      };
    },
  };
}

export type MessagingService = ReturnType<typeof createMessagingService>;
