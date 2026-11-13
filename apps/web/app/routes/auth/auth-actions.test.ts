// @vitest-environment node
// Action của các trang tài khoản, gọi trực tiếp với API giả (msw): gửi đúng dữ liệu tới API, chuyển hướng
// đúng chỗ, đổi lỗi API thành lỗi theo ô / lỗi chung, giữ cookie phiên để gửi lại trình duyệt.
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, server } from '../../../test/msw-server';
import { routeArgs, settle } from '../../../test/route-args';
import { serializePreferences } from '~/lib/preferences';
import { action as forgotAction } from './forgot-password';
import { action as loginAction, loader as loginLoader } from './login';
import { action as logoutAction } from './logout';
import { action as registerAction } from './register';
import { action as verifyAction } from './verify-email';

const user = {
  id: '0193a1b2-0000-7000-8000-000000000001',
  email: 'mai@example.com',
  displayName: 'Mai',
  fullName: 'Nguyễn Thị Mai',
  phone: null,
  locale: 'vi',
  status: 'active',
  emailVerified: true,
  roles: ['parent'],
};
const session = { user, accessTokenExpiresAt: '2026-11-13T10:00:00.000Z' };
const sessionCookies = () => {
  const headers = new Headers();
  headers.append('Set-Cookie', 'tps_at=access; Path=/; HttpOnly; SameSite=Lax');
  headers.append('Set-Cookie', 'tps_rt=refresh; Path=/; HttpOnly; SameSite=Lax');
  return headers;
};
const apiError = (status: number, error: object) => HttpResponse.json({ error }, { status });

/** Dữ liệu của `data(...)` trả về từ action. */
const payload = (result: unknown) => (result as { data: Record<string, unknown> }).data;

describe('login', () => {
  it('signs in, keeps the API cookies and goes back to the requested page', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/auth/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(session, { headers: sessionCookies() });
      }),
    );
    const { args, api } = routeArgs('/login', {
      form: {
        email: 'mai@example.com',
        password: 'matkhau123',
        rememberMe: 'on',
        redirectTo: '/app/classes',
      },
    });
    const response = (await loginAction(args)) as Response;
    expect(body).toEqual({ email: 'mai@example.com', password: 'matkhau123', rememberMe: true });
    expect(response.headers.get('Location')).toBe('/app/classes');
    expect(api.responseCookies()).toHaveLength(2);
  });

  it('ignores an external redirectTo (open redirect)', async () => {
    server.use(http.post(`${API}/api/v1/auth/login`, () => HttpResponse.json(session)));
    const { args } = routeArgs('/login', {
      form: { email: 'a@b.vn', password: 'x', redirectTo: 'https://evil.example' },
    });
    expect(((await loginAction(args)) as Response).headers.get('Location')).toBe('/app');
  });

  it('shows a general error for wrong credentials, keeping the email but not the password', async () => {
    server.use(
      http.post(`${API}/api/v1/auth/login`, () =>
        apiError(401, { code: 'invalid_credentials', message: 'Invalid' }),
      ),
    );
    const { args } = routeArgs('/login', { form: { email: 'mai@example.com', password: 'sai' } });
    expect(payload(await loginAction(args))).toEqual({
      ok: false,
      fieldErrors: {},
      values: { email: 'mai@example.com' },
      formError: { key: 'errors.invalid_credentials' },
    });
  });

  it('tells how long to wait when login is rate limited', async () => {
    server.use(
      http.post(`${API}/api/v1/auth/login`, () =>
        apiError(429, {
          code: 'rate_limited',
          message: 'Too many',
          meta: { retryAfterSeconds: 600 },
        }),
      ),
    );
    const { args } = routeArgs('/login', { form: { email: 'a@b.vn', password: 'x' } });
    expect(payload(await loginAction(args)).formError).toEqual({
      key: 'auth.retryAfterMinutes',
      values: { minutes: 10 },
    });
  });

  it('opens the code screen when the email is not verified yet', async () => {
    server.use(
      http.post(`${API}/api/v1/auth/login`, () =>
        apiError(403, { code: 'email_not_verified', message: 'Not verified' }),
      ),
    );
    const { args } = routeArgs('/login', { form: { email: 'mai@example.com', password: 'x' } });
    const result = (await loginAction(args)) as {
      data: object;
      init: { headers: Record<string, string> };
    };
    expect(result.data).toMatchObject({ needsVerification: true });
    expect(result.init.headers['Set-Cookie']).toMatch(/^tps_pending_verification=/);
  });

  it('sends a signed-in user straight to their home page', async () => {
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json({ ...user, roles: ['admin'] })),
    );
    const { args } = routeArgs('/login', { cookie: 'tps_at=a' });
    const response = (await settle(loginLoader(args))) as Response;
    expect(response.headers.get('Location')).toBe('/admin');
  });
});

