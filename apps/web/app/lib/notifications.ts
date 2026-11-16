// Nội dung một thông báo theo ngôn ngữ của người xem (G5, G6). API chỉ trả loại và dữ liệu (id, môn, thời điểm, tên
// hiển thị của bên kia); không có thông tin của trẻ. Trang đích: `notificationHref` của @tps/shared.
import type { Notification } from '@tps/shared';
import type { TFunction } from 'i18next';
import { type CatalogOption, labelOf } from './catalog';
import { shortMonth } from './fees';
import { formatDateTime } from './format';

export function notificationText(
  t: TFunction,
  language: string,
  notification: Notification,
  subjects: readonly CatalogOption[],
): string {
  if (notification.type === 'message_new') {
    return t('notificationText.message', {
      name: notification.data.counterpartName,
      count: notification.data.count,
    });
  }
  if (notification.type === 'verification_result') {
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

  const values = {
    subject: labelOf(subjects, notification.data.subjectId) ?? '',
    name: notification.data.counterpartName ?? '',
  };
  switch (notification.type) {
    case 'connection_received':
      return notification.data.direction === 'tutor_to_client'
        ? t('notificationText.receivedApplication', values)
        : t('notificationText.receivedRequest', values);
    case 'connection_accepted':
      return t('notificationText.accepted', values);
    case 'connection_rejected':
      return notification.data.counterpartName
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
    // ---- Lớp học (G6) ----
    case 'class_status':
      return notification.data.status === 'paused'
        ? t('notificationText.classPaused', values)
        : notification.data.status === 'active'
          ? t('notificationText.classResumed', values)
          : t('notificationText.classEnded', values);
    case 'fee_change':
      switch (notification.data.event) {
        case 'proposed':
          return t('notificationText.feeProposed', values);
        case 'accepted':
          return t('notificationText.feeAccepted', values);
        case 'rejected':
          return t('notificationText.feeRejected', values);
        case 'withdrawn':
          return t('notificationText.feeWithdrawn', values);
      }
      break;
    case 'assessment_new':
      return t('notificationText.assessmentNew', values);
    case 'fee_statement': {
      const fee = { ...values, month: shortMonth(notification.data.month) };
      switch (notification.data.event) {
        case 'issued':
          return t('notificationText.feeIssued', fee);
        case 'due':
          return t('notificationText.feeDue', fee);
        case 'voided':
          return t('notificationText.feeVoided', fee);
        case 'payment_recorded':
          return t('notificationText.paymentRecorded', fee);
        case 'payment_acknowledged':
          return t('notificationText.paymentAcknowledged', fee);
        case 'payment_declined':
          return t('notificationText.paymentDeclined', fee);
        case 'payment_voided':
          return t('notificationText.paymentVoided', fee);
      }
      break;
    }
    case 'lesson_upcoming':
    case 'lesson_changed':
    case 'attendance_reminder':
    case 'lesson_to_confirm':
    case 'lesson_dispute': {
      const date = formatDateTime(notification.data.startsAt, language);
      const lesson = { ...values, date };
      switch (notification.type) {
        case 'lesson_upcoming':
          return t('notificationText.lessonUpcoming', lesson);
        case 'lesson_changed':
          return notification.data.change === 'rescheduled'
            ? t('notificationText.lessonRescheduled', lesson)
            : t('notificationText.lessonCancelled', lesson);
        case 'attendance_reminder':
          return t('notificationText.attendanceReminder', lesson);
        case 'lesson_to_confirm': {
          const due = formatDateTime(notification.data.confirmDueAt, language);
          return notification.data.reminder
            ? t('notificationText.lessonToConfirmReminder', { ...lesson, due })
            : t('notificationText.lessonToConfirm', { ...lesson, due });
        }
        case 'lesson_dispute':
          switch (notification.data.event) {
            case 'opened':
              return t('notificationText.disputeOpened', lesson);
            case 'settled':
              return t('notificationText.disputeSettled', lesson);
            case 'withdrawn':
              return t('notificationText.disputeWithdrawn', lesson);
            case 'escalated':
              return t('notificationText.disputeEscalated', lesson);
            case 'resolved':
              return t('notificationText.disputeResolved', lesson);
          }
      }
    }
  }
  return '';
}
