import { DEFAULT_LOCALE, Locale } from '@tps/shared';
import { createCookie } from 'react-router';
import { z } from 'zod';

/** light / dark: người dùng chọn; system: theo hệ điều hành (prefers-color-scheme). */
export const ThemePreference = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreference>;

export interface Preferences {
  locale: Locale;
  theme: ThemePreference;
}

const ONE_YEAR = 60 * 60 * 24 * 365;

// Lưu trong cookie để server (SSR) render đúng ngôn ngữ và chế độ màu ngay từ đầu, không bị nháy.
const localeCookie = createCookie('tps_lang', { path: '/', sameSite: 'lax', maxAge: ONE_YEAR });
const themeCookie = createCookie('tps_theme', { path: '/', sameSite: 'lax', maxAge: ONE_YEAR });

export async function readPreferences(request: Request): Promise<Preferences> {
  const header = request.headers.get('Cookie');
  // Giá trị cookie do trình duyệt gửi: coi là unknown, Zod kiểm tra ở dưới.
  const locale: unknown = await localeCookie.parse(header);
  const theme: unknown = await themeCookie.parse(header);
  return {
    locale: Locale.catch(DEFAULT_LOCALE).parse(locale),
    theme: ThemePreference.catch('system').parse(theme),
  };
}

/** Header Set-Cookie cho các tùy chọn vừa đổi. */
export async function serializePreferences(changes: Partial<Preferences>): Promise<string[]> {
  const headers: string[] = [];
  if (changes.locale) headers.push(await localeCookie.serialize(changes.locale));
  if (changes.theme) headers.push(await themeCookie.serialize(changes.theme));
  return headers;
}

/** Chỉ cho chuyển hướng tới đường dẫn nội bộ (chặn open redirect qua ?redirectTo=https://...). */
export function safeRedirectPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  return value;
}
