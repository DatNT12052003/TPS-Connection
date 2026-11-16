import {
  type ConnectionRequestStatus,
  type ConversationKind,
  type ConversationParticipantRole,
  MESSAGING_LIMITS,
  type MessageKind,
} from '@tps/shared';
import type { EntityManager } from 'typeorm';
import type { StoredFile } from '../files/stored-file.entity.js';

/** Hội thoại nhìn từ một người tham gia: vai trò của hai bên, đã đọc đến đâu, trạng thái yêu cầu kết nối. */
export interface ConversationContext {
  id: string;
  kind: ConversationKind;
  connectionRequestId: string | null;
  requestStatus: ConnectionRequestStatus | null;
  myRole: ConversationParticipantRole;
  myLastReadMessageId: string | null;
  otherUserId: string;
  otherRole: ConversationParticipantRole;
}

/** Cột hiển thị một hội thoại trong danh sách. */
export interface ConversationRow extends ConversationContext {
  otherLastReadMessageId: string | null;
  otherName: string;
  otherAvatarKey: string | null;
  otherPublicCode: string | null;
  subjectId: number | null;
  learnerId: string | null;
  learnerName: string | null;
  lastMessage: {
    id: string;
    kind: MessageKind;
    senderId: string | null;
    body: string | null;
    deleted: boolean;
    hasAttachments: boolean;
    createdAt: Date;
  } | null;
  unreadCount: number;
  blocked: boolean;
  lastMessageAt: Date | null;
  createdAt: Date;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: MessageKind;
  body: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  attachments: { fileId: string; fileName: string | null; mimeType: string; sizeBytes: number }[];
}

interface RawConversation {
  id: string;
  kind: ConversationKind;
  connection_request_id: string | null;
  request_status: ConnectionRequestStatus | null;
  my_role: ConversationParticipantRole;
  my_last_read: string | null;
  other_id: string;
  other_role: ConversationParticipantRole;
}

const toContext = (r: RawConversation): ConversationContext => ({
  id: r.id,
  kind: r.kind,
  connectionRequestId: r.connection_request_id,
  requestStatus: r.request_status,
  myRole: r.my_role,
  myLastReadMessageId: r.my_last_read,
  otherUserId: r.other_id,
  otherRole: r.other_role,
});

/**
 * Hội thoại `c` mà `$1` đang tham gia (`me`), kèm người tham gia còn lại (`other`; bản đầu hai người) và yêu cầu
 * kết nối. Dùng chung cho chi tiết và danh sách.
 */
const CONVERSATION_FROM = `
  FROM conversation_participants me
  JOIN conversations c ON c.id = me.conversation_id
  JOIN LATERAL (
    SELECT o.user_id, o.participant_role, o.last_read_message_id FROM conversation_participants o
     WHERE o.conversation_id = c.id AND o.user_id <> me.user_id
     ORDER BY o.joined_at, o.user_id LIMIT 1
  ) other ON true
  LEFT JOIN connection_requests r ON r.id = c.connection_request_id`;

const MY_CONVERSATIONS = `me.user_id = $1 AND me.left_at IS NULL`;

const CONTEXT_COLUMNS = `
  c.id, c.kind, c.connection_request_id, r.status AS request_status,
  me.participant_role AS my_role, me.last_read_message_id AS my_last_read,
  other.user_id AS other_id, other.participant_role AS other_role`;

/** Tin của người khác (kể cả tin hệ thống) sau tin đã đọc, chưa xóa. Index: `messages_conversation_idx`. */
const UNREAD_CONDITION = `
  m.conversation_id = me.conversation_id AND m.deleted_at IS NULL
  AND m.sender_id IS DISTINCT FROM me.user_id
  AND (me.last_read_message_id IS NULL OR m.id > me.last_read_message_id)`;

