import type {
  NotificationIdParams,
  NotificationListQuery,
  UpdateNotificationPreferences,
} from '@tps/shared';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { NotificationsService } from './notifications.service.js';

/** HTTP cho thông báo (`/notifications`) và tùy chọn (`/me/notification-preferences`). */
export function createNotificationsController(service: NotificationsService) {
  const userId = (req: Parameters<typeof requireAuth>[0]) => requireAuth(req).user.id;

  const list: RequestHandler = async (req, res) => {
    res.json(await service.list(userId(req), req.query as unknown as NotificationListQuery));
  };

  const unread: RequestHandler = async (req, res) => {
    res.json(await service.unread(userId(req)));
  };

  const markRead: RequestHandler<NotificationIdParams> = async (req, res) => {
    await service.markRead(userId(req), req.params.notificationId);
    res.status(204).end();
  };

  const markAllRead: RequestHandler = async (req, res) => {
    await service.markAllRead(userId(req));
    res.status(204).end();
  };

  const preferences: RequestHandler = async (req, res) => {
    res.json(await service.preferences(userId(req)));
  };

  const updatePreferences: RequestHandler<unknown, unknown, UpdateNotificationPreferences> = async (
    req,
    res,
  ) => {
    res.json(await service.updatePreferences(userId(req), req.body));
  };

  return { list, unread, markRead, markAllRead, preferences, updatePreferences };
}

export type NotificationsController = ReturnType<typeof createNotificationsController>;
