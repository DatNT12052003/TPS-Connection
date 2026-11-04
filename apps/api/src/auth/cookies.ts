import type { CookieJar } from '../http/route.js';
import {
  ACCESS_TOKEN_SECONDS,
  csrfTokenFor,
  REFRESH_TOKEN_SECONDS,
  type AuthConfig,
} from './tokens.js';

export const ACCESS_COOKIE = 'tps_access';
export const REFRESH_COOKIE = 'tps_refresh';
export const CSRF_COOKIE = 'tps_csrf';

// Refresh and logout both need it. No other path ever receives it.
const REFRESH_PATH = '/api/v1/auth';

export function parseCookies(header: unknown): Record<string, string> {
  if (typeof header !== 'string') return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const raw = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}

const base = (config: AuthConfig) => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax' as const,
});

export function setSessionCookies(
  jar: CookieJar,
  config: AuthConfig,
  session: { accessToken: string; refreshToken: string; familyId: string },
): void {
  jar.set(ACCESS_COOKIE, session.accessToken, {
    ...base(config),
    path: '/',
    maxAge: ACCESS_TOKEN_SECONDS * 1000,
  });
  jar.set(REFRESH_COOKIE, session.refreshToken, {
    ...base(config),
    path: REFRESH_PATH,
    maxAge: REFRESH_TOKEN_SECONDS * 1000,
  });
  jar.set(CSRF_COOKIE, csrfTokenFor(session.familyId, config), {
    ...base(config),
    path: '/',
    maxAge: REFRESH_TOKEN_SECONDS * 1000,
  });
}

export function clearSessionCookies(jar: CookieJar, config: AuthConfig): void {
  jar.clear(ACCESS_COOKIE, { ...base(config), path: '/' });
  jar.clear(REFRESH_COOKIE, { ...base(config), path: REFRESH_PATH });
  jar.clear(CSRF_COOKIE, { ...base(config), path: '/' });
}
