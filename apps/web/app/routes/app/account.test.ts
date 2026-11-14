// @vitest-environment node
// Trang Tài khoản và cài đặt: dữ liệu theo vai trò, mỗi form (intent) gửi đúng API, lỗi API thành lỗi theo
// ô / lỗi chung; route đổi ảnh đại diện (JSON).
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  accountProfile,
  apiError,
  payload,
  SESSION,
  signIn,
  thrownStatus,
} from '../../../test/api-fixtures';
import { API, server } from '../../../test/msw-server';
import { routeArgs, settle } from '../../../test/route-args';
import { action as avatarAction } from './account-avatar';
import { action, loader } from './account';

const session = (current: boolean, userAgent: string | null) => ({
  id: current ? '0193a1b2-0000-7000-8000-0000000000c1' : '0193a1b2-0000-7000-8000-0000000000c2',
  userAgent,
  ipAddress: null,
  lastActiveAt: '2026-11-14T08:00:00.000Z',
  current,
});

function mockAccount(roles: string[]) {
  signIn(roles);
  server.use(
    http.get(`${API}/api/v1/me`, () => HttpResponse.json(accountProfile({ roles }))),
    http.get(`${API}/api/v1/auth/sessions`, () =>
      HttpResponse.json({ items: [session(true, 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0')] }),
    ),
    http.get(`${API}/api/v1/me/parent-profile`, () =>
      HttpResponse.json({ provinceId: 1, communeId: 10, addressLine: null, updatedAt: null }),
    ),
  );
}

const post = (form: Record<string, string>) =>
  routeArgs('/app/account', { cookie: SESSION, form }).args;

describe('account loader', () => {
  it('gives parents their area as well as account details and devices', async () => {
    mockAccount(['parent']);
    const result = payload(await loader(routeArgs('/app/account', { cookie: SESSION }).args));
    expect(result.account).toMatchObject({ email: 'mai@example.com' });
    expect(result.sessions).toHaveLength(1);
    expect(result.area).toMatchObject({
      profile: { provinceId: 1 },
      communes: [{ id: 10, label: 'Phường Ba Đình' }],
    });
  });

  it('has no area section for tutors', async () => {
    mockAccount(['tutor']);
    const result = payload(await loader(routeArgs('/app/account', { cookie: SESSION }).args));
    expect(result.area).toBeNull();
  });
});

describe('personal details', () => {
  it('saves display name, full name and phone; an empty phone clears it', async () => {
    mockAccount(['parent']);
    let body: unknown;
    server.use(
      http.patch(`${API}/api/v1/me`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(accountProfile());
      }),
    );
    const result = payload(
      await action(
        post({ intent: 'profile', displayName: 'Mai', fullName: 'Nguyễn Mai', phone: '' }),
      ),
    );
    expect(result).toEqual({ intent: 'profile', ok: true });
    expect(body).toEqual({ displayName: 'Mai', fullName: 'Nguyễn Mai', phone: '' });
  });

  it('does not send the full name when the field is locked (not in the form)', async () => {
    mockAccount(['tutor']);
    let body: unknown;
    server.use(
      http.patch(`${API}/api/v1/me`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(accountProfile());
      }),
    );
    await action(post({ intent: 'profile', displayName: 'Thầy A', phone: '0912345678' }));
    expect(body).toEqual({ displayName: 'Thầy A', phone: '0912345678' });
  });

  it('shows the phone error next to the phone field and keeps what was typed', async () => {
    mockAccount(['parent']);
    server.use(
      http.patch(`${API}/api/v1/me`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'Invalid',
          details: [{ path: 'phone', code: 'invalid_phone', message: 'x' }],
        }),
      ),
    );
    const result = payload(
      await action(post({ intent: 'profile', displayName: 'Mai', fullName: '', phone: '12' })),
    );
    expect(result).toMatchObject({
      intent: 'profile',
      ok: false,
      fieldErrors: { phone: { key: 'validation.invalid_phone' } },
      values: { phone: '12' },
    });
  });
});

describe('where you live', () => {
  it('replaces the parent profile', async () => {
    mockAccount(['parent']);
    let body: unknown;
    server.use(
      http.put(`${API}/api/v1/me/parent-profile`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          provinceId: 1,
          communeId: null,
          addressLine: '',
          updatedAt: null,
        });
      }),
    );
    const result = payload(
      await action(post({ intent: 'area', provinceId: '1', communeId: '', addressLine: '' })),
    );
    expect(result).toEqual({ intent: 'area', ok: true });
    expect(body).toEqual({ provinceId: 1, communeId: null, addressLine: '' });
  });

  it('keeps the communes of the chosen province when the commune is rejected', async () => {
    mockAccount(['parent']);
    server.use(
      http.put(`${API}/api/v1/me/parent-profile`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'Invalid',
          details: [{ path: 'communeId', code: 'commune_not_in_province', message: 'x' }],
        }),
      ),
    );
    const result = payload(
      await action(post({ intent: 'area', provinceId: '1', communeId: '99', addressLine: '' })),
    );
    expect(result.fieldErrors).toEqual({
      communeId: { key: 'validation.commune_not_in_province' },
    });
    expect(result.communes).toEqual([{ id: 10, label: 'Phường Ba Đình' }]);
  });

  it('is not available to tutors', async () => {
    mockAccount(['tutor']);
    const thrown = await settle(
      action(post({ intent: 'area', provinceId: '1', communeId: '', addressLine: '' })),
    );
    expect(thrownStatus(thrown)).toBe(404);
  });
});

