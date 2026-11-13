// @vitest-environment node
// Loader/action của các trang phụ huynh (G2 đợt 2), gọi trực tiếp với API giả (msw): gửi đúng dữ liệu tới
// API, chuyển hướng đúng chỗ, đổi lỗi API thành lỗi theo ô / lỗi chung, chặn người không phải phụ huynh.
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, server } from '../../../../test/msw-server';
import { routeArgs, settle } from '../../../../test/route-args';
import { action as accountAction } from '../account';
import { action as detailAction, loader as detailLoader } from './detail';
import { action as inviteAction } from './invite';
import { action as newAction, loader as newLoader } from './new';

const LEARNER_ID = '0193a1b2-0000-7000-8000-0000000000aa';
const SESSION = 'tps_at=access';

const me = (roles: string[]) => ({
  id: '0193a1b2-0000-7000-8000-000000000001',
  email: 'mai@example.com',
  displayName: 'Mai',
  fullName: 'Nguyễn Thị Mai',
  phone: null,
  locale: 'vi',
  status: 'active',
  emailVerified: true,
  roles,
});

const learner = {
  id: LEARNER_ID,
  viewer: 'guardian',
  fullName: 'Nguyễn Đức Minh',
  nickname: 'Bé Minh',
  dateOfBirth: null,
  gradeLevelId: 8,
  schoolName: null,
  provinceId: 1,
  communeId: 10,
  addressLine: null,
  notes: null,
  relationship: 'mother',
  hasStudentAccount: false,
  pendingInvitation: null,
  createdAt: '2026-11-13T08:00:00.000Z',
  updatedAt: '2026-11-13T08:00:00.000Z',
};

const area = (id: number, name: string) => ({
  id,
  code: String(id),
  unitType: 'ward',
  name,
  fullName: `Phường ${name}`,
  nameEn: null,
});

const apiError = (status: number, error: object) => HttpResponse.json({ error }, { status });

/** Người đang đăng nhập (GET /auth/me) và danh mục mà các trang đọc. */
function signedInAs(roles: string[]) {
  server.use(
    http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(me(roles))),
    http.get(`${API}/api/v1/catalog/grade-levels`, () =>
      HttpResponse.json({
        items: [
          { id: 8, code: 'grade_8', stage: 'lower_secondary', nameVi: 'Lớp 8', nameEn: 'Grade 8' },
        ],
      }),
    ),
    http.get(`${API}/api/v1/catalog/provinces`, () =>
      HttpResponse.json({ items: [area(1, 'Hà Nội')] }),
    ),
    http.get(`${API}/api/v1/catalog/provinces/:id/communes`, () =>
      HttpResponse.json({ items: [area(10, 'Ba Đình')] }),
    ),
  );
}

/** Dữ liệu của `data(...)` trả về từ action. */
const payload = (result: unknown) => (result as { data: Record<string, unknown> }).data;
const status = (thrown: unknown) => (thrown as { init: { status: number } }).init.status;

const childForm = {
  nickname: 'Bé Minh',
  gradeLevelId: '8',
  provinceId: '1',
  communeId: '10',
  fullName: 'Nguyễn Đức Minh',
  relationship: 'mother',
  dateOfBirth: '',
  schoolName: '',
  addressLine: '',
  notes: '',
};

