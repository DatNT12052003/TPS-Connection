// @vitest-environment node
// Client gọi API phía server: chuyển tiếp cookie phiên, tự làm mới phiên một lần khi access token hết hạn,
// gom Set-Cookie để gửi lại trình duyệt (D57).
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { API, server } from '../../test/msw-server';
import { ApiError } from './api';
import {
  parseSetCookie,
  ServerApi,
  serverApiMiddleware,
  serverApiContext,
} from './server-api.server';
import { RouterContextProvider } from 'react-router';

const Me = z.object({ id: z.string() });
const browserRequest = (cookie?: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost:5173/app', {
    headers: { ...(cookie && { Cookie: cookie }), 'User-Agent': 'TestBrowser/1.0', ...headers },
  });

const unauthenticated = () =>
  HttpResponse.json({ error: { code: 'unauthenticated', message: 'Expired' } }, { status: 401 });

describe('ServerApi', () => {
  it('forwards the session cookies and browser headers to the API', async () => {
    let seen: Headers | undefined;
    server.use(
      http.get(`${API}/api/v1/auth/me`, ({ request }) => {
        seen = request.headers;
        return HttpResponse.json({ id: 'u1' });
      }),
    );
    const api = new ServerApi(
      browserRequest('tps_at=access1; tps_lang=vi', {
        Origin: 'http://localhost:5173',
        'X-Forwarded-For': '203.0.113.7',
      }),
      API,
    );
    await expect(api.call('/api/v1/auth/me', { schema: Me })).resolves.toEqual({ id: 'u1' });
    expect(seen?.get('cookie')).toBe('tps_at=access1; tps_lang=vi');
    expect(seen?.get('user-agent')).toBe('TestBrowser/1.0');
    expect(seen?.get('origin')).toBe('http://localhost:5173');
    expect(seen?.get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it('refreshes an expired session once, retries, and keeps the new cookies for the browser', async () => {
    let refreshes = 0;
    server.use(
      http.get(`${API}/api/v1/auth/me`, ({ request }) =>
        request.headers.get('cookie')?.includes('tps_at=new')
          ? HttpResponse.json({ id: 'u1' })
          : unauthenticated(),
      ),
      http.post(`${API}/api/v1/auth/refresh`, () => {
        refreshes += 1;
        const headers = new Headers();
        headers.append('Set-Cookie', 'tps_at=new; Path=/; HttpOnly; SameSite=Lax');
        headers.append('Set-Cookie', 'tps_rt=rt2; Path=/; HttpOnly; SameSite=Lax');
        return HttpResponse.json({}, { headers });
      }),
    );
    const api = new ServerApi(browserRequest('tps_at=old; tps_rt=rt1'), API);

    // Hai loader chạy song song: chỉ làm mới một lần.
    const [a, b] = await Promise.all([
      api.call('/api/v1/auth/me', { schema: Me }),
      api.call('/api/v1/auth/me', { schema: Me }),
    ]);
    expect([a, b]).toEqual([{ id: 'u1' }, { id: 'u1' }]);
    expect(refreshes).toBe(1);
    expect(api.responseCookies()).toEqual([
      'tps_at=new; Path=/; HttpOnly; SameSite=Lax',
      'tps_rt=rt2; Path=/; HttpOnly; SameSite=Lax',
    ]);
  });

  it('does not refresh without a refresh cookie, nor on endpoints where 401 means bad credentials', async () => {
    let refreshes = 0;
    server.use(
      http.get(`${API}/api/v1/auth/me`, unauthenticated),
      http.post(`${API}/api/v1/auth/login`, () =>
        HttpResponse.json(
          { error: { code: 'invalid_credentials', message: 'Bad' } },
          { status: 401 },
        ),
      ),
      http.post(`${API}/api/v1/auth/refresh`, () => {
        refreshes += 1;
        return unauthenticated();
      }),
    );
    await expect(
      new ServerApi(browserRequest('tps_at=old'), API).call('/api/v1/auth/me'),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      new ServerApi(browserRequest('tps_rt=rt1'), API).call('/api/v1/auth/login', {
        method: 'POST',
        body: {},
      }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(refreshes).toBe(0);
  });

  it('passes on the cookie removal when the refresh is refused', async () => {
    server.use(
      http.get(`${API}/api/v1/auth/me`, unauthenticated),
      http.post(`${API}/api/v1/auth/refresh`, () => {
        const headers = new Headers();
        headers.append('Set-Cookie', 'tps_at=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        headers.append('Set-Cookie', 'tps_rt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        return HttpResponse.json(
          { error: { code: 'unauthenticated', message: 'Invalid refresh token' } },
          { status: 401, headers },
        );
      }),
    );
    const api = new ServerApi(browserRequest('tps_at=old; tps_rt=stolen'), API);
    await expect(api.call('/api/v1/auth/me')).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(api.hasSession()).toBe(false);
    expect(api.responseCookies()).toHaveLength(2);
  });

  it('reports an unreachable API as service_unavailable', async () => {
    const api = new ServerApi(browserRequest('tps_at=a'), 'http://127.0.0.1:1');
    const error = await api.call('/api/v1/auth/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'service_unavailable', status: 0 });
  });

  it('keeps field errors and meta of API errors', async () => {
    server.use(
      http.post(`${API}/api/v1/auth/email-verification/confirm`, () =>
        HttpResponse.json(
          { error: { code: 'invalid_code', message: 'Invalid code', meta: { attemptsLeft: 3 } } },
          { status: 400 },
        ),
      ),
    );
    const api = new ServerApi(browserRequest(), API);
    await expect(
      api.call('/api/v1/auth/email-verification/confirm', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({ code: 'invalid_code', meta: { attemptsLeft: 3 } });
  });
});

describe('serverApiMiddleware', () => {
  it('adds the API cookies to the response sent to the browser', async () => {
    server.use(
      http.post(`${API}/api/v1/auth/logout`, () => {
        const headers = new Headers();
        headers.append('Set-Cookie', 'tps_at=; Path=/; Max-Age=0');
        return new HttpResponse(null, { status: 204, headers });
      }),
    );
    process.env.API_URL = API;
    const context = new RouterContextProvider();
    const response = await serverApiMiddleware(
      { request: browserRequest('tps_at=a'), context, params: {} } as never,
      async () => {
        await context.get(serverApiContext).call('/api/v1/auth/logout', { method: 'POST' });
        return new Response(null, { status: 302, headers: { Location: '/' } });
      },
    );
    delete process.env.API_URL;
    expect((response as Response).headers.getSetCookie()).toEqual(['tps_at=; Path=/; Max-Age=0']);
  });
});

describe('parseSetCookie', () => {
  it('detects removed cookies', () => {
    expect(parseSetCookie('tps_at=abc; Path=/; HttpOnly')).toEqual({
      name: 'tps_at',
      value: 'abc',
      removed: false,
    });
    expect(parseSetCookie('tps_at=; Path=/').removed).toBe(true);
    expect(parseSetCookie('tps_at=x; Max-Age=0').removed).toBe(true);
    expect(parseSetCookie('tps_at=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT').removed).toBe(true);
  });
});