describe('security', () => {
  it('changes the password', async () => {
    mockAccount(['parent']);
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/auth/password/change`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const result = payload(
      await action(
        post({ intent: 'password', currentPassword: 'cu12345678', newPassword: 'moi12345678' }),
      ),
    );
    expect(result).toEqual({ intent: 'password', ok: true });
    expect(body).toEqual({ currentPassword: 'cu12345678', newPassword: 'moi12345678' });
  });

  it('marks a wrong current password on its field', async () => {
    mockAccount(['parent']);
    server.use(
      http.post(`${API}/api/v1/auth/password/change`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'Wrong',
          details: [{ path: 'currentPassword', code: 'wrong_password', message: 'x' }],
        }),
      ),
    );
    const result = payload(
      await action(
        post({ intent: 'password', currentPassword: 'sai', newPassword: 'moi12345678' }),
      ),
    );
    expect(result).toEqual({
      intent: 'password',
      ok: false,
      fieldErrors: { currentPassword: { key: 'validation.wrong_password' } },
    });
  });

  it('signs out other devices', async () => {
    mockAccount(['student']);
    let called = false;
    server.use(
      http.post(`${API}/api/v1/auth/sessions/revoke-others`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    expect(payload(await action(post({ intent: 'revoke-sessions' })))).toEqual({
      intent: 'revoke-sessions',
      ok: true,
    });
    expect(called).toBe(true);
  });

  it('explains a rate limit when signing out other devices fails', async () => {
    mockAccount(['parent']);
    server.use(
      http.post(`${API}/api/v1/auth/sessions/revoke-others`, () =>
        apiError(429, { code: 'rate_limited', message: 'Slow down' }),
      ),
    );
    expect(payload(await action(post({ intent: 'revoke-sessions' })))).toMatchObject({
      ok: false,
      formError: { key: 'errors.rate_limited' },
    });
  });
});

describe('avatar', () => {
  it('removes the avatar', async () => {
    mockAccount(['parent']);
    let called = false;
    server.use(
      http.delete(`${API}/api/v1/me/avatar`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    expect(payload(await action(post({ intent: 'avatar-remove' })))).toEqual({
      intent: 'avatar-remove',
      ok: true,
    });
    expect(called).toBe(true);
  });

  it('asks the API for an upload ticket for an avatar', async () => {
    mockAccount(['parent']);
    let body: unknown;
    const ticket = {
      bucket: 'public',
      storageKey: 'avatars/x.png',
      uploadUrl: 'http://127.0.0.1:8333/tps-public/avatars/x.png?sig=1',
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      expiresAt: '2026-11-14T08:10:00.000Z',
      fileId: '0193a1b2-0000-7000-8000-0000000000f1',
    };
    server.use(
      http.post(`${API}/api/v1/files/uploads`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(ticket, { status: 201 });
      }),
    );
    const { args } = routeArgs('/app/account/avatar', {
      cookie: SESSION,
      json: { step: 'ticket', fileName: 'me.png', contentType: 'image/png', sizeBytes: 2048 },
    });
    const response = await avatarAction(args);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(ticket);
    expect(body).toEqual({
      purpose: 'avatar',
      fileName: 'me.png',
      contentType: 'image/png',
      sizeBytes: 2048,
    });
  });

  it('sets the uploaded file as avatar and returns its URL', async () => {
    mockAccount(['parent']);
    server.use(
      http.put(`${API}/api/v1/me/avatar`, () =>
        HttpResponse.json(accountProfile({ avatarUrl: 'http://cdn.test/avatars/x.png' })),
      ),
    );
    const { args } = routeArgs('/app/account/avatar', {
      cookie: SESSION,
      json: { step: 'set', fileId: '0193a1b2-0000-7000-8000-0000000000f1' },
    });
    const response = await avatarAction(args);
    expect(await response.json()).toEqual({ avatarUrl: 'http://cdn.test/avatars/x.png' });
  });

  it('turns a file rule error into its message', async () => {
    mockAccount(['parent']);
    server.use(
      http.post(`${API}/api/v1/files/uploads`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'Too large',
          details: [{ path: 'sizeBytes', code: 'file_too_large', message: 'x' }],
        }),
      ),
    );
    const { args } = routeArgs('/app/account/avatar', {
      cookie: SESSION,
      json: { step: 'ticket', fileName: 'big.png', contentType: 'image/png', sizeBytes: 9e9 },
    });
    const response = await avatarAction(args);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ message: { key: 'validation.file_too_large' } });
  });

  it('rejects a malformed request without calling the API', async () => {
    mockAccount(['parent']);
    const { args } = routeArgs('/app/account/avatar', { cookie: SESSION, json: { step: 'nope' } });
    const response = await avatarAction(args);
    expect(response.status).toBe(400);
  });
});
