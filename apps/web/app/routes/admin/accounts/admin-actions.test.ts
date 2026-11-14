// @vitest-environment node
// Loader/action của khu Admin (G3 đợt 3): chỉ Admin; lọc tài khoản; thêm Manager; khóa giữ bộ lọc; lỗi về đúng
// ô; danh mục thêm / bật tắt; /admin chuyển theo vai trò.
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  accountDetail,
  apiError,
  payload,
  SESSION,
  signIn,
  thrownStatus,
} from '../../../../test/api-fixtures';
import { API, server } from '../../../../test/msw-server';
import { routeArgs, settle } from '../../../../test/route-args';
import { action as catalogAction } from '../catalog/index';
import { loader as homeLoader } from '../home';
import { action as detailAction } from './detail';
import { action as listAction, loader as listLoader } from './list';

const USER_ID = '0193a1b2-0000-7000-8000-000000000009';

describe('admin area', () => {
  it('sends admins to accounts and managers to the verification queue', async () => {
    signIn(['admin']);
    let thrown = await settle(homeLoader(routeArgs('/admin', { cookie: SESSION }).args));
    expect((thrown as Response).headers.get('Location')).toBe('/admin/accounts');
    signIn(['manager']);
    thrown = await settle(homeLoader(routeArgs('/admin', { cookie: SESSION }).args));
    expect((thrown as Response).headers.get('Location')).toBe('/admin/verifications');
  });

  it('keeps managers out of the account pages', async () => {
    signIn(['manager']);
    const thrown = await settle(listLoader(routeArgs('/admin/accounts', { cookie: SESSION }).args));
    expect(thrownStatus(thrown)).toBe(404);
  });

  it('passes only known filters to the API', async () => {
    signIn(['admin']);
    let seen = '';
    server.use(
      http.get(`${API}/api/v1/admin/accounts`, ({ request }) => {
        seen = new URL(request.url).search;
        return HttpResponse.json({ items: [], page: 1, pageSize: 20, total: 0 });
      }),
    );
    const result = payload(
      await listLoader(
        routeArgs('/admin/accounts?q=giang&role=tutor&status=oops&add=manager', {
          cookie: SESSION,
        }).args,
      ),
    );
    expect(seen).toBe('?page=1&q=giang&role=tutor');
    expect(result).toMatchObject({
      adding: true,
      filters: { q: 'giang', role: 'tutor', status: '' },
    });
  });

  it('grants the manager role and opens the account; a new account needs a name', async () => {
    signIn(['admin']);
    server.use(
      http.post(`${API}/api/v1/admin/managers`, async ({ request }) => {
        const body = (await request.json()) as { email: string; fullName: string };
        if (!body.fullName) {
          return apiError(422, {
            code: 'validation_failed',
            message: 'Invalid',
            details: [{ path: 'fullName', code: 'required', message: 'x' }],
          });
        }
        return HttpResponse.json(accountDetail({ roles: ['manager'], emailVerified: false }), {
          status: 201,
        });
      }),
    );
    const args = (form: Record<string, string>) =>
      routeArgs('/admin/accounts?add=manager', { cookie: SESSION, form }).args;
    expect(
      payload(await listAction(args({ intent: 'grant-manager', email: 'new@x.vn', fullName: '' }))),
    ).toMatchObject({ fieldErrors: { fullName: { key: 'validation.required' } } });
    const response = (await listAction(
      args({ intent: 'grant-manager', email: 'new@x.vn', fullName: 'Trần Hà' }),
    )) as Response;
    expect(response.headers.get('Location')).toBe(`/admin/accounts/${USER_ID}?notice=grantedNew`);
  });

  it('locks with a reason and comes back to the account with the list filters kept', async () => {
    signIn(['admin']);
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/admin/accounts/:id/lock`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(accountDetail({ status: 'locked' }));
      }),
    );
    const { args } = routeArgs(`/admin/accounts/${USER_ID}`, {
      cookie: SESSION,
      params: { userId: USER_ID },
      form: { intent: 'lock', reason: 'Báo cáo #R-1042', search: 'q=hoang' },
    });
    const response = (await detailAction(args)) as Response;
    expect(body).toEqual({ reason: 'Báo cáo #R-1042' });
    expect(response.headers.get('Location')).toBe(
      `/admin/accounts/${USER_ID}?q=hoang&notice=locked`,
    );
  });

  it('explains why another admin cannot be locked', async () => {
    signIn(['admin']);
    server.use(
      http.post(`${API}/api/v1/admin/accounts/:id/lock`, () =>
        apiError(403, { code: 'forbidden', message: 'Admin' }),
      ),
    );
    const { args } = routeArgs(`/admin/accounts/${USER_ID}`, {
      cookie: SESSION,
      params: { userId: USER_ID },
      form: { intent: 'lock', reason: 'x' },
    });
    expect(payload(await detailAction(args))).toMatchObject({
      formError: { key: 'errors.forbidden' },
      values: { reason: 'x' },
    });
  });
});

describe('admin catalog actions', () => {
  it('adds a grade level with its stage and turns a subject off', async () => {
    signIn(['admin']);
    const bodies: unknown[] = [];
    const subject = {
      id: 7,
      code: 'tin_hoc',
      nameVi: 'Tin học',
      nameEn: 'Computer Science',
      sortOrder: 70,
      isActive: false,
      tutorCount: 3,
    };
    server.use(
      http.post(`${API}/api/v1/admin/catalog/grade-levels`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(
          { ...subject, id: 20, code: 'lop_nang_cao', stage: 'other' },
          { status: 201 },
        );
      }),
      http.patch(`${API}/api/v1/admin/catalog/subjects/:id`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(subject);
      }),
    );
    const args = (form: Record<string, string>) =>
      routeArgs('/admin/catalog', { cookie: SESSION, form }).args;
    let response = (await catalogAction(
      args({
        intent: 'save',
        tab: 'grades',
        code: 'lop_nang_cao',
        stage: 'other',
        nameVi: 'Lớp nâng cao',
        nameEn: 'Advanced',
        sortOrder: '',
      }),
    )) as Response;
    expect(response.headers.get('Location')).toBe('/admin/catalog?tab=grades&saved=1');
    response = (await catalogAction(
      args({ intent: 'toggle', tab: 'subjects', id: '7', isActive: 'false' }),
    )) as Response;
    expect(response.headers.get('Location')).toBe('/admin/catalog?tab=subjects&saved=1');
    expect(bodies).toEqual([
      { code: 'lop_nang_cao', stage: 'other', nameVi: 'Lớp nâng cao', nameEn: 'Advanced' },
      { isActive: false },
    ]);
  });

  it('puts a taken code on the code field', async () => {
    signIn(['admin']);
    server.use(
      http.post(`${API}/api/v1/admin/catalog/subjects`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'Invalid',
          details: [{ path: 'code', code: 'catalog_code_taken', message: 'x' }],
        }),
      ),
    );
    const { args } = routeArgs('/admin/catalog', {
      cookie: SESSION,
      form: { intent: 'save', tab: 'subjects', code: 'math', nameVi: 'Toán', nameEn: 'Math' },
    });
    expect(payload(await catalogAction(args))).toMatchObject({
      fieldErrors: { code: { key: 'validation.catalog_code_taken' } },
      values: { code: 'math' },
    });
  });
});
