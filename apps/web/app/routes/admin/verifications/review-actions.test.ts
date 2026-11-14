// @vitest-environment node
// Loader/action của hàng chờ và màn duyệt xác minh (G3 đợt 2): chỉ Manager, lọc theo loại, xem ảnh (URL tạm),
// duyệt về hàng chờ đúng bộ lọc, lỗi lý do từ chối về đúng ô.
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, payload, SESSION, signIn, thrownStatus } from '../../../../test/api-fixtures';
import { API, server } from '../../../../test/msw-server';
import { routeArgs, settle } from '../../../../test/route-args';
import { action as detailAction } from './detail';
import { loader as queueLoader } from './queue';

const REQUEST_ID = '0193a1b2-0000-7000-8000-0000000000e1';
const DOCUMENT_ID = '0193a1b2-0000-7000-8000-0000000000f1';

const emptyQueue = {
  items: [],
  counts: { all: 0, identity: 0, credential: 0 },
  page: 1,
  pageSize: 20,
  total: 0,
};

const reviewDetail = {
  id: REQUEST_ID,
  kind: 'identity',
  status: 'approved',
  submittedAt: '2026-11-13T13:40:00.000Z',
  reviewDueAt: '2026-11-17T16:59:59.999Z',
  reviewedAt: '2026-11-14T03:00:00.000Z',
  rejectionCode: null,
  rejectionNote: null,
  attempt: 1,
  tutor: {
    id: '0193a1b2-0000-7000-8000-000000000002',
    fullName: 'Trần Thị B',
    displayName: 'Cô B',
    occupation: 'teacher',
    institution: null,
  },
  credential: null,
  documents: [],
  history: [],
  isOwnRequest: false,
};

describe('verification queue', () => {
  it('is only for managers', async () => {
    signIn(['admin']);
    const thrown = await settle(
      queueLoader(routeArgs('/admin/verifications', { cookie: SESSION }).args),
    );
    expect(thrownStatus(thrown)).toBe(404);
  });

  it('passes the kind filter and the page to the API, ignoring unknown kinds', async () => {
    signIn(['manager']);
    const seen: string[] = [];
    server.use(
      http.get(`${API}/api/v1/admin/verification-requests`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json(emptyQueue);
      }),
    );
    const result = payload(
      await queueLoader(
        routeArgs('/admin/verifications?kind=credential&page=2&done=approved', {
          cookie: SESSION,
        }).args,
      ),
    );
    expect(result).toMatchObject({ kind: 'credential', done: 'approved' });
    await queueLoader(routeArgs('/admin/verifications?kind=oops', { cookie: SESSION }).args);
    expect(seen).toEqual(['?page=2&kind=credential', '?page=1']);
  });
});

describe('verification review actions', () => {
  const args = (form: Record<string, string>) =>
    routeArgs(`/admin/verifications/${REQUEST_ID}`, {
      cookie: SESSION,
      form,
      params: { requestId: REQUEST_ID },
    }).args;

  it('asks for a short-lived link to view a document', async () => {
    signIn(['manager']);
    server.use(
      http.post(
        `${API}/api/v1/admin/verification-requests/:id/documents/:documentId/view`,
        ({ params }) => {
          expect(params).toMatchObject({ id: REQUEST_ID, documentId: DOCUMENT_ID });
          return HttpResponse.json({
            url: 'http://storage.test/private/a.jpg?sig=1',
            mimeType: 'image/jpeg',
            expiresAt: '2026-11-14T03:02:00.000Z',
          });
        },
      ),
    );
    expect(payload(await detailAction(args({ intent: 'view', documentId: DOCUMENT_ID })))).toEqual({
      intent: 'view',
      ok: true,
      documentId: DOCUMENT_ID,
      view: {
        url: 'http://storage.test/private/a.jpg?sig=1',
        mimeType: 'image/jpeg',
        expiresAt: '2026-11-14T03:02:00.000Z',
      },
    });
  });

  it('approves and goes back to the queue with the same filter', async () => {
    signIn(['manager']);
    server.use(
      http.post(`${API}/api/v1/admin/verification-requests/:id/approve`, () =>
        HttpResponse.json(reviewDetail),
      ),
    );
    const response = (await detailAction(
      args({ intent: 'approve', kind: 'identity' }),
    )) as Response;
    expect(response.headers.get('Location')).toBe(
      '/admin/verifications?kind=identity&done=approved',
    );
  });

  it('puts a missing rejection note on its field and keeps the values', async () => {
    signIn(['manager']);
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/admin/verification-requests/:id/reject`, async ({ request }) => {
        body = await request.json();
        return apiError(422, {
          code: 'validation_failed',
          message: 'Invalid',
          details: [{ path: 'rejectionNote', code: 'required', message: 'x' }],
        });
      }),
    );
    const result = payload(
      await detailAction(args({ intent: 'reject', rejectionCode: 'other', rejectionNote: '' })),
    );
    expect(body).toEqual({ rejectionCode: 'other', rejectionNote: '' });
    expect(result).toMatchObject({
      intent: 'reject',
      ok: false,
      fieldErrors: { rejectionNote: { key: 'validation.required' } },
      values: { rejectionCode: 'other', rejectionNote: '' },
    });
  });

  it('explains a request that was already handled', async () => {
    signIn(['manager']);
    server.use(
      http.post(`${API}/api/v1/admin/verification-requests/:id/approve`, () =>
        apiError(409, { code: 'invalid_state_transition', message: 'Not pending' }),
      ),
    );
    expect(payload(await detailAction(args({ intent: 'approve' })))).toEqual({
      intent: 'approve',
      ok: false,
      fieldErrors: {},
      formError: { key: 'errors.invalid_state_transition' },
    });
  });
});
