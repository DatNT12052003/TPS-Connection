// @vitest-environment node
// Loader và action các trang marketplace (G4 đợt 3): bộ lọc đi đúng vào API, bộ lọc sai thành kết quả rỗng có thông
// báo, slug cũ chuyển hướng về slug đúng, lưu rồi đăng bài, gia sư chưa xác minh không gọi API tìm nhu cầu.
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  apiError,
  payload,
  SESSION,
  signIn,
  thrownStatus,
  tutorProfile,
} from '../../test/api-fixtures';
import { API, server } from '../../test/msw-server';
import { routeArgs, settle } from '../../test/route-args';
import { loader as findStudentsLoader } from './app/find-students';
import { action as myPostsAction } from './app/posts/index';
import { action as newPostAction } from './app/posts/new';
import { action as requestsAction } from './app/requests/index';
import { action as newRequestAction } from './app/requests/new';
import { loader as postDetailLoader } from './public/posts/detail';
import { loader as tutorDetailLoader } from './public/tutors/detail';
import { loader as tutorSearchLoader } from './public/tutors/search';

const TUTOR_ID = '0193a1b2-0000-7000-8000-0000000000aa';
const POST_ID = '0193a1b2-0000-7000-8000-0000000000bb';
const NOW = '2026-11-15T08:00:00.000Z';

const author = {
  id: TUTOR_ID,
  slug: 'thay-an-a1b2c3d4e5',
  displayName: 'Thầy An',
  avatarUrl: null,
  hasVerifiedDegree: false,
  ratingAvg: null,
  ratingCount: 0,
};

const publicTutor = {
  ...tutorProfile(),
  id: TUTOR_ID,
  slug: author.slug,
  displayName: 'Thầy An',
  avatarUrl: null,
  identityVerified: true,
  credentials: [],
  ratingAvg: null,
  ratingCount: 0,
};

const ownPost = (overrides: Record<string, unknown> = {}) => ({
  id: POST_ID,
  title: 'Toán 9',
  description: 'Luyện thi',
  teachingMode: 'online',
  rate: null,
  capacity: null,
  availableFrom: null,
  subjects: [{ subjectId: 1, gradeLevelId: 8 }],
  areaIds: [],
  slots: [],
  status: 'draft',
  moderationHidden: false,
  viewCount: 0,
  publishedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const emptyList = { items: [], page: 1, pageSize: 20, total: 0 };

describe('tutor search page', () => {
  it('sends the filters to the API, splitting the rate preset', async () => {
    signIn([]);
    let apiUrl: URL | undefined;
    server.use(
      http.get(`${API}/api/v1/tutors`, ({ request }) => {
        apiUrl = new URL(request.url);
        return HttpResponse.json(emptyList);
      }),
    );
    const { args } = routeArgs(
      '/tutors?q=toan&subjectId=1&provinceId=1&rate=session%3A200000&verifiedDegree=true&junk=1',
    );
    const result = payload(await tutorSearchLoader(args));
    expect(Object.fromEntries(apiUrl!.searchParams)).toEqual({
      q: 'toan',
      subjectId: '1',
      provinceId: '1',
      verifiedDegree: 'true',
      rateUnit: 'session',
      maxRate: '200000',
    });
    expect(result).toMatchObject({ invalidFilters: false, communes: [{ id: 10 }] });
  });

  it('shows an empty result with a notice when the filters in the link are invalid', async () => {
    signIn([]);
    server.use(
      http.get(`${API}/api/v1/tutors`, () =>
        apiError(422, { code: 'validation_failed', message: 'x', details: [], requestId: 'r' }),
      ),
    );
    const { args } = routeArgs('/tutors?pageSize=999');
    expect(payload(await tutorSearchLoader(args))).toMatchObject({
      invalidFilters: true,
      result: { items: [], total: 0 },
    });
  });
});

describe('public tutor and post pages', () => {
  it('redirects an old slug or an id to the canonical slug', async () => {
    signIn([]);
    server.use(
      http.get(`${API}/api/v1/tutors/:ref`, () => HttpResponse.json(publicTutor)),
      http.get(`${API}/api/v1/tutor-posts`, () => HttpResponse.json(emptyList)),
    );
    const { args } = routeArgs('/tutors/ten-cu-a1b2c3d4e5', {
      params: { tutorRef: 'ten-cu-a1b2c3d4e5' },
    });
    const thrown = (await settle(tutorDetailLoader(args))) as Response;
    expect(thrown.status).toBe(301);
    expect(thrown.headers.get('Location')).toBe('/tutors/thay-an-a1b2c3d4e5');

    const ok = routeArgs('/tutors/thay-an-a1b2c3d4e5', { params: { tutorRef: author.slug } });
    expect(payload(await tutorDetailLoader(ok.args))).toMatchObject({ tutor: { id: TUTOR_ID } });
  });

  it('returns 404 for tutors and posts the API does not show', async () => {
    signIn([]);
    server.use(
      http.get(`${API}/api/v1/tutors/:ref`, () =>
        apiError(404, { code: 'not_found', message: 'x', requestId: 'r' }),
      ),
      http.get(`${API}/api/v1/tutor-posts/:ref`, () =>
        apiError(404, { code: 'not_found', message: 'x', requestId: 'r' }),
      ),
    );
    const tutor = routeArgs('/tutors/x', { params: { tutorRef: 'x' } });
    expect(thrownStatus(await settle(tutorDetailLoader(tutor.args)))).toBe(404);
    const post = routeArgs('/tutor-posts/x', { params: { postRef: 'x' } });
    expect(thrownStatus(await settle(postDetailLoader(post.args)))).toBe(404);
  });
});

describe('tutor post editor', () => {
  it('saves the draft, publishes it, and returns to the list', async () => {
    signIn(['tutor']);
    const calls: string[] = [];
    let created: unknown;
    server.use(
      http.post(`${API}/api/v1/me/tutor-posts`, async ({ request }) => {
        calls.push('create');
        created = await request.json();
        return HttpResponse.json(ownPost(), { status: 201 });
      }),
      http.post(`${API}/api/v1/me/tutor-posts/:id/status`, async ({ request }) => {
        calls.push(`status:${((await request.json()) as { status: string }).status}`);
        return HttpResponse.json(ownPost({ status: 'open', publishedAt: NOW }));
      }),
    );
    const { args } = routeArgs('/app/posts/new', {
      cookie: SESSION,
      form: {
        intent: 'publish',
        title: 'Toán 9',
        description: 'Luyện thi',
        teachingMode: 'online',
        rateAmount: '200.000',
        rateUnit: 'session',
        capacity: '',
        availableFrom: '',
        subjects: JSON.stringify([{ subjectId: 1, gradeLevelId: 8 }]),
        areaIds: '[]',
        slots: '[]',
      },
    });
    const response = (await settle(newPostAction(args))) as Response;
    expect(calls).toEqual(['create', 'status:open']);
    expect(created).toMatchObject({ rate: { amountVnd: 200_000, unit: 'session' } });
    expect(response.headers.get('Location')).toBe('/app/posts');
  });

  it('keeps the saved draft and explains why it could not be published', async () => {
    signIn(['tutor']);
    server.use(
      http.post(`${API}/api/v1/me/tutor-posts`, () =>
        HttpResponse.json(ownPost(), { status: 201 }),
      ),
      http.post(`${API}/api/v1/me/tutor-posts/:id/status`, () =>
        apiError(403, { code: 'tutor_not_verified', message: 'x', requestId: 'r' }),
      ),
    );
    const { args } = routeArgs('/app/posts/new', {
      cookie: SESSION,
      form: { intent: 'publish', title: 'Toán 9', description: 'x', subjects: '[]' },
    });
    const response = (await settle(newPostAction(args))) as Response;
    expect(response.headers.get('Location')).toBe(
      `/app/posts/${POST_ID}/edit?publish=tutor_not_verified`,
    );
  });

  it('shows field errors when saving fails validation', async () => {
    signIn(['tutor']);
    server.use(
      http.post(`${API}/api/v1/me/tutor-posts`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'x',
          requestId: 'r',
          details: [{ path: 'title', code: 'required', message: 'x' }],
        }),
      ),
    );
    const { args } = routeArgs('/app/posts/new', {
      cookie: SESSION,
      form: { intent: 'save', title: '' },
    });
    expect(payload(await newPostAction(args))).toMatchObject({
      ok: false,
      fieldErrors: { title: { key: 'validation.required' } },
    });
  });

  it('copies a closed post as a new draft and opens it', async () => {
    signIn(['tutor']);
    const copyId = '0193a1b2-0000-7000-8000-0000000000cc';
    server.use(
      http.post(`${API}/api/v1/me/tutor-posts/:id/duplicate`, () =>
        HttpResponse.json(ownPost({ id: copyId }), { status: 201 }),
      ),
    );
    const { args } = routeArgs('/app/posts', {
      cookie: SESSION,
      form: { intent: 'duplicate', postId: POST_ID },
    });
    const response = (await settle(myPostsAction(args))) as Response;
    expect(response.headers.get('Location')).toBe(`/app/posts/${copyId}/edit?copied=1`);
  });
});

