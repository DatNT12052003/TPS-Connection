import {
  type Locale,
  NOTIFICATION_LIMITS,
  type NotificationChannel,
  type NotificationType,
  type UserStatus,
} from '@tps/shared';
import type { EntityManager } from 'typeorm';

/** Một dòng `notifications` đọc ra. */
export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  data: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RawNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  data: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = `id, user_id, type, data, read_at, created_at, updated_at`;

const toRecord = (r: RawNotification): NotificationRecord => ({
  id: r.id,
  userId: r.user_id,
  type: r.type,
  data: r.data,
  readAt: r.read_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Người nhận email: địa chỉ, ngôn ngữ, tên; null nếu tài khoản không nhận được (bị khóa, đã xóa, chưa có email). */
export interface EmailRecipient {
  email: string;
  locale: Locale;
  displayName: string;
}

/**
 * Truy cập thông báo và tùy chọn. Không kiểm tra quyền (service làm). Câu UPDATE cần đọc dòng thì bọc trong CTE
 * (`manager.query` trả `[rows, rowCount]` cho UPDATE trần).
 */
export function createNotificationsRepository(manager: EntityManager) {
  return {
    /** Các lựa chọn khác mặc định của những người này. */
    async preferencesOf(
      userIds: string[],
    ): Promise<
      { userId: string; type: NotificationType; channel: NotificationChannel; enabled: boolean }[]
    > {
      if (userIds.length === 0) return [];
      const rows = await manager.query<
        {
          user_id: string;
          type: NotificationType;
          channel: NotificationChannel;
          enabled: boolean;
        }[]
      >(
        `SELECT user_id, type, channel, enabled FROM notification_preferences
          WHERE user_id = ANY($1::uuid[])`,
        [userIds],
      );
      return rows.map((r) => ({
        userId: r.user_id,
        type: r.type,
        channel: r.channel,
        enabled: r.enabled,
      }));
    },

    async insert(
      userId: string,
      type: NotificationType,
      data: Record<string, unknown>,
    ): Promise<NotificationRecord> {
      const [row] = await manager.query<RawNotification[]>(
        `INSERT INTO notifications (user_id, type, data) VALUES ($1, $2, $3::jsonb)
         RETURNING ${COLUMNS}`,
        [userId, type, JSON.stringify(data)],
      );
      return toRecord(row!);
    },

    /**
     * Tin nhắn mới: tạo thông báo chưa đọc của hội thoại, hoặc gộp vào thông báo chưa đọc đã có (`count` + 1, tên
     * người gửi mới nhất, đưa lên đầu danh sách). `inserted`: thông báo mới tạo (chỉ khi đó mới gửi email).
     */
    async upsertMessage(
      userId: string,
      conversationId: string,
      counterpartName: string,
    ): Promise<NotificationRecord & { inserted: boolean }> {
      const [row] = await manager.query<(RawNotification & { inserted: boolean })[]>(
        `INSERT INTO notifications (user_id, type, data)
         VALUES ($1, 'message_new',
                 jsonb_build_object('conversationId', $2::text, 'counterpartName', $3::text, 'count', 1))
         ON CONFLICT (user_id, (data ->> 'conversationId'))
           WHERE type = 'message_new' AND read_at IS NULL
         DO UPDATE SET
           data = notifications.data
                  || jsonb_build_object('counterpartName', $3::text,
                                        'count', (notifications.data ->> 'count')::int + 1),
           updated_at = now()
         RETURNING ${COLUMNS}, (xmax = 0) AS inserted`,
        [userId, conversationId, counterpartName],
      );
      return { ...toRecord(row!), inserted: row!.inserted };
    },

    /** Danh sách của U, hoạt động mới nhất trước. Index: `notifications_user_idx`. */
    async list(
      userId: string,
      options: { page: number; pageSize: number; unreadOnly: boolean },
    ): Promise<{ rows: NotificationRecord[]; total: number }> {
      const unread = options.unreadOnly ? 'AND read_at IS NULL' : '';
      const rows = await manager.query<RawNotification[]>(
        `SELECT ${COLUMNS} FROM notifications WHERE user_id = $1 ${unread}
          ORDER BY updated_at DESC, id DESC LIMIT $2 OFFSET $3`,
        [userId, options.pageSize, (options.page - 1) * options.pageSize],
      );
      const [count] = await manager.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 ${unread}`,
        [userId],
      );
      return { rows: rows.map(toRecord), total: count?.n ?? 0 };
    },

    /** Số chưa đọc, tối đa `unreadCap`. Index: `notifications_unread_idx`. */
    async countUnread(userId: string): Promise<number> {
      const [row] = await manager.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM (
           SELECT 1 FROM notifications WHERE user_id = $1 AND read_at IS NULL LIMIT $2
         ) u`,
        [userId, NOTIFICATION_LIMITS.unreadCap],
      );
      return row?.n ?? 0;
    },

    /** Đánh dấu một thông báo của U đã đọc. False nếu không có thông báo đó (của U). */
    async markRead(userId: string, notificationId: string): Promise<boolean> {
      const rows = await manager.query<unknown[]>(
        `WITH target AS (
           SELECT id, read_at FROM notifications WHERE id = $1 AND user_id = $2
         ), updated AS (
           UPDATE notifications n SET read_at = now()
             FROM target t WHERE n.id = t.id AND t.read_at IS NULL
           RETURNING n.id
         )
         SELECT id FROM target`,
        [notificationId, userId],
      );
      return rows.length > 0;
    },

    async markAllRead(userId: string): Promise<void> {
      await manager.query(
        `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
        [userId],
      );
    },

    /** Đã đọc hội thoại: thông báo tin nhắn chưa đọc của hội thoại thành đã đọc. */
    async markConversationRead(userId: string, conversationId: string): Promise<void> {
      await manager.query(
        `UPDATE notifications SET read_at = now()
          WHERE user_id = $1 AND type = 'message_new' AND read_at IS NULL
            AND data ->> 'conversationId' = $2`,
        [userId, conversationId],
      );
    },

    /** Ghi một lựa chọn; trùng mặc định thì xóa dòng (bảng chỉ giữ lựa chọn khác mặc định). */
    async setPreference(
      userId: string,
      type: NotificationType,
      channel: NotificationChannel,
      enabled: boolean,
      isDefault: boolean,
    ): Promise<void> {
      if (isDefault) {
        await manager.query(
          `DELETE FROM notification_preferences WHERE user_id = $1 AND type = $2 AND channel = $3`,
          [userId, type, channel],
        );
        return;
      }
      await manager.query(
        `INSERT INTO notification_preferences (user_id, type, channel, enabled) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, type, channel) DO UPDATE SET enabled = EXCLUDED.enabled`,
        [userId, type, channel, enabled],
      );
    },

    /** Người nhận email đang hoạt động (không khóa, không xóa, có email). */
    async emailRecipients(userIds: string[]): Promise<Map<string, EmailRecipient>> {
      const result = new Map<string, EmailRecipient>();
      if (userIds.length === 0) return result;
      const rows = await manager.query<
        { id: string; email: string; locale: Locale; display_name: string; status: UserStatus }[]
      >(
        `SELECT id, email, locale, display_name, status FROM users
          WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND email IS NOT NULL
            AND status <> 'locked'`,
        [userIds],
      );
      for (const r of rows) {
        result.set(r.id, { email: r.email, locale: r.locale, displayName: r.display_name });
      }
      return result;
    },
  };
}

export type NotificationsRepository = ReturnType<typeof createNotificationsRepository>;
