import {
  AttachmentParams,
  ConversationIdParams,
  ConversationListQuery,
  MarkReadRequest,
  MESSAGING_LIMITS,
  MessageIdParams,
  MessageListQuery,
  SendMessageRequest,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireActiveAccount, requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import { type RateLimiter, rateLimitByUser } from '../../lib/rate-limiter.js';
import type { MessagingController } from './messaging.controller.js';

/**
 * /api/v1/conversations: hội thoại mà người đang đăng nhập tham gia (bản đầu: gia sư và phụ huynh, C7). Hội thoại
 * của người khác: 404.
 *
 *   GET    /                                          200  danh sách, hoạt động gần nhất trước (?page=&pageSize=)
 *   GET    /unread                                    200  số hội thoại có tin chưa đọc
 *   GET    /:conversationId                           200  một hội thoại
 *   GET    /:conversationId/messages                  200  tin nhắn (?before=|after=<messageId>&limit=)
 *   POST   /:conversationId/messages                  201  gửi tin `{ body?, fileIds? }`; chỉ xem: 409
 *                                                          conversation_closed
 *   POST   /:conversationId/read                      204  đã đọc đến `{ messageId }`
 *   DELETE /:conversationId/messages/:messageId       204  xóa tin của mình
 *   GET    /:conversationId/attachments/:fileId       200  URL tạm xem tệp đính kèm
 *
 * Gửi tin cần tài khoản đang hoạt động (B.9.3) và bị giới hạn theo tài khoản: 429 `rate_limited`. Sự kiện realtime:
 * src/realtime/realtime.ts.
 */
export function messagingRouter(
  controller: MessagingController,
  limiter: RateLimiter,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate, requireRole('tutor', 'parent'));
  const params = { params: ConversationIdParams };
  router.get('/', validate({ query: ConversationListQuery }), controller.list);
  router.get('/unread', controller.unread);
  router.get('/:conversationId', validate(params), controller.get);
  router.get(
    '/:conversationId/messages',
    validate({ ...params, query: MessageListQuery }),
    controller.messages,
  );
  router.post(
    '/:conversationId/messages',
    requireActiveAccount(),
    rateLimitByUser(limiter, {
      name: 'message-send',
      limit: MESSAGING_LIMITS.sendPerMinute,
      windowSeconds: 60,
    }),
    validate({ ...params, body: SendMessageRequest }),
    controller.send,
  );
  router.post(
    '/:conversationId/read',
    validate({ ...params, body: MarkReadRequest }),
    controller.markRead,
  );
  router.delete(
    '/:conversationId/messages/:messageId',
    validate({ params: MessageIdParams }),
    controller.deleteMessage,
  );
  router.get(
    '/:conversationId/attachments/:fileId',
    validate({ params: AttachmentParams }),
    controller.attachmentUrl,
  );
  return router;
}
