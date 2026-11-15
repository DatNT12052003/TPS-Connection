// @vitest-environment node
// POST /preferences: lưu cookie ngôn ngữ / chế độ màu; đang đăng nhập thì ngôn ngữ cũng lưu vào tài khoản
// (ngôn ngữ email), và lỗi khi lưu vào tài khoản không chặn việc đổi giao diện.
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { accountProfile, authMe, SESSION } from '../../test/api-fixtures';
import { API, server } from '../../test/msw-server';
import { routeArgs } from '../../test/route-args';
import { action } from './preferences';

describe('preferences', () => {
  it('saves the language to the signed-in account as well as the cookie', async () => {
    let body: unknown;
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(authMe(['parent']))),
      http.patch(`${API}/api/v1/me`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(accountProfile({ locale: 'en' }));
      }),
    );
    const { args } = routeArgs('/preferences', {
      cookie: SESSION,
      form: { locale: 'en', redirectTo: '/app/account' },
    });
    const response = await action(args);
    expect(body).toEqual({ locale: 'en' });
    expect(response.headers.get('Location')).toBe('/app/account');
    expect(response.headers.get('Set-Cookie')).toMatch(/^tps_lang=/);
  });

  it('only sets the cookie for visitors and for theme changes', async () => {
    let patched = false;
    server.use(
      http.patch(`${API}/api/v1/me`, () => {
        patched = true;
        return HttpResponse.json(accountProfile());
      }),
    );
    await action(routeArgs('/preferences', { form: { locale: 'en', redirectTo: '/' } }).args);
    server.use(http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(authMe(['parent']))));
    await action(
      routeArgs('/preferences', { cookie: SESSION, form: { theme: 'dark', redirectTo: '/' } }).args,
    );
    expect(patched).toBe(false);
  });

  it('still changes the interface language when the account cannot be updated', async () => {
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(authMe(['parent']))),
      http.patch(`${API}/api/v1/me`, () => HttpResponse.json({}, { status: 503 })),
    );
    const response = await action(
      routeArgs('/preferences', { cookie: SESSION, form: { locale: 'en', redirectTo: '/' } }).args,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('Set-Cookie')).toMatch(/^tps_lang=/);
  });
});
