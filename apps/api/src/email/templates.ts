export type Locale = 'vi' | 'en';

export type EmailContent =
  | { template: 'verify_email'; link: string; hours: number }
  | { template: 'already_registered'; link: string }
  | { template: 'reset_password'; link: string; minutes: number }
  | { template: 'password_changed'; link: string };

export type RenderedEmail = { subject: string; text: string };

/*
 * Plain text, and nothing a stranger can type. Anyone can register with someone
 * else's address, so a display name here would let them put words in our email.
 */
const render: Record<Locale, (content: EmailContent) => RenderedEmail> = {
  vi: (content) => {
    switch (content.template) {
      case 'verify_email':
        return {
          subject: 'Xác thực email của bạn trên TPS-Connection',
          text: `Chào bạn,\n\nMở liên kết dưới đây để xác thực email:\n${content.link}\n\nLiên kết có hiệu lực trong ${content.hours} giờ và chỉ dùng được một lần.\n\nNếu bạn không đăng ký TPS-Connection, hãy bỏ qua email này.`,
        };
      case 'already_registered':
        return {
          subject: 'Có người đăng ký TPS-Connection bằng email của bạn',
          text: `Chào bạn,\n\nCó người vừa đăng ký TPS-Connection bằng email này, nhưng email đã có tài khoản nên không có tài khoản mới nào được tạo.\n\nNếu là bạn và bạn quên mật khẩu, hãy đặt lại tại đây:\n${content.link}\n\nNếu không phải bạn, hãy bỏ qua email này.`,
        };
      case 'reset_password':
        return {
          subject: 'Đặt lại mật khẩu TPS-Connection',
          text: `Chào bạn,\n\nMở liên kết dưới đây để đặt mật khẩu mới:\n${content.link}\n\nLiên kết có hiệu lực trong ${content.minutes} phút và chỉ dùng được một lần.\n\nNếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu của bạn không thay đổi.`,
        };
      case 'password_changed':
        return {
          subject: 'Mật khẩu TPS-Connection của bạn đã được đổi',
          text: `Chào bạn,\n\nMật khẩu tài khoản của bạn vừa được đổi và mọi phiên đăng nhập cũ đã bị đăng xuất.\n\nNếu không phải bạn, hãy đặt lại mật khẩu ngay:\n${content.link}`,
        };
    }
  },
  en: (content) => {
    switch (content.template) {
      case 'verify_email':
        return {
          subject: 'Verify your email on TPS-Connection',
          text: `Hello,\n\nOpen the link below to verify your email:\n${content.link}\n\nThe link works for ${content.hours} hours and can be used once.\n\nIf you did not sign up for TPS-Connection, ignore this email.`,
        };
      case 'already_registered':
        return {
          subject: 'Someone tried to sign up to TPS-Connection with your email',
          text: `Hello,\n\nSomeone just tried to sign up to TPS-Connection with this email. It already has an account, so no new account was created.\n\nIf this was you and you forgot your password, reset it here:\n${content.link}\n\nIf it was not you, ignore this email.`,
        };
      case 'reset_password':
        return {
          subject: 'Reset your TPS-Connection password',
          text: `Hello,\n\nOpen the link below to choose a new password:\n${content.link}\n\nThe link works for ${content.minutes} minutes and can be used once.\n\nIf you did not ask for this, ignore this email. Your password has not changed.`,
        };
      case 'password_changed':
        return {
          subject: 'Your TPS-Connection password was changed',
          text: `Hello,\n\nYour account password was just changed and all earlier sessions were signed out.\n\nIf this was not you, reset your password now:\n${content.link}`,
        };
    }
  },
};

export const renderEmail = (locale: Locale, content: EmailContent): RenderedEmail =>
  render[locale](content);
