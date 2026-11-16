// Email thông báo (G5 đợt 3, §12), theo ngôn ngữ của người nhận. KHÔNG có thông tin nhận dạng của trẻ, môn hay nội
// dung tin nhắn: chỉ tên hiển thị của bên kia và liên kết về web.
import { type Locale, messages, type NotificationContent } from '@tps/shared';
import type { EmailMessage } from '../../lib/email/email-sender.js';
import { escapeHtml, interpolate } from '../../lib/email/template.js';

/** Tiêu đề và nội dung theo loại; null nếu loại này không gửi email từ đây. */
function texts(
  locale: Locale,
  content: NotificationContent,
): { subject: string; body: string } | null {
  const t = messages[locale].emailNotification;
  const name = (value: string | null) => ({ name: value ?? '' });
  switch (content.type) {
    case 'connection_received':
      return { subject: t.receivedSubject, body: t.receivedBody };
    case 'connection_accepted': {
      const values = name(content.data.counterpartName);
      return {
        subject: interpolate(t.acceptedSubject, values),
        body: interpolate(t.acceptedBody, values),
      };
    }
    case 'connection_rejected':
      return { subject: t.rejectedSubject, body: t.rejectedBody };
    case 'connection_expiring':
      return content.data.status === 'pending'
        ? { subject: t.expiringPendingSubject, body: t.expiringPendingBody }
        : { subject: t.expiringNegotiatingSubject, body: t.expiringNegotiatingBody };
    case 'connection_confirmed':
      return { subject: t.confirmedSubject, body: t.confirmedBody };
    case 'message_new': {
      const values = name(content.data.counterpartName);
      return {
        subject: interpolate(t.messageSubject, values),
        body: interpolate(t.messageBody, values),
      };
    }
    case 'verification_result':
      return null;
    // Lớp học (G6): không có môn, tên học sinh hay nội dung buổi học trong email.
    case 'class_status': {
      const values = name(content.data.counterpartName);
      return {
        subject: t.classStatusSubject,
        body: interpolate(t.classStatusBody, values),
      };
    }
    case 'fee_change': {
      const values = name(content.data.counterpartName);
      return content.data.event === 'proposed'
        ? {
            subject: interpolate(t.feeProposedSubject, values),
            body: interpolate(t.feeProposedBody, values),
          }
        : content.data.event === 'withdrawn'
          ? null
          : { subject: t.feeDecidedSubject, body: t.feeDecidedBody };
    }
    case 'lesson_upcoming':
      return { subject: t.lessonUpcomingSubject, body: t.lessonUpcomingBody };
    case 'lesson_changed':
      return {
        subject: t.lessonChangedSubject,
        body: interpolate(t.lessonChangedBody, name(content.data.counterpartName)),
      };
    case 'attendance_reminder':
      return { subject: t.attendanceReminderSubject, body: t.attendanceReminderBody };
    case 'lesson_to_confirm':
      return {
        subject: t.lessonToConfirmSubject,
        body: interpolate(t.lessonToConfirmBody, name(content.data.counterpartName)),
      };
    case 'lesson_dispute':
      return { subject: t.lessonDisputeSubject, body: t.lessonDisputeBody };
    case 'assessment_new':
      return {
        subject: t.assessmentSubject,
        body: interpolate(t.assessmentBody, name(content.data.counterpartName)),
      };
  }
}

export function buildNotificationEmail(options: {
  locale: Locale;
  to: string;
  name: string;
  content: NotificationContent;
  link: string;
}): EmailMessage | null {
  const found = texts(options.locale, options.content);
  if (!found) return null;
  const m = messages[options.locale];
  const t = m.emailNotification;
  const greeting = interpolate(m.emailCommon.greeting, { name: options.name });
  const text = [
    greeting,
    '',
    found.body,
    '',
    `${t.action}: ${options.link}`,
    '',
    t.settingsHint,
    '--',
    m.emailCommon.tagline,
    m.emailCommon.automated,
  ].join('\n');
  const html = `<!doctype html>
<html lang="${options.locale}"><body style="margin:0;background:#F6F8FC;font-family:Arial,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#FFFFFF;border-radius:12px;padding:28px;font-size:15px;line-height:24px">
<p style="margin:0 0 16px;font-weight:700;font-size:16px">TPS-Connection</p>
<p style="margin:0 0 12px;font-size:20px;font-weight:700">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px">${escapeHtml(found.body)}</p>
<p style="margin:12px 0 0"><a href="${escapeHtml(options.link)}" style="display:inline-block;background:#1D4ED8;color:#FFFFFF;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 20px">${escapeHtml(t.action)}</a></p>
</div>
<p style="text-align:center;color:#4B5563;font-size:12px;line-height:18px">${escapeHtml(t.settingsHint)}<br>${escapeHtml(m.emailCommon.tagline)}<br>${escapeHtml(m.emailCommon.automated)}</p>
</div></body></html>`;
  return { to: options.to, subject: found.subject, text, html };
}
