import { describe, expect, it } from 'vitest';
import { parsePublicRef, publicSlug, slugify, toAscii } from './text.js';

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

describe('publicSlug and parsePublicRef', () => {
  it('builds a slug ending with the public code', () => {
    expect(publicSlug('Thầy Nam – Toán', 'a1b2c3d4e5')).toBe('thay-nam-toan-a1b2c3d4e5');
    expect(publicSlug('!!!', 'a1b2c3d4e5')).toBe('a1b2c3d4e5');
  });

  it('reads the code back, ignoring the words (they may be out of date)', () => {
    expect(parsePublicRef('thay-nam-toan-a1b2c3d4e5')).toEqual({ code: 'a1b2c3d4e5' });
    expect(parsePublicRef('ten-cu-a1b2c3d4e5')).toEqual({ code: 'a1b2c3d4e5' });
    expect(parsePublicRef('a1b2c3d4e5')).toEqual({ code: 'a1b2c3d4e5' });
  });

  it('accepts a uuid', () => {
    const id = '0195f2a4-7c1e-7b3a-9c2d-1e2f3a4b5c6d';
    expect(parsePublicRef(id.toUpperCase())).toEqual({ id });
  });

  it.each(['thay-nam', 'thay-nam-A1B2C3D4E5', 'thay-nam-a1b2c3d4e', 'xa1b2c3d4e5', ''])(
    'rejects %s',
    (ref) => {
      expect(parsePublicRef(ref)).toBeNull();
    },
  );
});
