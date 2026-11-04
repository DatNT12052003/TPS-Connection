import nodemailer from 'nodemailer';

export type OutgoingEmail = { to: string; subject: string; text: string };

export type Mailer = { send(email: OutgoingEmail): Promise<void> };

export function smtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    send: async (email) => {
      await transport.sendMail({ from, ...email });
    },
  };
}
