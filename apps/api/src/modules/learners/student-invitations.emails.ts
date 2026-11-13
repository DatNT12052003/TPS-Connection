// Email mời con tạo tài khoản học sinh (D4, D50), theo ngôn ngữ của phụ huynh gửi lời mời.
import { type Locale, messages, STUDENT_INVITATION_RULES } from '@tps/shared';
import type { EmailMessage } from '../../lib/email/email-sender.js';
import { escapeHtml, interpolate } from '../../lib/email/template.js';

/**
 * Liên kết trang nhận lời mời trên web (D56). Token nằm sau dấu `#`: trình duyệt không gửi phần này lên
 * máy chủ web, nên token không lọt vào log truy cập hay header Referer. Trang web đọc token rồi gọi API.
 */
export function studentInvitationLink(webUrl: string, token: string): string {
  return `${webUrl.replace(/\/+$/, '')}/student-invitation#token=${token}`;
}

export function buildStudentInvitationEmail(options: {
  locale: Locale;
  to: string;
  inviterName: string;
  link: string;
}): EmailMessage {
  const m = messages[options.locale];
  const t = m.emailStudentInvitation;
  const inviter = options.inviterName;
  const subject = interpolate(t.subject, { inviter });
  const intro = interpolate(t.intro, { inviter });
  const expiry = interpolate(t.expiry, { days: STUDENT_INVITATION_RULES.ttlSeconds / 86_400 });

  const text = [
    t.greeting,
    '',
    intro,
    '',
    `${t.action}: ${options.link}`,
    '',
    expiry,
    t.ignore,
    '',
    '--',
    m.emailCommon.tagline,
    m.emailCommon.automated,
  ].join('\n');

  const link = escapeHtml(options.link);
  const html = `<!doctype html>
<html lang="${options.locale}"><body style="margin:0;background:#F6F8FC;font-family:Arial,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#FFFFFF;border-radius:12px;padding:28px;font-size:15px;line-height:24px">
<p style="margin:0 0 16px;font-weight:700;font-size:16px">TPS-Connection</p>
<p style="margin:0 0 12px;font-size:20px;font-weight:700">${escapeHtml(t.greeting)}</p>
<p style="margin:0 0 20px">${escapeHtml(intro)}</p>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#1D4ED8;color:#FFFFFF;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 20px">${escapeHtml(t.action)}</a></p>
<p style="margin:0 0 4px;color:#4B5563;font-size:13px;line-height:20px">${escapeHtml(t.linkHint)}</p>
<p style="margin:0 0 16px;font-size:13px;line-height:20px;word-break:break-all"><a href="${link}" style="color:#1D4ED8">${link}</a></p>
<p style="margin:0 0 8px">${escapeHtml(expiry)}</p>
<p style="margin:0;color:#4B5563;font-size:13px;line-height:20px">${escapeHtml(t.ignore)}</p>
</div>
<p style="text-align:center;color:#4B5563;font-size:12px;line-height:18px">${escapeHtml(m.emailCommon.tagline)}<br>${escapeHtml(m.emailCommon.automated)}</p>
</div></body></html>`;

  return { to: options.to, subject, text, html };
}