/** Truy cập hội thoại và tin nhắn. Không kiểm tra quyền (service làm). */
export function createMessagingRepository(manager: EntityManager) {
  return {
    /**
     * Mở hội thoại cho một yêu cầu kết nối vừa được chấp nhận (D14), hai người tham gia: gia sư và client (C7).
     * Đã có thì giữ nguyên. Trả id hội thoại.
     */
    async openForConnection(input: {
      connectionRequestId: string;
      tutorId: string;
      clientUserId: string;
    }): Promise<string> {
      const [created] = await manager.query<{ id: string }[]>(
        `INSERT INTO conversations (kind, connection_request_id) VALUES ('connection', $1)
         ON CONFLICT (connection_request_id) DO NOTHING
         RETURNING id`,
        [input.connectionRequestId],
      );
      if (!created) {
        const [existing] = await manager.query<{ id: string }[]>(
          `SELECT id FROM conversations WHERE connection_request_id = $1`,
          [input.connectionRequestId],
        );
        return existing!.id;
      }
      await manager.query(
        `INSERT INTO conversation_participants (conversation_id, user_id, participant_role)
         VALUES ($1, $2, 'tutor'), ($1, $3, 'client')`,
        [created.id, input.tutorId, input.clientUserId],
      );
      return created.id;
    },

    /** Hội thoại mà U đang tham gia; null nếu không có hoặc U không tham gia. */
    async findForParticipant(
      conversationId: string,
      userId: string,
    ): Promise<ConversationContext | null> {
      const [row] = await manager.query<RawConversation[]>(
        `SELECT ${CONTEXT_COLUMNS} ${CONVERSATION_FROM} WHERE ${MY_CONVERSATIONS} AND c.id = $2`,
        [userId, conversationId],
      );
      return row ? toContext(row) : null;
    },

    /**
     * Khóa chia sẻ dòng yêu cầu kết nối rồi đọc trạng thái: gửi tin không chen được giữa lúc yêu cầu đang bị hủy
     * (thao tác hủy khóa ghi cùng dòng).
     */
    async lockRequestStatus(requestId: string): Promise<ConnectionRequestStatus | null> {
      const [row] = await manager.query<{ status: ConnectionRequestStatus }[]>(
        `SELECT status FROM connection_requests WHERE id = $1 FOR SHARE`,
        [requestId],
      );
      return row?.status ?? null;
    },

    /** Hai người có chặn nhau (một trong hai chiều) không? */
    async isBlocked(a: string, b: string): Promise<boolean> {
      const rows = await manager.query<unknown[]>(
        `SELECT 1 FROM user_blocks
          WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
          LIMIT 1`,
        [a, b],
      );
      return rows.length > 0;
    },

    /** Hội thoại của U, hoạt động gần nhất trước. */
    async list(
      userId: string,
      page: number,
      pageSize: number,
      onlyId?: string,
    ): Promise<{ rows: ConversationRow[]; total: number }> {
      const rows = await manager.query<
        (RawConversation & {
          other_last_read: string | null;
          other_name: string;
          other_avatar_key: string | null;
          other_public_code: string | null;
          subject_id: number | null;
          learner_id: string | null;
          learner_name: string | null;
          lm_id: string | null;
          lm_kind: MessageKind | null;
          lm_sender: string | null;
          lm_body: string | null;
          lm_deleted: boolean | null;
          lm_has_files: boolean | null;
          lm_created: Date | null;
          unread: number;
          blocked: boolean;
          last_message_at: Date | null;
          created_at: Date;
        })[]
      >(
        `SELECT ${CONTEXT_COLUMNS},
                other.last_read_message_id AS other_last_read,
                ou.display_name AS other_name, f.storage_key AS other_avatar_key,
                tp.public_code AS other_public_code,
                r.subject_id, r.learner_id, coalesce(l.nickname, l.full_name) AS learner_name,
                lm.id AS lm_id, lm.kind AS lm_kind, lm.sender_id AS lm_sender,
                CASE WHEN lm.deleted_at IS NULL THEN left(lm.body, $4) END AS lm_body,
                lm.deleted_at IS NOT NULL AS lm_deleted,
                EXISTS (SELECT 1 FROM message_attachments a WHERE a.message_id = lm.id) AS lm_has_files,
                lm.created_at AS lm_created,
                (SELECT count(*)::int FROM (
                   SELECT 1 FROM messages m WHERE ${UNREAD_CONDITION} LIMIT $5
                 ) u) AS unread,
                EXISTS (
                  SELECT 1 FROM user_blocks b
                   WHERE (b.blocker_id = me.user_id AND b.blocked_id = other.user_id)
                      OR (b.blocker_id = other.user_id AND b.blocked_id = me.user_id)
                ) AS blocked,
                c.last_message_at, c.created_at
           ${CONVERSATION_FROM}
           JOIN users ou ON ou.id = other.user_id
           LEFT JOIN files f ON f.id = ou.avatar_file_id AND f.status = 'ready'
           LEFT JOIN tutor_profiles tp ON tp.user_id = other.user_id AND other.participant_role = 'tutor'
           LEFT JOIN learners l ON l.id = r.learner_id AND me.participant_role = 'client'
           LEFT JOIN LATERAL (
             SELECT id, kind, sender_id, body, deleted_at, created_at FROM messages
              WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1
           ) lm ON true
          WHERE ${MY_CONVERSATIONS} AND ($6::uuid IS NULL OR c.id = $6)
          ORDER BY coalesce(c.last_message_at, c.created_at) DESC, c.id DESC
          LIMIT $2 OFFSET $3`,
        [
          userId,
          pageSize,
          (page - 1) * pageSize,
          MESSAGING_LIMITS.previewLength,
          MESSAGING_LIMITS.unreadCap,
          onlyId ?? null,
        ],
      );
      const [count] = onlyId
        ? [{ n: rows.length }]
        : await manager.query<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM conversation_participants
              WHERE user_id = $1 AND left_at IS NULL`,
            [userId],
          );
      return {
        total: count?.n ?? 0,
        rows: rows.map((r) => ({
          ...toContext(r),
          otherLastReadMessageId: r.other_last_read,
          otherName: r.other_name,
          otherAvatarKey: r.other_avatar_key,
          otherPublicCode: r.other_public_code,
          subjectId: r.subject_id,
          learnerId: r.my_role === 'client' ? r.learner_id : null,
          learnerName: r.my_role === 'client' ? r.learner_name : null,
          lastMessage:
            r.lm_id === null
              ? null
              : {
                  id: r.lm_id,
                  kind: r.lm_kind!,
                  senderId: r.lm_sender,
                  body: r.lm_body,
                  deleted: r.lm_deleted === true,
                  hasAttachments: r.lm_has_files === true && r.lm_deleted !== true,
                  createdAt: r.lm_created!,
                },
          unreadCount: r.unread,
          blocked: r.blocked,
          lastMessageAt: r.last_message_at,
          createdAt: r.created_at,
        })),
      };
    },

    /** Số hội thoại của U có tin chưa đọc. */
    async countUnreadConversations(userId: string): Promise<number> {
      const [row] = await manager.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM conversation_participants me
          WHERE me.user_id = $1 AND me.left_at IS NULL
            AND EXISTS (SELECT 1 FROM messages m WHERE ${UNREAD_CONDITION})`,
        [userId],
      );
      return row?.n ?? 0;
    },

    /**
     * Một trang tin theo khóa (id UUIDv7). Trả theo thứ tự thời gian (cũ trước) và cờ còn tin theo chiều đang tải.
     * Index: `messages_conversation_idx`.
     */
    async messages(
      conversationId: string,
      cursor: { before?: string | undefined; after?: string | undefined },
      limit: number,
    ): Promise<{ items: MessageRecord[]; hasMore: boolean }> {
      const ascending = cursor.after !== undefined;
      const rows = await manager.query<
        {
          id: string;
          conversation_id: string;
          sender_id: string | null;
          kind: MessageKind;
          body: string | null;
          created_at: Date;
          deleted_at: Date | null;
          attachments: MessageRecord['attachments'];
        }[]
      >(
        `SELECT m.*, coalesce(att.list, '[]'::json) AS attachments
           FROM (
             SELECT id, conversation_id, sender_id, kind, body, created_at, deleted_at FROM messages
              WHERE conversation_id = $1
                AND ($2::uuid IS NULL OR id < $2)
                AND ($3::uuid IS NULL OR id > $3)
              ORDER BY id ${ascending ? 'ASC' : 'DESC'}
              LIMIT $4
           ) m
           LEFT JOIN LATERAL (
             SELECT json_agg(json_build_object(
                      'fileId', f.id, 'fileName', f.original_name,
                      'mimeType', f.mime_type, 'sizeBytes', f.size_bytes
                    ) ORDER BY f.created_at, f.id) AS list
               FROM message_attachments a JOIN files f ON f.id = a.file_id
              WHERE a.message_id = m.id
           ) att ON true
          ORDER BY m.id ${ascending ? 'ASC' : 'DESC'}`,
        [conversationId, cursor.before ?? null, cursor.after ?? null, limit + 1],
      );
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit).map((r): MessageRecord => ({
        id: r.id,
        conversationId: r.conversation_id,
        senderId: r.sender_id,
        kind: r.kind,
        body: r.body,
        createdAt: r.created_at,
        deletedAt: r.deleted_at,
        attachments: r.attachments,
      }));
      return { items: ascending ? page : page.reverse(), hasMore };
    },

    async insertMessage(input: {
      conversationId: string;
      senderId: string;
      kind: MessageKind;
      body: string | null;
    }): Promise<{ id: string; createdAt: Date }> {
      const [row] = await manager.query<{ id: string; created_at: Date }[]>(
        `INSERT INTO messages (conversation_id, sender_id, kind, body) VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [input.conversationId, input.senderId, input.kind, input.body],
      );
      return { id: row!.id, createdAt: row!.created_at };
    },

    async attachFiles(messageId: string, fileIds: string[]): Promise<void> {
      if (fileIds.length === 0) return;
      await manager.query(
        `INSERT INTO message_attachments (message_id, file_id) SELECT $1, unnest($2::uuid[])`,
        [messageId, fileIds],
      );
    },

    /** Có tin mới: cập nhật thời điểm để danh sách hội thoại sắp theo hoạt động. */
    async touch(conversationId: string, at: Date): Promise<void> {
      await manager.query(
        `UPDATE conversations SET last_message_at = $2, updated_at = now() WHERE id = $1`,
        [conversationId, at],
      );
    },

    /** Tin thuộc hội thoại này không? */
    async messageExists(conversationId: string, messageId: string): Promise<boolean> {
      const rows = await manager.query<unknown[]>(
        `SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2`,
        [messageId, conversationId],
      );
      return rows.length > 0;
    },

    // UPDATE bọc trong CTE: `manager.query` trả `[rows, rowCount]` cho UPDATE trần, còn SELECT trả đúng các dòng.

    /** Đánh dấu U đã đọc đến tin này; chỉ tiến, không lùi. Trả true nếu có thay đổi. */
    async markRead(conversationId: string, userId: string, messageId: string): Promise<boolean> {
      const rows = await manager.query<unknown[]>(
        `WITH updated AS (
           UPDATE conversation_participants SET last_read_message_id = $3
            WHERE conversation_id = $1 AND user_id = $2
              AND (last_read_message_id IS NULL OR last_read_message_id < $3)
           RETURNING user_id
         )
         SELECT user_id FROM updated`,
        [conversationId, userId, messageId],
      );
      return rows.length > 0;
    },

    /** Xóa mềm tin của chính U (không xóa được tin hệ thống). Trả false nếu không có tin như vậy. */
    async softDeleteOwn(
      conversationId: string,
      messageId: string,
      userId: string,
    ): Promise<boolean> {
      const rows = await manager.query<unknown[]>(
        `WITH updated AS (
           UPDATE messages SET deleted_at = now()
            WHERE id = $1 AND conversation_id = $2 AND sender_id = $3 AND deleted_at IS NULL
           RETURNING id
         )
         SELECT id FROM updated`,
        [messageId, conversationId, userId],
      );
      return rows.length > 0;
    },

    /** Tệp đính kèm của một tin chưa xóa trong hội thoại. */
    async attachmentFile(
      conversationId: string,
      fileId: string,
    ): Promise<Pick<StoredFile, 'bucket' | 'storageKey' | 'mimeType' | 'originalName'> | null> {
      const [row] = await manager.query<
        {
          bucket: StoredFile['bucket'];
          storage_key: string;
          mime_type: string;
          original_name: string | null;
        }[]
      >(
        `SELECT f.bucket, f.storage_key, f.mime_type, f.original_name
           FROM message_attachments a
           JOIN messages m ON m.id = a.message_id
           JOIN files f ON f.id = a.file_id
          WHERE a.file_id = $1 AND m.conversation_id = $2
            AND m.deleted_at IS NULL AND f.status = 'ready' AND f.deleted_at IS NULL`,
        [fileId, conversationId],
      );
      return row
        ? {
            bucket: row.bucket,
            storageKey: row.storage_key,
            mimeType: row.mime_type,
            originalName: row.original_name,
          }
        : null;
    },
  };
}

export type MessagingRepository = ReturnType<typeof createMessagingRepository>;
