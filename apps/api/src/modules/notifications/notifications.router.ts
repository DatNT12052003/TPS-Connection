import {
  NotificationIdParams,
  NotificationListQuery,
  UpdateNotificationPreferences,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { validate } from '../../http/validate.js';
import type { NotificationsController } from './notifications.controller.js';

/**
 * /api/v1/notifications: thông báo của người đang đăng nhập (mọi vai trò). Thông báo của người khác: 404.
 *
 *   GET  /                        200  danh sách, mới nhất trước (?unread=true&page=&pageSize=)
 *   GET  /unread                  200  số chưa đọc (tối đa 99)
 *   POST /read-all                204  đánh dấu tất cả đã đọc
 *   POST /:notificationId/read    204  đánh dấu một thông báo đã đọc
 *
 * Thông báo mới cũng được đẩy qua Socket.IO (`notification:new`).
 */
export function notificationsRouter(
  controller: NotificationsController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/', validate({ query: NotificationListQuery }), controller.list);
  router.get('/unread', controller.unread);
  router.post('/read-all', controller.markAllRead);
  router.post(
    '/:notificationId/read',
    validate({ params: NotificationIdParams }),
    controller.markRead,
  );
  return router;
}

/**
 * /api/v1/me/notification-preferences: bật/tắt thông báo trong app và email theo loại.
 *
 *   GET  /   200  mọi loại với giá trị hiện tại (`email: null`: loại không có tùy chọn email)
 *   PUT  /   200  đổi các loại được gửi `{ items: [{ type, inApp?, email? }] }`
 */
export function notificationPreferencesRouter(
  controller: NotificationsController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/', controller.preferences);
  router.put('/', validate({ body: UpdateNotificationPreferences }), controller.updatePreferences);
  return router;
}
