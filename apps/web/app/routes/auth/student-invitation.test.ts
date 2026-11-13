// @vitest-environment node
// Action của trang nhận lời mời học sinh: tra cứu lời mời, nhận lời mời (tạo tài khoản, giữ cookie phiên
// để gửi lại trình duyệt), và các trường hợp liên kết không dùng được.
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, server } from '../../../test/msw-server';
import { routeArgs } from '../../../test/route-args';
import { action } from './student-invitation';

const TOKEN = 'A'.repeat(43);
const preview = {
  email: 'minh@example.com',
  inviterName: 'Mai',
  learnerName: 'Bé Minh',
  expiresAt: '2026-11-20T08:00:00.000Z',
};
const session = {
  user: {
    id: '0193a1b2-0000-7000-8000-000000000002',
    email: 'minh@example.com',
    displayName: 'Bé Minh',
    fullName: 'Nguyễn Đức Minh',
    phone: null,
    locale: 'vi',
    status: 'active',
    emailVerified: true,
    roles: ['student'],
  },
  accessTokenExpiresAt: '2026-11-13T10:00:00.000Z',
};
const apiError = (status: number, error: object) => HttpResponse.json({ error }, { status });
const payload = (result: unknown) => (result as { data: Record<string, unknown> }).data;

describe('student invitation', () => {
  it('looks up the invitation and hands the token back to the form', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/student-invitations/lookup`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(preview);
      }),
    );
    const { args } = routeArgs('/student-invitation', {
      form: { intent: 'lookup', token: TOKEN },
    });
    expect(payload(await action(args))).toEqual({ intent: 'lookup', preview, token: TOKEN });
    expect(body).toEqual({ token: TOKEN });
  });

  it('rejects a link without a token, without calling the API', async () => {
    let called = false;
    server.use(
      http.post(`${API}/api/v1/student-invitations/lookup`, () => {
        called = true;
        return HttpResponse.json(preview);
      }),
    );
    const { args } = routeArgs('/student-invitation', { form: { intent: 'lookup', token: '' } });
    expect(payload(await action(args))).toEqual({
      intent: 'lookup',
      unusable: { key: 'validation.invalid_token' },
    });
    expect(called).toBe(false);
  });

  it('explains an expired invitation', async () => {
    server.use(
      http.post(`${API}/api/v1/student-invitations/lookup`, () =>
        apiError(410, { code: 'invitation_expired', message: 'Expired' }),
      ),
    );
    const { args } = routeArgs('/student-invitation', {
      form: { intent: 'lookup', token: TOKEN },
    });
    expect(payload(await action(args))).toEqual({
      intent: 'lookup',
      unusable: { key: 'errors.invitation_expired' },
    });
  });

  it('creates the account, keeps the session cookies and opens the student area', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/student-invitations/accept`, async ({ request }) => {
        body = await request.json();
        const headers = new Headers();
        headers.append('Set-Cookie', 'tps_at=access; Path=/; HttpOnly; SameSite=Lax');
        headers.append('Set-Cookie', 'tps_rt=refresh; Path=/; HttpOnly; SameSite=Lax');
        return HttpResponse.json(session, { status: 201, headers });
      }),
    );
    const { args, api } = routeArgs('/student-invitation', {
      form: { intent: 'accept', token: TOKEN, password: 'matkhau123', acceptTerms: 'on' },
    });
    const response = (await action(args)) as Response;
    expect(response.headers.get('Location')).toBe('/app');
    expect(body).toEqual({
      token: TOKEN,
      password: 'matkhau123',
      locale: 'vi',
      acceptTerms: true,
    });
    expect(api.responseCookies()).toHaveLength(2);
  });

  it('shows password errors next to the field', async () => {
    server.use(
      http.post(`${API}/api/v1/student-invitations/accept`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'Invalid',
          details: [{ path: 'password', code: 'password_too_short', message: 'x' }],
        }),
      ),
    );
    const { args } = routeArgs('/student-invitation', {
      form: { intent: 'accept', token: TOKEN, password: 'abc', acceptTerms: 'on' },
    });
    expect(payload(await action(args))).toEqual({
      intent: 'accept',
      fieldErrors: { password: { key: 'validation.password_too_short' } },
    });
  });

  it('stops when the invitation was used meanwhile', async () => {
    server.use(
      http.post(`${API}/api/v1/student-invitations/accept`, () =>
        apiError(404, { code: 'invitation_invalid', message: 'Not usable' }),
      ),
    );
    const { args } = routeArgs('/student-invitation', {
      form: { intent: 'accept', token: TOKEN, password: 'matkhau123', acceptTerms: 'on' },
    });
    expect(payload(await action(args))).toEqual({
      intent: 'accept',
      unusable: { key: 'errors.invitation_invalid' },
    });
  });
});
