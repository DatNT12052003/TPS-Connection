// Nội dung một thông báo theo ngôn ngữ của người xem (G5). API chỉ trả loại và dữ liệu (id, môn, tên hiển thị của
// bên kia); không có thông tin của trẻ. Trang đích: `notificationHref` của @tps/shared.
import type { Notification } from '@tps/shared';
import type { TFunction } from 'i18next';
import { type CatalogOption, labelOf } from './catalog';
import { formatDateTime } from './format';

export function notificationText(
  t: TFunction,
  language: string,
  notification: Notification,
  subjects: readonly CatalogOption[],
): string {
  switch (notification.type) {
    case 'message_new':
      return t('notificationText.message', {
        name: notification.data.counterpartName,
        count: notification.data.count,
      });
    case 'verification_result': {
      const { kind, outcome, credentialTitle } = notification.data;
      if (kind === 'identity') {
        return outcome === 'approved'
          ? t('notificationText.identityApproved')
          : t('notificationText.identityRejected');
      }
      return outcome === 'approved'
        ? t('notificationText.credentialApproved', { title: credentialTitle ?? '' })
        : t('notificationText.credentialRejected', { title: credentialTitle ?? '' });
    }
    default: {
      const { data } = notification;
      const values = {
        subject: labelOf(subjects, data.subjectId) ?? '',
        name: data.counterpartName ?? '',
      };
      switch (notification.type) {
        case 'connection_received':
          return data.direction === 'tutor_to_client'
            ? t('notificationText.receivedApplication', values)
            : t('notificationText.receivedRequest', values);
        case 'connection_accepted':
          return t('notificationText.accepted', values);
        case 'connection_rejected':
          return data.counterpartName
            ? t('notificationText.rejectedBy', values)
            : t('notificationText.rejected', values);
        case 'connection_confirmed':
          return t('notificationText.confirmed', values);
        case 'connection_expiring': {
          const date = formatDateTime(notification.data.expiresAt, language);
          return notification.data.status === 'pending'
            ? t('notificationText.expiringPending', { ...values, date })
            : t('notificationText.expiringNegotiating', { ...values, date });
        }
      }
    }
  }
}
