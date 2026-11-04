import { redirectDocument } from 'react-router';
import { userApi } from './api.server';

/**
 * The browser only ever talks to this server, so cookies the API sets must be
 * passed on. They carry no Domain, and so belong to this site.
 */
export function relaySetCookies(from: Response): Headers {
  const headers = new Headers();
  for (const cookie of from.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
  return headers;
}

/** Only a path on this site, so a crafted link cannot send people elsewhere after sign-in. */
export function safeNextPath(next: string | null, fallback: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback;
  }
  return next;
}

/**
 * Loads the signed-in account. An expired access token sends the browser through
 * the refresh route, which is the only path that receives the refresh cookie.
 */
export async function requireAccount(request: Request) {
  const { data, response } = await userApi(request).GET('/api/v1/me');
  if (response.status === 401) {
    const { pathname, search } = new URL(request.url);
    const next = encodeURIComponent(`${pathname}${search}`);
    throw redirectDocument(`/api/v1/auth/refresh?next=${next}`);
  }
  if (!data) throw new Response('Unavailable', { status: 503 });
  return data;
}
