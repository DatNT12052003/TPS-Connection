// Cookie đăng nhập (D57): httpOnly (JavaScript không đọc được), SameSite=Lax, Secure khi chạy thật.
import { AUTH_COOKIES } from '@tps/shared';
import type { CookieOptions, Request, Response } from 'express';
import type { IssuedSession } from './auth.service.js';

export interface CookieSettings {
  domain?: string | undefined;
  secure: boolean;
}

const baseOptions = (settings: CookieSettings): CookieOptions => ({
  httpOnly: true,
  secure: settings.secure,
  sameSite: 'lax',
  path: '/',
  ...(settings.domain && { domain: settings.domain }),
});

export function setSessionCookies(res: Response, session: IssuedSession, settings: CookieSettings) {
  const options = baseOptions(settings);
  res.cookie(AUTH_COOKIES.access, session.accessToken, {
    ...options,
    expires: session.accessTokenExpiresAt,
  });
  // Không "ghi nhớ đăng nhập": cookie phiên, mất khi đóng trình duyệt (token vẫn hết hạn sau 12 giờ).
  res.cookie(AUTH_COOKIES.refresh, session.refreshToken, {
    ...options,
    ...(session.rememberMe && { expires: session.refreshTokenExpiresAt }),
  });
}

export function clearSessionCookies(res: Response, settings: CookieSettings) {
  const options = baseOptions(settings);
  res.clearCookie(AUTH_COOKIES.access, options);
  res.clearCookie(AUTH_COOKIES.refresh, options);
}

const cookie = (req: Request, name: string): string | undefined => {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export const readRefreshToken = (req: Request) => cookie(req, AUTH_COOKIES.refresh);

/** Access token từ header `Authorization: Bearer` (app mobile) hoặc cookie (web). */
export function readAccessToken(req: Request): string | undefined {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim() || undefined;
  return cookie(req, AUTH_COOKIES.access);
}