describe('register', () => {
  it('registers with the UI language and opens the code screen', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/auth/register`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { resendAfterSeconds: 45, expiresInSeconds: 600 },
          { status: 201 },
        );
      }),
    );
    const { args } = routeArgs('/register', {
      cookie: (await serializePreferences({ locale: 'en' }))[0]!.split(';')[0]!,
      form: {
        role: 'tutor',
        fullName: 'Trần Văn Bình',
        email: 'Binh@Example.com',
        phone: '',
        password: 'matkhau123',
        acceptTerms: 'on',
      },
    });
    const response = (await registerAction(args)) as Response;
    expect(body).toEqual({
      role: 'tutor',
      fullName: 'Trần Văn Bình',
      email: 'Binh@Example.com',
      password: 'matkhau123',
      locale: 'en',
      acceptTerms: true,
    });
    expect(response.headers.get('Location')).toBe('/verify-email');
    expect(response.headers.get('Set-Cookie')).toMatch(/^tps_pending_verification=/);
  });

  it('maps API field errors to the form fields (first error per field)', async () => {
    server.use(
      http.post(`${API}/api/v1/auth/register`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'Validation failed',
          details: [
            { path: 'password', code: 'password_too_short', message: 'x' },
            { path: 'password', code: 'password_needs_letter_and_digit', message: 'x' },
            { path: 'acceptTerms', code: 'must_accept_terms', message: 'x' },
          ],
        }),
      ),
    );
    const { args } = routeArgs('/register', {
      form: { role: 'parent', fullName: 'Mai', email: 'mai@example.com', password: 'short' },
    });
    const result = payload(await registerAction(args));
    expect(result.fieldErrors).toEqual({
      password: { key: 'validation.password_too_short' },
      acceptTerms: { key: 'validation.must_accept_terms' },
    });
    expect(result.values).toEqual({
      role: 'parent',
      fullName: 'Mai',
      email: 'mai@example.com',
      phone: '',
    });
  });

  it('shows email_taken under the email field', async () => {
    server.use(
      http.post(`${API}/api/v1/auth/register`, () =>
        apiError(409, { code: 'email_taken', message: 'Taken' }),
      ),
    );
    const { args } = routeArgs('/register', { form: { email: 'mai@example.com' } });
    expect(payload(await registerAction(args)).fieldErrors).toEqual({
      email: { key: 'errors.email_taken' },
    });
  });
});

describe('verify-email', () => {
  it('verifies the code, signs in and clears the pending email', async () => {
    server.use(
      http.post(`${API}/api/v1/auth/email-verification/confirm`, () =>
        HttpResponse.json(session, { headers: sessionCookies() }),
      ),
    );
    const { args, api } = routeArgs('/verify-email', {
      form: { intent: 'verify', email: 'mai@example.com', code: '123456' },
    });
    const result = (await verifyAction(args)) as {
      data: object;
      init: { headers: Record<string, string> };
    };
    // Phụ huynh: bước tiếp theo là tạo hồ sơ con.
    expect(result.data).toEqual({
      status: 'verified',
      homePath: '/app/children/new',
      isTutor: false,
    });
    expect(result.init.headers['Set-Cookie']).toMatch(/^tps_pending_verification=;.*Max-Age=0/);
    expect(api.responseCookies()).toHaveLength(2);
  });

  it('shows the attempts left on a wrong code', async () => {
    server.use(
      http.post(`${API}/api/v1/auth/email-verification/confirm`, () =>
        apiError(400, { code: 'invalid_code', message: 'Invalid', meta: { attemptsLeft: 3 } }),
      ),
    );
    const { args } = routeArgs('/verify-email', {
      form: { intent: 'verify', email: 'mai@example.com', code: '000000' },
    });
    expect(payload(await verifyAction(args)).fieldErrors).toEqual({
      code: { key: 'verifyEmail.wrongCode', values: { count: 3 } },
    });
  });

  it('resends the code and restarts the 45-second wait; inside the wait it only shows the countdown', async () => {
    server.use(
      http.post(`${API}/api/v1/auth/email-verification/resend`, () =>
        HttpResponse.json({ resendAfterSeconds: 45, expiresInSeconds: 600 }, { status: 202 }),
      ),
    );
    const sent = routeArgs('/verify-email', {
      form: { intent: 'resend', email: 'mai@example.com' },
    });
    expect(payload(await verifyAction(sent.args))).toEqual({
      status: 'resent',
      email: 'mai@example.com',
      resendAfterSeconds: 45,
    });

    server.use(
      http.post(`${API}/api/v1/auth/email-verification/resend`, () =>
        apiError(429, { code: 'rate_limited', message: 'Wait', meta: { retryAfterSeconds: 30 } }),
      ),
    );
    const early = routeArgs('/verify-email', {
      form: { intent: 'resend', email: 'mai@example.com' },
    });
    const result = payload(await verifyAction(early.args));
    expect(result).toMatchObject({ status: 'failed', resendAfterSeconds: 30 });
    expect(result.formError).toBeUndefined();
  });
});

describe('forgot-password', () => {
  it('asks for a code, then resets the password', async () => {
    server.use(
      http.post(`${API}/api/v1/auth/password-reset/request`, () =>
        HttpResponse.json({ resendAfterSeconds: 45, expiresInSeconds: 600 }, { status: 202 }),
      ),
      http.post(
        `${API}/api/v1/auth/password-reset/confirm`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const step1 = routeArgs('/forgot-password', {
      form: { intent: 'request', email: 'Mai@Example.com' },
    });
    expect(payload(await forgotAction(step1.args))).toMatchObject({
      step: 'reset',
      email: 'mai@example.com',
    });

    const step2 = routeArgs('/forgot-password', {
      form: {
        intent: 'reset',
        email: 'mai@example.com',
        code: '123456',
        newPassword: 'matkhaumoi1',
        confirmPassword: 'matkhaumoi1',
      },
    });
    expect(payload(await forgotAction(step2.args))).toEqual({ step: 'done' });
  });

  it('checks that the two new passwords match before calling the API', async () => {
    const { args } = routeArgs('/forgot-password', {
      form: {
        intent: 'reset',
        email: 'mai@example.com',
        code: '123456',
        newPassword: 'matkhaumoi1',
        confirmPassword: 'khac123456',
      },
    });
    expect(payload(await forgotAction(args)).fieldErrors).toEqual({
      confirmPassword: { key: 'validation.password_mismatch' },
    });
  });
});

describe('logout', () => {
  it('revokes the session at the API and goes home', async () => {
    let called = false;
    server.use(
      http.post(`${API}/api/v1/auth/logout`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { args } = routeArgs('/logout', { method: 'POST', cookie: 'tps_rt=r' });
    const response = await logoutAction(args);
    expect(called).toBe(true);
    expect(response.headers.get('Location')).toBe('/');
  });
});
