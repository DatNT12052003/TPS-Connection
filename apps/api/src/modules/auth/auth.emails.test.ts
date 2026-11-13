import { describe, expect, it } from '@jest/globals';
import { buildOtpEmail } from './auth.emails.js';

describe('buildOtpEmail', () => {
  it('writes the verification email in Vietnamese with the code and its expiry', () => {
    const email = buildOtpEmail({
      kind: 'verify_email',
      locale: 'vi',
      to: 'mai@example.com',
      name: 'Nguyễn Thị Mai',
      code: '482915',
    });
    expect(email.to).toBe('mai@example.com');
    expect(email.subject).toBe('Mã xác thực email TPS-Connection của bạn');
    expect(email.text).toContain('Chào Nguyễn Thị Mai,');
    expect(email.text).toContain('482915');
    expect(email.text).toContain('Mã có hiệu lực trong 10 phút.');
    expect(email.html).toContain('482915');
    // Tiêu đề không chứa mã (không hiện trên màn hình khóa điện thoại).
    expect(email.subject).not.toContain('482915');
  });

  it('writes the reset email in English', () => {
    const email = buildOtpEmail({
      kind: 'reset_password',
      locale: 'en',
      to: 'anna@example.com',
      name: 'Anna',
      code: '715038',
    });
    expect(email.subject).toBe('Your TPS-Connection password reset code');
    expect(email.text).toContain('The code expires in 10 minutes.');
  });

  it('escapes the user-provided name in HTML', () => {
    const email = buildOtpEmail({
      kind: 'verify_email',
      locale: 'vi',
      to: 'x@example.com',
      name: '<img src=x onerror=alert(1)>',
      code: '000000',
    });
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
