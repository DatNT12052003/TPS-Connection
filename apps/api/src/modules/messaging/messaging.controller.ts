import type {
  AttachmentParams,
  ConversationIdParams,
  ConversationListQuery,
  MarkReadRequest,
  MessageIdParams,
  MessageListQuery,
  SendMessageInput,
} from '@tps/shared';
import type { RequestHandler } from 'express';
import type { AuthContext } from '../../http/authenticate.js';
import { requireAuth } from '../../http/authorize.js';
import type { MessagingActor, MessagingService } from './messaging.service.js';

const actorOf = (req: { auth?: AuthContext | undefined }): MessagingActor => {
  const { user } = requireAuth(req);
  return { userId: user.id, status: user.status };
};

/** HTTP cho hội thoại và tin nhắn (`/conversations`). */
export function createMessagingController(service: MessagingService) {
  const list: RequestHandler = async (req, res) => {
    res.json(await service.list(actorOf(req), req.query as unknown as ConversationListQuery));
  };

  const unread: RequestHandler = async (req, res) => {
    res.json(await service.unread(requireAuth(req).user.id));
  };

  const get: RequestHandler<ConversationIdParams> = async (req, res) => {
    res.json(await service.get(actorOf(req), req.params.conversationId));
  };

  const messages: RequestHandler<ConversationIdParams> = async (req, res) => {
    res.json(
      await service.messages(
        requireAuth(req).user.id,
        req.params.conversationId,
        req.query as unknown as MessageListQuery,
      ),
    );
  };

  const send: RequestHandler<ConversationIdParams, unknown, SendMessageInput> = async (
    req,
    res,
  ) => {
    res.status(201).json(await service.send(actorOf(req), req.params.conversationId, req.body));
  };

  const markRead: RequestHandler<ConversationIdParams, unknown, MarkReadRequest> = async (
    req,
    res,
  ) => {
    await service.markRead(requireAuth(req).user.id, req.params.conversationId, req.body.messageId);
    res.status(204).end();
  };

  const deleteMessage: RequestHandler<MessageIdParams> = async (req, res) => {
    await service.deleteMessage(
      requireAuth(req).user.id,
      req.params.conversationId,
      req.params.messageId,
    );
    res.status(204).end();
  };

  const attachmentUrl: RequestHandler<AttachmentParams> = async (req, res) => {
    res.json(
      await service.attachmentUrl(
        requireAuth(req).user.id,
        req.params.conversationId,
        req.params.fileId,
      ),
    );
  };

  return { list, unread, get, messages, send, markRead, deleteMessage, attachmentUrl };
}

export type MessagingController = ReturnType<typeof createMessagingController>;
