// Chặn và báo cáo (G5 đợt 3, §5.4, §13). Không phụ thuộc Express.
// - Chặn: người bị chặn xác định qua gia sư (id công khai) hoặc hội thoại (bên kia). Trong cùng transaction hủy các
//   yêu cầu kết nối đang mở giữa hai người. Từ đó hai người không gửi yêu cầu hay tin nhắn cho nhau (kiểm tra ở
//   connections và messaging, theo cả hai chiều).
// - Báo cáo: người báo cáo phải thấy được đối tượng (không thì 404, như không tồn tại); không báo cáo chính mình.
//   Báo cáo trùng (còn mở) bị bỏ qua nhưng vẫn trả "đã nhận". Manager xử lý ở G8.
import type {
  BlockList,
  CreateBlockRequest,
  CreateReportRequest,
  ReportReceived,
} from '@tps/shared';
import type { DataSource } from 'typeorm';
import { notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import { createConnectionsRepository } from '../connections/connections.repository.js';
import { createMessagingRepository } from '../messaging/messaging.repository.js';
import { createRequestPostsRepository } from '../request-posts/request-posts.repository.js';
import { createSafetyRepository, type ReportTarget } from './safety.repository.js';

export function createSafetyService(deps: {
  dataSource: DataSource;
  logger: Logger;
  publicFileUrl: (storageKey: string) => string;
}) {
  const { dataSource, logger } = deps;

  /** Bên kia của một hội thoại mà U tham gia; 404 nếu U không tham gia. */
  async function counterpartOf(userId: string, conversationId: string): Promise<string> {
    const ctx = await createMessagingRepository(dataSource.manager).findForParticipant(
      conversationId,
      userId,
    );
    if (!ctx) throw notFound('Conversation');
    return ctx.otherUserId;
  }

  async function blocks(userId: string): Promise<BlockList> {
    const rows = await createSafetyRepository(dataSource.manager).blocksOf(userId);
    return {
      items: rows.map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        avatarUrl: r.avatarKey ? deps.publicFileUrl(r.avatarKey) : null,
        blockedAt: r.blockedAt.toISOString(),
      })),
    };
  }

  /** Đối tượng bị báo cáo, sau khi kiểm tra người báo cáo thấy được nó. */
  async function resolveTarget(
    reporterId: string,
    input: CreateReportRequest,
  ): Promise<ReportTarget> {
    const manager = dataSource.manager;
    const repo = createSafetyRepository(manager);
    switch (input.targetType) {
      case 'tutor':
        if (input.tutorId === reporterId || !(await repo.tutorExists(input.tutorId))) {
          throw notFound('Tutor');
        }
        return { reportedUserId: input.tutorId };
      case 'conversation_user':
        return { reportedUserId: await counterpartOf(reporterId, input.conversationId) };
      case 'tutor_post': {
        const author = await repo.tutorPostAuthor(input.tutorPostId);
        if (!author || author === reporterId) throw notFound('Post');
        return { tutorPostId: input.tutorPostId };
      }
      case 'request_post': {
        // Bài tìm gia sư chỉ gia sư đã xác minh thấy (§16.4).
        const posts = createRequestPostsRepository(manager);
        const post = (await posts.isVerifiedTutor(reporterId))
          ? await posts.findVisibleToTutors(input.requestPostId)
          : null;
        if (!post || post.authorUserId === reporterId) throw notFound('Post');
        return { requestPostId: input.requestPostId };
      }
      case 'message': {
        await counterpartOf(reporterId, input.conversationId);
        const sender = await repo.messageSender(input.conversationId, input.messageId);
        if (!sender || sender === reporterId) throw notFound('Message');
        return { messageId: input.messageId };
      }
    }
  }

  return {
    blocks,

    /** Chặn (đã chặn rồi thì giữ nguyên) và hủy các yêu cầu đang mở giữa hai người. */
    async block(userId: string, input: CreateBlockRequest): Promise<BlockList> {
      let blockedId: string;
      if (input.tutorId) {
        const exists = await createSafetyRepository(dataSource.manager).tutorExists(input.tutorId);
        if (!exists || input.tutorId === userId) throw notFound('Tutor');
        blockedId = input.tutorId;
      } else {
        blockedId = await counterpartOf(userId, input.conversationId!);
      }
      const cancelled = await dataSource.transaction(async (manager) => {
        await createSafetyRepository(manager).block(userId, blockedId);
        return createConnectionsRepository(manager).cancelOpenBetween(userId, blockedId);
      });
      logger.info({ userId, blockedId, cancelledRequests: cancelled }, 'User blocked');
      return blocks(userId);
    },

    /** Bỏ chặn; chưa chặn người này: 404. Yêu cầu đã hủy không mở lại. */
    async unblock(userId: string, blockedId: string): Promise<void> {
      const removed = await createSafetyRepository(dataSource.manager).unblock(userId, blockedId);
      if (!removed) throw notFound('Block');
      logger.info({ userId, blockedId }, 'User unblocked');
    },

    async report(reporterId: string, input: CreateReportRequest): Promise<ReportReceived> {
      const target = await resolveTarget(reporterId, input);
      await createSafetyRepository(dataSource.manager).report(
        reporterId,
        target,
        input.reasonCode,
        input.description ?? null,
      );
      logger.info(
        { reporterId, targetType: input.targetType, reasonCode: input.reasonCode },
        'Violation reported',
      );
      return { status: 'received' };
    },
  };
}

export type SafetyService = ReturnType<typeof createSafetyService>;