describe('create child profile', () => {
  it('sends the profile with consent, then opens the invitation page', async () => {
    signedInAs(['parent']);
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/learners`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(learner, { status: 201 });
      }),
    );
    const { args } = routeArgs('/app/children/new', {
      cookie: SESSION,
      // Ô ngày gửi dd/mm/yyyy (gõ tay được một chữ số); API nhận YYYY-MM-DD.
      form: { ...childForm, dateOfBirth: '5/9/2014', acceptChildDataProcessing: 'on' },
    });
    const response = (await newAction(args)) as Response;
    expect(body).toEqual({
      nickname: 'Bé Minh',
      gradeLevelId: 8,
      provinceId: 1,
      communeId: 10,
      fullName: 'Nguyễn Đức Minh',
      relationship: 'mother',
      dateOfBirth: '2014-09-05',
      schoolName: '',
      addressLine: '',
      notes: '',
      acceptChildDataProcessing: true,
    });
    expect(response.headers.get('Location')).toBe(`/app/children/${LEARNER_ID}/invite?created=1`);
  });

  it('shows field errors, keeps what was typed and the communes of the chosen province', async () => {
    signedInAs(['parent']);
    server.use(
      http.post(`${API}/api/v1/learners`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'Invalid',
          details: [
            { path: 'acceptChildDataProcessing', code: 'must_accept_child_data', message: 'x' },
            { path: 'gradeLevelId', code: 'required', message: 'x' },
          ],
        }),
      ),
    );
    const { args } = routeArgs('/app/children/new', {
      cookie: SESSION,
      form: { ...childForm, gradeLevelId: '' },
    });
    const result = payload(await newAction(args));
    expect(result.fieldErrors).toEqual({
      acceptChildDataProcessing: { key: 'validation.must_accept_child_data' },
      gradeLevelId: { key: 'validation.required' },
    });
    expect(result.formError).toBeUndefined();
    expect(result.values).toMatchObject({ nickname: 'Bé Minh', gradeLevelId: '' });
    expect(result.communes).toEqual([{ id: 10, label: 'Phường Ba Đình' }]);
  });

  it('is not found for a tutor', async () => {
    signedInAs(['tutor']);
    const { args } = routeArgs('/app/children/new', { cookie: SESSION });
    expect(status(await settle(newLoader(args)))).toBe(404);
  });

  it('sends a signed-out visitor to the login page', async () => {
    const { args } = routeArgs('/app/children/new');
    const response = (await settle(newLoader(args))) as Response;
    expect(response.headers.get('Location')).toBe('/login?redirectTo=%2Fapp%2Fchildren%2Fnew');
  });
});

describe('child profile page', () => {
  const params = { learnerId: LEARNER_ID };

  it('loads the profile with the communes of its province', async () => {
    signedInAs(['parent']);
    server.use(http.get(`${API}/api/v1/learners/:id`, () => HttpResponse.json(learner)));
    const { args } = routeArgs(`/app/children/${LEARNER_ID}`, { cookie: SESSION, params });
    const result = (await detailLoader(args)) as { learner: { id: string }; communes: unknown };
    expect(result.learner.id).toBe(LEARNER_ID);
    expect(result.communes).toEqual([{ id: 10, label: 'Phường Ba Đình' }]);
  });

  it('is not found when the API hides the profile (another parent’s child)', async () => {
    signedInAs(['parent']);
    server.use(
      http.get(`${API}/api/v1/learners/:id`, () =>
        apiError(404, { code: 'not_found', message: 'Learner not found' }),
      ),
    );
    const { args } = routeArgs(`/app/children/${LEARNER_ID}`, { cookie: SESSION, params });
    expect(status(await settle(detailLoader(args)))).toBe(404);
  });

  it('is not found for a malformed id, without calling the API', async () => {
    signedInAs(['parent']);
    const { args } = routeArgs('/app/children/abc', {
      cookie: SESSION,
      params: { learnerId: 'abc' },
    });
    expect(status(await settle(detailLoader(args)))).toBe(404);
  });

  it('saves changes with PATCH (cleared fields become null)', async () => {
    signedInAs(['parent']);
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${API}/api/v1/learners/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(learner);
      }),
    );
    const { args } = routeArgs(`/app/children/${LEARNER_ID}`, {
      cookie: SESSION,
      params,
      form: { ...childForm, provinceId: '', communeId: '', intent: 'save' },
    });
    expect(payload(await detailAction(args))).toEqual({ ok: true, saved: true });
    expect(body).toMatchObject({ provinceId: null, communeId: null, dateOfBirth: null });
  });

  it('deletes the profile and goes back to the overview', async () => {
    signedInAs(['parent']);
    let deleted = false;
    server.use(
      http.delete(`${API}/api/v1/learners/:id`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { args } = routeArgs(`/app/children/${LEARNER_ID}`, {
      cookie: SESSION,
      params,
      form: { intent: 'delete' },
    });
    const response = (await detailAction(args)) as Response;
    expect(deleted).toBe(true);
    expect(response.headers.get('Location')).toBe('/app?deleted=1');
  });

  it('explains why a profile with a student account cannot be deleted', async () => {
    signedInAs(['parent']);
    server.use(
      http.delete(`${API}/api/v1/learners/:id`, () =>
        apiError(409, { code: 'conflict', message: 'Has account' }),
      ),
    );
    const { args } = routeArgs(`/app/children/${LEARNER_ID}`, {
      cookie: SESSION,
      params,
      form: { intent: 'delete' },
    });
    expect(payload(await detailAction(args))).toEqual({
      ok: false,
      formError: { key: 'errors.conflict' },
    });
  });
});

describe('invite a child', () => {
  const params = { learnerId: LEARNER_ID };

  it('sends the invitation to the child’s email', async () => {
    signedInAs(['parent']);
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/learners/:id/invitation`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const { args } = routeArgs(`/app/children/${LEARNER_ID}/invite`, {
      cookie: SESSION,
      params,
      form: { intent: 'invite', email: ' Minh@Example.com ' },
    });
    expect(payload(await inviteAction(args))).toEqual({
      ok: true,
      done: 'sent',
      email: 'minh@example.com',
    });
    expect(body).toEqual({ email: ' Minh@Example.com ' });
  });

  it('says how long to wait when too many invitations were sent', async () => {
    signedInAs(['parent']);
    server.use(
      http.post(`${API}/api/v1/learners/:id/invitation`, () =>
        apiError(429, {
          code: 'rate_limited',
          message: 'Too many',
          meta: { retryAfterSeconds: 600 },
        }),
      ),
    );
    const { args } = routeArgs(`/app/children/${LEARNER_ID}/invite`, {
      cookie: SESSION,
      params,
      form: { intent: 'invite', email: 'minh@example.com' },
    });
    expect(payload(await inviteAction(args))).toMatchObject({
      ok: false,
      formError: { key: 'auth.retryAfterMinutes', values: { minutes: 10 } },
      values: { email: 'minh@example.com' },
    });
  });

  it('cancels the pending invitation', async () => {
    signedInAs(['parent']);
    let revoked = false;
    server.use(
      http.delete(`${API}/api/v1/learners/:id/invitation`, () => {
        revoked = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { args } = routeArgs(`/app/children/${LEARNER_ID}/invite`, {
      cookie: SESSION,
      params,
      form: { intent: 'revoke' },
    });
    expect(payload(await inviteAction(args))).toEqual({ ok: true, done: 'revoked' });
    expect(revoked).toBe(true);
  });

  it('is not found for a student', async () => {
    signedInAs(['student']);
    const { args } = routeArgs(`/app/children/${LEARNER_ID}/invite`, {
      cookie: SESSION,
      params,
      form: { intent: 'revoke' },
    });
    expect(status(await settle(inviteAction(args)))).toBe(404);
  });
});

describe('parent account', () => {
  it('replaces the parent profile with PUT', async () => {
    signedInAs(['parent']);
    let body: unknown;
    server.use(
      http.put(`${API}/api/v1/me/parent-profile`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          provinceId: 1,
          communeId: null,
          addressLine: null,
          updatedAt: '2026-11-13T08:00:00.000Z',
        });
      }),
    );
    const { args } = routeArgs('/app/account', {
      cookie: SESSION,
      form: { provinceId: '1', communeId: '', addressLine: '' },
    });
    expect(payload(await accountAction(args))).toEqual({ ok: true });
    expect(body).toEqual({ provinceId: 1, communeId: null, addressLine: '' });
  });

  it('shows the commune error on the commune field', async () => {
    signedInAs(['parent']);
    server.use(
      http.put(`${API}/api/v1/me/parent-profile`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'Invalid',
          details: [{ path: 'communeId', code: 'commune_not_in_province', message: 'x' }],
        }),
      ),
    );
    const { args } = routeArgs('/app/account', {
      cookie: SESSION,
      form: { provinceId: '1', communeId: '99', addressLine: '' },
    });
    const result = payload(await accountAction(args));
    expect(result.fieldErrors).toEqual({
      communeId: { key: 'validation.commune_not_in_province' },
    });
    expect(result.communes).toEqual([{ id: 10, label: 'Phường Ba Đình' }]);
  });
});
