// Form hồ sơ gia sư: đọc số tiền, tóm tắt khối lớp, tên thiết bị đăng nhập.
import { describe, expect, it } from 'vitest';
import { parseMoney, summarizeGrades } from './tutor-profile';
import { describeUserAgent } from './user-agent';

describe('parseMoney', () => {
  it.each([
    ['180.000', 180000],
    ['180,000', 180000],
    ['180 000đ', 180000],
    ['  95000 ', 95000],
  ])('reads %j', (text, amount) => {
    expect(parseMoney(text)).toBe(amount);
  });

  it('treats an empty amount as no fee and text without digits as invalid', () => {
    expect(parseMoney('  ')).toBeNull();
    expect(parseMoney('thỏa thuận')).toBeNaN();
  });
});

describe('summarizeGrades', () => {
  const grades = [6, 7, 8, 9, 10, 11].map((n) => ({ id: n, label: `Lớp ${n}` }));

  it('joins three or more grades in a row into a range, in catalog order', () => {
    expect(summarizeGrades([9, 6, 8, 7], grades)).toBe('Lớp 6 – Lớp 9');
  });

  it('lists short runs and gaps one by one', () => {
    expect(summarizeGrades([6, 7, 11], grades)).toBe('Lớp 6, Lớp 7, Lớp 11');
  });
});

describe('describeUserAgent', () => {
  it('recognises common browsers and systems', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
      ),
    ).toEqual({ browser: 'Edge', os: 'Windows' });
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ browser: 'Safari', os: 'iOS' });
  });

  it('returns nothing it cannot recognise', () => {
    expect(describeUserAgent(null)).toEqual({ browser: null, os: null });
    expect(describeUserAgent('curl/8.0')).toEqual({ browser: null, os: null });
  });
});
