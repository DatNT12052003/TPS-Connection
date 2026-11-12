import { describe, expect, it } from 'vitest';
import { readPreferences, safeRedirectPath, serializePreferences } from './preferences';

const requestWithCookies = (cookies: string[]) =>
  new Request('http://localhost/', { headers: { Cookie: cookies.join('; ') } });

describe('readPreferences', () => {
  it('defaults to Vietnamese and the device theme', async () => {
    await expect(readPreferences(new Request('http://localhost/'))).resolves.toEqual({
      locale: 'vi',
      theme: 'system',
    });
  });

  it('reads back what serializePreferences wrote', async () => {
    const setCookies = await serializePreferences({ locale: 'en', theme: 'dark' });
    const cookies = setCookies.map((header) => header.split(';')[0] ?? '');
    await expect(readPreferences(requestWithCookies(cookies))).resolves.toEqual({
      locale: 'en',
      theme: 'dark',
    });
  });

  it('ignores tampered cookie values', async () => {
    await expect(
      readPreferences(requestWithCookies(['tps_lang=Imtsb2luZ29uIg%3D%3D', 'tps_theme=garbage'])),
    ).resolves.toEqual({ locale: 'vi', theme: 'system' });
  });
});

describe('safeRedirectPath', () => {
  it.each(['/status', '/app?tab=1', '/'])('keeps internal path %s', (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each(['//evil.example', 'https://evil.example', 'javascript:alert(1)', '', null])(
    'falls back for %s',
    (value) => {
      expect(safeRedirectPath(value)).toBe('/');
    },
  );
});
