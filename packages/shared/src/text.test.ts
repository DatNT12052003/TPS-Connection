import { describe, expect, it } from 'vitest';
import { slugify, toAscii } from './text.js';

describe('toAscii', () => {
  it.each([
    ['Phường Ba Đình', 'Phuong Ba Dinh'],
    ['Đặc khu Phú Quốc', 'Dac khu Phu Quoc'],
    ['Thừa Thiên Huế', 'Thua Thien Hue'],
    ['Hà Nội', 'Ha Noi'],
    ['ĐƯỜNG LÁNG', 'DUONG LANG'],
    ['no accents', 'no accents'],
  ])('%s -> %s', (input, expected) => {
    expect(toAscii(input)).toBe(expected);
  });

  it('handles text already composed differently (NFD input)', () => {
    expect(toAscii('Ngữ văn'.normalize('NFD'))).toBe('Ngu van');
  });
});

describe('slugify', () => {
  it.each([
    ['Nguyễn Văn A – Toán, Hà Nội', 'nguyen-van-a-toan-ha-noi'],
    ['  Lớp 12: Luyện thi ĐẠI HỌC!  ', 'lop-12-luyen-thi-dai-hoc'],
    ['Tiếng Anh (IELTS 7.0+)', 'tieng-anh-ielts-7-0'],
    ['---', ''],
  ])('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('cuts at a word boundary when too long', () => {
    expect(slugify('gia sư toán lý hóa', 12)).toBe('gia-su-toan');
    expect(slugify('abcdefghijklmnop', 5)).toBe('abcde');
  });
});
