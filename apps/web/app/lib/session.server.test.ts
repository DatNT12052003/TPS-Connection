// @vitest-environment node
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, server } from '../../test/msw-server';
import { routeArgs, settle } from '../../test/route-args';
import { homePathFor } from './session';
import { getCurrentUser, getCurrentUserOrNull, requireUser } from './session.server';

const me = {
  id: '0193a1b2-0000-7000-8000-000000000001',
  email: 'mai@example.com',
  displayName: 'Mẹ Bin',
  fullName: 'Nguyễn Thị Mai',
  phone: '0912345678',
  locale: 'vi',
  status: 'active',
  emailVerified: true,
  roles: ['parent'],
};

const ctx = (cookie?: string) => {
  const { args } = routeArgs('/app', cookie ? { cookie } : {});
  return args as { request: Request; context: Parameters<typeof getCurrentUser>[0] };
};

describe('getCurrentUser', () => {
  it('does not call the API when the browser sends no session cookie', async () => {
    // msw báo lỗi với mọi request không có handler: test này fail nếu có lời gọi API.
    await expect(getCurrentUser(ctx('tps_lang=vi').context)).resolves.toBeNull();
  });

  it('returns a slim user without email or phone, and asks the API once per request', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => {
        calls += 1;
        return HttpResponse.json(me);
      }),
    );
    const { context } = ctx('tps_at=a');
    const [first, second] = await Promise.all([getCurrentUser(context), getCurrentUser(context)]);
    expect(first).toEqual({
      id: me.id,
      displayName: 'Mẹ Bin',
      roles: ['parent'],
      status: 'active',
    });
    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  it('treats an expired session as signed out, and an unreachable API as an error', async () => {
    server.use(
      http.get(`${API}/api/v1/auth/me`, () =>
        HttpResponse.json({ error: { code: 'unauthenticated', message: 'x' } }, { status: 401 }),
      ),
    );
    await expect(getCurrentUser(ctx('tps_at=a').context)).resolves.toBeNull();

    server.use(
      http.get(`${API}/api/v1/auth/me`, () =>
        HttpResponse.json({ error: { code: 'internal_error', message: 'x' } }, { status: 500 }),
      ),
    );
    await expect(getCurrentUser(ctx('tps_at=a').context)).rejects.toMatchObject({
      code: 'internal_error',
    });
    // Trang công khai vẫn hiện được.
    await expect(getCurrentUserOrNull(ctx('tps_at=a').context)).resolves.toBeNull();
  });
});

describe('requireUser', () => {
  it('sends signed-out visitors to /login and back to the page they wanted', async () => {
    const { request, context } = routeArgs('/app/classes?tab=active').args as ReturnType<
      typeof ctx
    >;
    const response = (await settle(requireUser(request, context))) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      '/login?redirectTo=%2Fapp%2Fclasses%3Ftab%3Dactive',
    );
  });

  it('answers 404 when the user lacks the role (does not reveal the area)', async () => {
    server.use(http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(me)));
    const { request, context } = ctx('tps_at=a');
    const thrown = (await settle(requireUser(request, context, { roles: ['admin'] }))) as {
      init: { status: number };
    };
    expect(thrown.init.status).toBe(404);
  });
});

describe('homePathFor', () => {
  it('sends staff-only accounts to /admin and everyone else to /app', () => {
    expect(homePathFor({ roles: ['admin'] })).toBe('/admin');
    expect(homePathFor({ roles: ['parent'] })).toBe('/app');
    expect(homePathFor({ roles: ['tutor', 'manager'] })).toBe('/app');
  });
});
