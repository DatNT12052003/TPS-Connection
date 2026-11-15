import { describe, expect, it } from 'vitest';
import { LoginRequest, OtpCode, PhoneNumber, RegisterRequest } from './auth.js';

const valid = {
  role: 'parent',
  fullName: '  Nguyễn Thị Mai ',
  email: ' Mai.Nguyen@Gmail.com ',
  password: 'matkhau123',
  acceptTerms: true,
};

describe('RegisterRequest', () => {
  it('normalises name and email, defaults the locale', () => {
    expect(RegisterRequest.parse(valid)).toMatchObject({
      fullName: 'Nguyễn Thị Mai',
      email: 'mai.nguyen@gmail.com',
      locale: 'vi',
    });
  });

  it('requires accepting the terms', () => {
    const result = RegisterRequest.safeParse({ ...valid, acceptTerms: false });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('must_accept_terms');
  });

  it('only allows parent and tutor to sign up themselves', () => {
    expect(RegisterRequest.safeParse({ ...valid, role: 'admin' }).success).toBe(false);
    expect(RegisterRequest.safeParse({ ...valid, role: 'student' }).success).toBe(false);
  });

  it('treats an empty phone as not given', () => {
    expect(RegisterRequest.parse({ ...valid, phone: '' }).phone).toBeUndefined();
  });
});

describe('PhoneNumber', () => {
  it.each([
    ['0912 345 678', '0912345678'],
    ['0912.345.678', '0912345678'],
    ['+84 912 345 678', '+84912345678'],
  ])('%s -> %s', (input, expected) => {
    expect(PhoneNumber.parse(input)).toBe(expected);
  });

  it.each(['12345', '091234567a', '+1 202 555 0100'])('rejects %s', (input) => {
    expect(PhoneNumber.safeParse(input).success).toBe(false);
  });
});

describe('OtpCode and LoginRequest', () => {
  it('accept exactly six digits', () => {
    expect(OtpCode.parse(' 048291 ')).toBe('048291');
    expect(OtpCode.safeParse('48291').success).toBe(false);
    expect(OtpCode.safeParse('48291a').success).toBe(false);
  });

  it('do not apply password strength rules on login', () => {
    expect(LoginRequest.parse({ email: 'a@b.vn', password: 'x' }).rememberMe).toBe(false);
  });
});
