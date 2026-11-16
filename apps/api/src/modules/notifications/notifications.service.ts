// Thông báo (G5 đợt 3, §12). Hai phần:
// - Notifier cho các module khác: `record(manager, …)` ghi thông báo TRONG transaction của sự kiện (theo tùy chọn của
//   người nhận), `dispatch(…)` SAU commit đẩy `notification:new` qua Socket.IO và xếp email. Lỗi khi dispatch chỉ ghi
//   log: sự kiện đã lưu, người dùng vẫn thấy trên web.
// - API của người dùng: danh sách, số chưa đọc, đánh dấu đã đọc, tùy chọn theo loại.
// Không phụ thuộc Express.
import {
  NOTIFICATION_DEFAULTS,
  type Notification,
  type NotificationContent,
  type NotificationList,
  type NotificationListQuery,
  type NotificationPreferences,
  NotificationType,
  type NotificationUnread,
  notificationHref,
  REALTIME_EVENTS,
  type UpdateNotificationPreferences,
} from '@tps/shared';
import type { DataSource, EntityManager } from 'typeorm';
import type { EmailMessage } from '../../lib/email/email-sender.js';
import { notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import type { RealtimePublisher } from '../../realtime/realtime.js';
import { buildNotificationEmail } from './notifications.emails.js';
import {
  createNotificationsRepository,
  type NotificationRecord,
} from './notifications.repository.js';

/** Một thông báo đã ghi (hoặc chỉ cần email) chờ đẩy đi sau commit. */
export interface PendingNotification {
  userId: string;
  content: NotificationContent;
  /** Dòng đã ghi; null khi người nhận tắt thông báo trong app cho loại này. */
  record: NotificationRecord | null;
  sendEmail: boolean;
}

export interface Notifier {
  record(
    manager: EntityManager,
    items: { userId: string; content: NotificationContent }[],
  ): Promise<PendingNotification[]>;
  /** Không bao giờ ném lỗi. */
  dispatch(pending: PendingNotification[]): Promise<void>;
}

/** Không ghi, không gửi gì (test của module khác). */
export const noopNotifier: Notifier = {
  record: () => Promise.resolve([]),
  dispatch: () => Promise.resolve(),
};

export function toNotificationDto(record: NotificationRecord): Notification {
  return {
    id: record.id,
    type: record.type,
    data: record.data,
    readAt: record.readAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  } as Notification;
}

export function createNotificationsService(deps: {
  dataSource: DataSource;
  realtime: RealtimePublisher;
  sendEmail: (message: EmailMessage) => Promise<unknown>;
  /** Gốc URL của web, để dựng liên kết trong email. */
  webUrl: string;
  logger: Logger;
}) {
  const { dataSource, realtime, logger } = deps;
  const webUrl = deps.webUrl.replace(/\/+$/, '');

  const notifier: Notifier = {
    async record(manager, items) {
      const repo = createNotificationsRepository(manager);
      const overrides = await repo.preferencesOf([...new Set(items.map((i) => i.userId))]);
      const enabled = (userId: string, type: NotificationType, channel: 'in_app' | 'email') => {
        const fallback = NOTIFICATION_DEFAULTS[type];
        const base = channel === 'in_app' ? fallback.inApp : fallback.email;
        if (base === null) return false;
        const found = overrides.find(
          (o) => o.userId === userId && o.type === type && o.channel === channel,
        );
        return found ? found.enabled : base;
      };

      const pending: PendingNotification[] = [];
      for (const { userId, content } of items) {
        const inApp = enabled(userId, content.type, 'in_app');
        const email = enabled(userId, content.type, 'email');
        if (content.type === 'message_new') {
          // Tắt trong app thì cũng không email từng tin (không có gì để gộp, dễ thành thư rác).
          if (!inApp) continue;
          const row = await repo.upsertMessage(
            userId,
            content.data.conversationId,
            content.data.counterpartName,
          );
          pending.push({ userId, content, record: row, sendEmail: email && row.inserted });
          continue;
        }
        if (!inApp && !email) continue;
        const record = inApp ? await repo.insert(userId, content.type, content.data) : null;
        pending.push({ userId, content, record, sendEmail: email });
      }
      return pending;
    },

    async dispatch(pending) {
      if (pending.length === 0) return;
      for (const item of pending) {
        if (item.record) {
          realtime.emitToUser(
            item.userId,
            REALTIME_EVENTS.notificationNew,
            toNotificationDto(item.record),
          );
        }
      }
      const emailUsers = pending.filter((p) => p.sendEmail).map((p) => p.userId);
      if (emailUsers.length === 0) return;
      try {
        const recipients = await createNotificationsRepository(dataSource.manager).emailRecipients([
          ...new Set(emailUsers),
        ]);
        for (const item of pending) {
          const recipient = item.sendEmail ? recipients.get(item.userId) : undefined;
          if (!recipient) continue;
          const message = buildNotificationEmail({
            locale: recipient.locale,
            to: recipient.email,
            name: recipient.displayName,
            content: item.content,
            link: `${webUrl}${notificationHref(item.content)}`,
          });
          if (message) await deps.sendEmail(message);
        }
      } catch (err) {
        logger.error({ err }, 'Could not enqueue notification emails');
      }
    },
  };

  return {
    notifier,

    async list(userId: string, query: NotificationListQuery): Promise<NotificationList> {
      const { rows, total } = await createNotificationsRepository(dataSource.manager).list(userId, {
        page: query.page,
        pageSize: query.pageSize,
        unreadOnly: query.unread === true,
      });
      return {
        items: rows.map(toNotificationDto),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    },

    async unread(userId: string): Promise<NotificationUnread> {
      return {
        count: await createNotificationsRepository(dataSource.manager).countUnread(userId),
      };
    },

    /** Đánh dấu đã đọc; thông báo của người khác hoặc không có: 404. */
    async markRead(userId: string, notificationId: string): Promise<void> {
      const found = await createNotificationsRepository(dataSource.manager).markRead(
        userId,
        notificationId,
      );
      if (!found) throw notFound('Notification');
    },

    async markAllRead(userId: string): Promise<void> {
      await createNotificationsRepository(dataSource.manager).markAllRead(userId);
    },

    async preferences(userId: string): Promise<NotificationPreferences> {
      const overrides = await createNotificationsRepository(dataSource.manager).preferencesOf([
        userId,
      ]);
      const value = (type: NotificationType, channel: 'in_app' | 'email', base: boolean) =>
        overrides.find((o) => o.type === type && o.channel === channel)?.enabled ?? base;
      return {
        items: NotificationType.options.map((type) => {
          const defaults = NOTIFICATION_DEFAULTS[type];
          return {
            type,
            inApp: value(type, 'in_app', defaults.inApp),
            email: defaults.email === null ? null : value(type, 'email', defaults.email),
          };
        }),
      };
    },

    async updatePreferences(
      userId: string,
      input: UpdateNotificationPreferences,
    ): Promise<NotificationPreferences> {
      await dataSource.transaction(async (manager) => {
        const repo = createNotificationsRepository(manager);
        for (const item of input.items) {
          const defaults = NOTIFICATION_DEFAULTS[item.type];
          if (item.inApp !== undefined) {
            await repo.setPreference(
              userId,
              item.type,
              'in_app',
              item.inApp,
              item.inApp === defaults.inApp,
            );
          }
          if (item.email !== undefined && defaults.email !== null) {
            await repo.setPreference(
              userId,
              item.type,
              'email',
              item.email,
              item.email === defaults.email,
            );
          }
        }
      });
      return this.preferences(userId);
    },
  };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;
