import { describe, expect, it } from 'vitest';
import { Email, PaginationQuery, PAGE_SIZE_MAX, Password, VndAmount } from './common.js';

describe('Password (D50)', () => {
  it.each(['matkhau1', 'Mật khẩu 2026', 'abc12345'])('accepts %s', (value) => {
    expect(Password.safeParse(value).success).toBe(true);
  });

  it.each([
    ['abc1234', 'password_too_short'],
    ['abcdefgh', 'password_needs_letter_and_digit'],
    ['12345678', 'password_needs_letter_and_digit'],
  ])('rejects %s with %s', (value, code) => {
    const result = Password.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(code);
  });
});

describe('Email', () => {
  it('trims and lowercases', () => {
    expect(Email.parse('  Phu.Huynh@Gmail.COM ')).toBe('phu.huynh@gmail.com');
  });

  it('rejects malformed addresses', () => {
    expect(Email.safeParse('phuhuynh@').success).toBe(false);
  });
});

describe('VndAmount', () => {
  it('accepts non-negative integers', () => {
    expect(VndAmount.parse(180_000)).toBe(180_000);
    expect(VndAmount.parse(0)).toBe(0);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects %s', (value) => {
    expect(VndAmount.safeParse(value).success).toBe(false);
  });
});

describe('PaginationQuery', () => {
  it('applies defaults and coerces query strings', () => {
    expect(PaginationQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(PaginationQuery.parse({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
  });

  it('caps the page size', () => {
    expect(PaginationQuery.safeParse({ pageSize: String(PAGE_SIZE_MAX + 1) }).success).toBe(false);
  });
});
