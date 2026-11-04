import { describe, expect, it } from 'vitest';
import { isLocale, LOCALES, MESSAGES } from '~/lib/i18n';

describe('i18n', () => {
  it('accepts only supported locales', () => {
    expect(isLocale('vi')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it('has a non-empty translation for every key in every locale', () => {
    const keys = Object.keys(MESSAGES.vi);
    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual([...keys].sort());
      for (const value of Object.values(MESSAGES[locale])) expect(value).not.toBe('');
    }
  });
});
