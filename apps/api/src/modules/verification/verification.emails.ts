// Email báo kết quả xác minh cho gia sư (G3), theo ngôn ngữ của gia sư. Không kèm ảnh hay thông tin giấy tờ.
import {
  type Locale,
  messages,
  type VerificationRejectionCode,
  type VerificationRequestKind,
} from '@tps/shared';
import type { EmailMessage } from '../../lib/email/email-sender.js';
import { escapeHtml, interpolate } from '../../lib/email/template.js';

export function buildVerificationResultEmail(options: {
  locale: Locale;
  to: string;
  name: string;
  kind: VerificationRequestKind;
  /** Tên bằng cấp khi `kind = credential`. */
  credentialTitle: string | null;
  outcome: 'approved' | 'rejected';
  rejectionCode?: VerificationRejectionCode | null;
  rejectionNote?: string | null;
  /** Trang hồ sơ và xác minh trên web. */
  link: string;
}): EmailMessage {
  const m = messages[options.locale];
  const t = m.emailVerificationResult;
  const values = { title: options.credentialTitle ?? '' };
  const isIdentity = options.kind === 'identity';
  const approved = options.outcome === 'approved';
  const subject = interpolate(
    approved
      ? isIdentity
        ? t.approvedIdentitySubject
        : t.approvedCredentialSubject
      : isIdentity
        ? t.rejectedIdentitySubject
        : t.rejectedCredentialSubject,
    values,
  );
  const body = interpolate(
    approved
      ? isIdentity
        ? t.approvedIdentityBody
        : t.approvedCredentialBody
      : isIdentity
        ? t.rejectedIdentityBody
        : t.rejectedCredentialBody,
    values,
  );
  const reasonLines =
    !approved && options.rejectionCode
      ? [
          interpolate(t.reason, {
            reason: m.verificationRejectionCode[options.rejectionCode],
          }),
          ...(options.rejectionNote ? [options.rejectionNote] : []),
          t.resubmit,
        ]
      : [];
  const greeting = interpolate(m.emailCommon.greeting, { name: options.name });

  const text = [
    greeting,
    '',
    body,
    ...(reasonLines.length ? ['', ...reasonLines] : []),
    '',
    `${t.action}: ${options.link}`,
    '',
    '--',
    m.emailCommon.tagline,
    m.emailCommon.automated,
  ].join('\n');

  const link = escapeHtml(options.link);
  const reasonHtml = reasonLines
    .map((line) => `<p style="margin:0 0 8px">${escapeHtml(line)}</p>`)
    .join('');
  const html = `<!doctype html>
<html lang="${options.locale}"><body style="margin:0;background:#F6F8FC;font-family:Arial,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#FFFFFF;border-radius:12px;padding:28px;font-size:15px;line-height:24px">
<p style="margin:0 0 16px;font-weight:700;font-size:16px">TPS-Connection</p>
<p style="margin:0 0 12px;font-size:20px;font-weight:700">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px">${escapeHtml(body)}</p>
${reasonHtml}
<p style="margin:12px 0 0"><a href="${link}" style="display:inline-block;background:#1D4ED8;color:#FFFFFF;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 20px">${escapeHtml(t.action)}</a></p>
</div>
<p style="text-align:center;color:#4B5563;font-size:12px;line-height:18px">${escapeHtml(m.emailCommon.tagline)}<br>${escapeHtml(m.emailCommon.automated)}</p>
</div></body></html>`;

  return { to: options.to, subject, text, html };
}
