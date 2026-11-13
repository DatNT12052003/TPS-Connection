import nodemailer from 'nodemailer';
import type { Env } from '../../config/env.js';
import { EmailMessage, type EmailSender } from './email-sender.js';

export type SmtpConfig = Pick<
  Env,
  'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASS' | 'EMAIL_FROM'
>;

/** Gửi qua SMTP: Mailpit khi local, Gmail SMTP + App Password khi chạy thật. */
export function createSmtpEmailSender(config: SmtpConfig): EmailSender {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    ...(config.SMTP_USER && { auth: { user: config.SMTP_USER, pass: config.SMTP_PASS ?? '' } }),
    // Giữ kết nối để gửi nhiều thư liên tiếp; giới hạn thấp để không bị Gmail chặn vì gửi dồn.
    pool: true,
    maxConnections: 2,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return {
    async send(input) {
      const message = EmailMessage.parse(input);
      const info = await transport.sendMail({
        from: config.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html && { html: message.html }),
      });
      return { messageId: info.messageId };
    },
    async verify() {
      await transport.verify();
    },
    close() {
      transport.close();
    },
  };
}
