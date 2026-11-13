// Nội dung email mã OTP theo ngôn ngữ người nhận, theo mẫu email của canvas giao diện (D52, D54).
// Chuỗi nằm ở @tps/shared (i18n) để vi và en luôn đủ khóa.
import { type Locale, messages, OTP_RULES } from '@tps/shared';
import type { EmailMessage } from '../../lib/email/email-sender.js';

export type OtpEmailKind = 'verify_email' | 'reset_password';

const interpolate = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ''));

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );

export function buildOtpEmail(options: {
  kind: OtpEmailKind;
  locale: Locale;
  to: string;
  name: string;
  code: string;
}): EmailMessage {
  const m = messages[options.locale];
  const body = options.kind === 'verify_email' ? m.emailVerifyCode : m.emailResetCode;
  const greeting = interpolate(m.emailCommon.greeting, { name: options.name });
  const expiry = interpolate(m.emailCommon.codeExpiry, { minutes: OTP_RULES.ttlSeconds / 60 });

  const text = [
    greeting,
    '',
    body.intro,
    '',
    `    ${options.code}`,
    '',
    expiry,
    m.emailCommon.codeWarning,
    body.ignore,
    '',
    '--',
    m.emailCommon.tagline,
    m.emailCommon.automated,
  ].join('\n');

  // HTML tối giản, nền sáng cố định (nhiều ứng dụng email không hỗ trợ chế độ tối).
  const html = `<!doctype html>
<html lang="${options.locale}"><body style="margin:0;background:#F6F8FC;font-family:Arial,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#FFFFFF;border-radius:12px;padding:28px;font-size:15px;line-height:24px">
<p style="margin:0 0 16px;font-weight:700;font-size:16px">TPS-Connection</p>
<p style="margin:0 0 12px;font-size:20px;font-weight:700">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px">${escapeHtml(body.intro)}</p>
<p style="margin:0 0 16px"><span style="display:inline-block;font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;background:#EEF2F8;border:1px solid #D8DEE9;border-radius:10px;padding:10px 18px">${escapeHtml(options.code)}</span></p>
<p style="margin:0 0 12px">${escapeHtml(expiry)}</p>
<p style="margin:0 0 8px;color:#4B5563;font-size:13px;line-height:20px">${escapeHtml(m.emailCommon.codeWarning)}</p>
<p style="margin:0;color:#4B5563;font-size:13px;line-height:20px">${escapeHtml(body.ignore)}</p>
</div>
<p style="text-align:center;color:#4B5563;font-size:12px;line-height:18px">${escapeHtml(m.emailCommon.tagline)}<br>${escapeHtml(m.emailCommon.automated)}</p>
</div></body></html>`;

  return { to: options.to, subject: body.subject, text, html };
}