describe('find students', () => {
  it('does not search requests for a tutor who is not verified', async () => {
    signIn(['tutor']);
    let searched = false;
    server.use(
      http.get(`${API}/api/v1/me/tutor-profile`, () =>
        HttpResponse.json(tutorProfile({ profileStatus: 'incomplete', identityVerifiedAt: null })),
      ),
      http.get(`${API}/api/v1/request-posts`, () => {
        searched = true;
        return HttpResponse.json(emptyList);
      }),
    );
    const { args } = routeArgs('/app/find-students', { cookie: SESSION });
    expect(payload(await findStudentsLoader(args))).toMatchObject({ verified: false });
    expect(searched).toBe(false);
  });
});

describe('parent request posts', () => {
  it('closes a request with the chosen reason', async () => {
    signIn(['parent']);
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/me/request-posts/:id/status`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({});
      }),
    );
    const { args } = routeArgs('/app/requests', {
      cookie: SESSION,
      form: { intent: 'status', postId: POST_ID, status: 'closed', closedReason: 'other' },
    });
    // Schema của response không khớp ({}): chỉ cần body gửi đi đúng.
    await settle(requestsAction(args));
    expect(body).toEqual({ status: 'closed', closedReason: 'other' });
  });

  it('reports a child the parent no longer manages on the child field', async () => {
    signIn(['parent']);
    server.use(
      http.post(`${API}/api/v1/me/request-posts`, () =>
        apiError(404, { code: 'not_found', message: 'x', requestId: 'r' }),
      ),
    );
    const { args } = routeArgs('/app/requests/new', {
      cookie: SESSION,
      form: { intent: 'save', learnerId: POST_ID, subjectId: '1', gradeLevelId: '8' },
    });
    const result = payload(await newRequestAction(args));
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { learnerId: { key: 'validation.unknown_option' } },
    });
    expect(result).not.toHaveProperty('formError');
  });
});
