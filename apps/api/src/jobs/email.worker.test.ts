import { describe, expect, it } from '@jest/globals';
import { maskEmail } from './email.worker.js';

describe('maskEmail', () => {
  it.each([
    ['phuhuynh@gmail.com', 'ph***@gmail.com'],
    ['a@b.vn', 'a***@b.vn'],
    ['not-an-email', '***'],
  ])('%s -> %s', (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });
});
