import { describe, expect, it } from '@jest/globals';
import { reviewDueAt } from './review-deadline.js';

/** Giờ Việt Nam -> Date. */
const vn = (iso: string) => new Date(`${iso}+07:00`);

describe('reviewDueAt', () => {
  // 2026-11-16 là thứ Hai.
  it('gives a Monday submission until the end of Wednesday', () => {
    expect(reviewDueAt(vn('2026-11-16T09:00:00'))).toEqual(vn('2026-11-18T23:59:59.999'));
  });

  it('gives a Friday submission until the end of the next Tuesday (D26)', () => {
    expect(reviewDueAt(vn('2026-11-20T21:30:00'))).toEqual(vn('2026-11-24T23:59:59.999'));
  });

  it('treats Saturday and Sunday submissions like Friday ones', () => {
    expect(reviewDueAt(vn('2026-11-21T10:00:00'))).toEqual(vn('2026-11-24T23:59:59.999'));
    expect(reviewDueAt(vn('2026-11-22T23:59:00'))).toEqual(vn('2026-11-24T23:59:59.999'));
  });

  it('uses the Vietnam date, not the UTC date', () => {
    // 00:30 thứ Hai giờ Việt Nam là 17:30 Chủ nhật UTC.
    expect(reviewDueAt(vn('2026-11-16T00:30:00'))).toEqual(vn('2026-11-18T23:59:59.999'));
  });

  it('gives a Thursday submission until the end of Monday', () => {
    expect(reviewDueAt(vn('2026-11-19T08:00:00'))).toEqual(vn('2026-11-23T23:59:59.999'));
  });
});
