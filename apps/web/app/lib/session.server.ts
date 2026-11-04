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

/** Rendered into forms and sent back with them. See formApi. */
export function csrfTokenOf(request: Request): string {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === 'tps_csrf' && value) return decodeURIComponent(value);
  }
  return '';
}

/**
 * The page a request belongs to. Client-side navigation fetches data from an
 * internal address (/vi/account.data, or /_root.data for the home page), which is
 * no place to send a person.
 */
export function pagePathOf(request: Request): string {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/_root\.data$/, '/').replace(/\.data$/, '');
  for (const internal of ['_routes', 'index']) url.searchParams.delete(internal);
  return `${pathname}${url.search}`;
}

/** An expired access token: go through refresh and come back to this page. */
export function redirectToRefresh(request: Request): Response {
  const next = encodeURIComponent(pagePathOf(request));
  return redirectDocument(`/api/v1/auth/refresh?next=${next}`);
}

/**
 * Loads the signed-in account. An expired access token sends the browser through
 * the refresh route, which is the only path that receives the refresh cookie.
 */
export async function requireAccount(request: Request) {
  const { data, response } = await userApi(request).GET('/api/v1/me');
  if (response.status === 401) throw redirectToRefresh(request);
  if (!data) throw new Response('Unavailable', { status: 503 });
  return data;
}
