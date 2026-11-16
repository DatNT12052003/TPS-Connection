// Bài đăng marketplace (G4 đợt 1) qua HTTP (Supertest) với PostgreSQL thật (Testcontainers): bài tuyển học sinh của
// gia sư (B.2) và bài tìm gia sư của phụ huynh (B.3). Người dùng được tạo thẳng trong database và đăng nhập bằng
// access token ký sẵn.
//
// Việc chuyển từ G3 (ke_hoach_trien_khai.md): gia sư chưa được duyệt danh tính không đăng được bài (403); tài khoản bị
// khóa hoặc hạn chế không hiện công khai.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  Learner,
  OwnRequestPost,
  OwnRequestPostList,
  OwnTutorPost,
  OwnTutorPostList,
  PublicTutorPost,
  RequestPostForTutor,
  type Role,
} from '@tps/shared';
import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApp } from '../../src/app.js';
import { createDataSource } from '../../src/db/data-source.js';
import { createMemoryRateLimiter } from '../../src/lib/rate-limiter.js';
import type { AdminAccountsService } from '../../src/modules/admin/admin-accounts.service.js';
import type { AdminCatalogService } from '../../src/modules/admin/admin-catalog.service.js';
import type { AuthService } from '../../src/modules/auth/auth.service.js';
import { createTokenService } from '../../src/modules/auth/tokens.js';
import type { CatalogService } from '../../src/modules/catalog/catalog.service.js';
import { createLearnersService } from '../../src/modules/learners/learners.service.js';
import type { StudentInvitationsService } from '../../src/modules/learners/student-invitations.service.js';
import type { ParentsService } from '../../src/modules/parents/parents.service.js';
import { createRequestPostsService } from '../../src/modules/request-posts/request-posts.service.js';
import type { ConnectionsService } from '../../src/modules/connections/connections.service.js';
import { createTutorPostsService } from '../../src/modules/tutor-posts/tutor-posts.service.js';
import type { TutorsService } from '../../src/modules/tutors/tutors.service.js';
import type { AccountService } from '../../src/modules/users/account.service.js';
import { createUsersRepository } from '../../src/modules/users/users.repository.js';
import type { VerificationReviewService } from '../../src/modules/verification/verification-review.service.js';
import type { VerificationService } from '../../src/modules/verification/verification.service.js';
import { silentLogger, TEST_JWT_SECRET, TEST_ORIGIN, testEnv } from '../helpers.js';

jest.setTimeout(180_000);

const CDN = 'http://cdn.test/tps-public';

let postgres: StartedPostgreSqlContainer;
let db: DataSource;
let app: Express;
const tokens = createTokenService({ secret: TEST_JWT_SECRET });

const ids = { math: 0, english: 0, grade8: 0, grade9: 0, hanoi: 0, baDinh: 0, hcm: 0 };

beforeAll(async () => {
  postgres = await new PostgreSqlContainer('postgres:18.6-alpine').start();
  db = createDataSource({ DATABASE_URL: postgres.getConnectionUri(), DATABASE_POOL_MAX: 4 });
  await db.initialize();
  await db.runMigrations();

  const one = async (sql: string, params: unknown[] = []) =>
    (await db.query<{ id: number }[]>(sql, params))[0]!.id;
  ids.math = await one(`SELECT id FROM subjects WHERE code = 'math'`);
  ids.english = await one(`SELECT id FROM subjects WHERE code = 'english'`);
  ids.grade8 = await one(`SELECT id FROM grade_levels WHERE code = 'grade_8'`);
  ids.grade9 = await one(`SELECT id FROM grade_levels WHERE code = 'grade_9'`);
  const insertArea = (code: string, level: string, parentId: number | null, name: string) =>
    one(
      `INSERT INTO administrative_areas (code, level, unit_type, parent_id, name, full_name, name_ascii)
       VALUES ($1, $2, $3, $4, $5, $5, $5) RETURNING id`,
      [code, level, level === 'province' ? 'municipality' : 'ward', parentId, name],
    );
  ids.hanoi = await insertArea('01', 'province', null, 'Ha Noi');
  ids.baDinh = await insertArea('00004', 'commune', ids.hanoi, 'Ba Dinh');
  ids.hcm = await insertArea('79', 'province', null, 'Ho Chi Minh');

  const getAuthUser = async (userId: string) => {
    const account = await createUsersRepository(db.manager).findWithRoles(userId);
    if (!account) return null;
    const { user, roles } = account;
    return {
      id: user.id,
      email: user.email ?? '',
      displayName: user.displayName,
      fullName: user.fullName,
      phone: user.phone,
      locale: user.locale,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      roles,
    };
  };

  app = createApp({
    env: testEnv,
    logger: silentLogger,
    health: { check: async () => ({ status: 'ok', checks: {} }) },
    auth: { getAuthUser } as AuthService,
    tokens,
    rateLimiter: createMemoryRateLimiter(),
    parents: {} as ParentsService,
    learners: createLearnersService({ dataSource: db, logger: silentLogger }),
    studentInvitations: {} as StudentInvitationsService,
    tutors: {} as TutorsService,
    verification: {} as VerificationService,
    verificationReview: {} as VerificationReviewService,
    adminAccounts: {} as AdminAccountsService,
    adminCatalog: {} as AdminCatalogService,
    account: {} as AccountService,
    catalog: {} as CatalogService,
    tutorPosts: createTutorPostsService({
      dataSource: db,
      logger: silentLogger,
      publicFileUrl: (key) => `${CDN}/${key}`,
    }),
    requestPosts: createRequestPostsService({ dataSource: db, logger: silentLogger }),
    connections: {} as ConnectionsService,
  });
});

afterAll(async () => {
  await db?.destroy();
  await postgres?.stop();
});

// ---- Tiện ích ---------------------------------------------------------------------------------

let counter = 0;
const uniqueEmail = (prefix: string) => `${prefix}${Date.now()}${(counter += 1)}@example.com`;

interface TestUser {
  id: string;
  email: string;
  fullName: string;
  auth: string;
}

async function createUser(role: Role, fullName = 'Lê Hoàng Nam'): Promise<TestUser> {
  const email = uniqueEmail(role);
  const [row] = await db.query<{ id: string }[]>(
    `INSERT INTO users (email, email_verified_at, display_name, full_name, phone)
     VALUES ($1, now(), $2, $3, '0912345678') RETURNING id`,
    [email, `Thầy ${counter}`, fullName],
  );
  const id = row!.id;
  await db.query(`INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2)`, [id, role]);
  const { token } = tokens.signAccessToken({ userId: id, sessionFamilyId: randomUUID() });
  return { id, email, fullName, auth: `Bearer ${token}` };
}

/** Gia sư có hồ sơ; `verified` thì đã được duyệt danh tính (luồng duyệt thật có test ở tutors.int.test.ts). */
async function createTutor(options: { verified?: boolean } = {}): Promise<TestUser> {
  const tutor = await createUser('tutor');
  await db.query(
    options.verified
      ? `INSERT INTO tutor_profiles (user_id, profile_status, identity_verified_at)
         VALUES ($1, 'verified', now())`
      : `INSERT INTO tutor_profiles (user_id) VALUES ($1)`,
    [tutor.id],
  );
  return tutor;
}

const setUserStatus = (user: TestUser, status: 'active' | 'restricted' | 'locked') =>
  db.query(`UPDATE users SET status = $2 WHERE id = $1`, [user.id, status]);

const api = (user: TestUser | null) => {
  const prepare = (req: request.Test) => {
    req.set('Origin', TEST_ORIGIN);
    return user ? req.set('Authorization', user.auth) : req;
  };
  return {
    get: (path: string) => prepare(request(app).get(`/api/v1${path}`)),
    post: (path: string, body?: object) => prepare(request(app).post(`/api/v1${path}`)).send(body),
    put: (path: string, body?: object) => prepare(request(app).put(`/api/v1${path}`)).send(body),
    delete: (path: string) => prepare(request(app).delete(`/api/v1${path}`)),
  };
};

const fieldCodes = (res: request.Response) =>
  (res.body.error.details as { path: string; code: string }[]).map((d) => `${d.path}:${d.code}`);

// ---- Bài tuyển học sinh -----------------------------------------------------------------------

const tutorPostInput = (overrides: object = {}) => ({
  title: 'Nhận dạy kèm Toán 8, 9 tại Ba Đình',
  description: 'Ôn kiến thức nền, luyện đề vào lớp 10.',
  teachingMode: 'hybrid',
  rate: { amountVnd: 250_000, unit: 'session' },
  capacity: 3,
  availableFrom: '2026-12-01',
  subjects: [
    { subjectId: ids.math, gradeLevelId: ids.grade8 },
    { subjectId: ids.math, gradeLevelId: ids.grade9 },
  ],
  areaIds: [ids.baDinh],
  slots: [{ weekday: 3, startTime: '18:00', endTime: '20:00' }],
  ...overrides,
});

async function createTutorPost(tutor: TestUser, overrides: object = {}): Promise<OwnTutorPost> {
  const res = await api(tutor).post('/me/tutor-posts', tutorPostInput(overrides));
  expect(res.status).toBe(201);
  return OwnTutorPost.parse(res.body);
}

const setTutorPostStatus = (tutor: TestUser, postId: string, status: string) =>
  api(tutor).post(`/me/tutor-posts/${postId}/status`, { status });

async function openTutorPost(tutor: TestUser, overrides: object = {}): Promise<OwnTutorPost> {
  const post = await createTutorPost(tutor, overrides);
  const res = await setTutorPostStatus(tutor, post.id, 'open');
  expect(res.status).toBe(200);
  return OwnTutorPost.parse(res.body);
}

describe('tutor posts', () => {
  it('lets any tutor save a draft but only a verified tutor publish it (D5)', async () => {
    const tutor = await createTutor();
    const draft = await createTutorPost(tutor);
    expect(draft).toMatchObject({ status: 'draft', publishedAt: null, viewCount: 0 });
    expect(draft.subjects).toHaveLength(2);
    expect(draft.slots).toEqual([{ weekday: 3, startTime: '18:00', endTime: '20:00' }]);

    const res = await setTutorPostStatus(tutor, draft.id, 'open');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('tutor_not_verified');
    expect((await api(null).get(`/tutor-posts/${draft.id}`)).status).toBe(404);

    await db.query(
      `UPDATE tutor_profiles SET profile_status = 'verified', identity_verified_at = now()
        WHERE user_id = $1`,
      [tutor.id],
    );
    const opened = OwnTutorPost.parse((await setTutorPostStatus(tutor, draft.id, 'open')).body);
    expect(opened.status).toBe('open');
    expect(opened.publishedAt).not.toBeNull();
  });

  it('creates a tutor profile row for a tutor who has none yet', async () => {
    const tutor = await createUser('tutor');
    await createTutorPost(tutor);
    const [row] = await db.query<{ profile_status: string }[]>(
      `SELECT profile_status FROM tutor_profiles WHERE user_id = $1`,
      [tutor.id],
    );
    expect(row?.profile_status).toBe('incomplete');
  });

  it('shows open posts publicly without contact details or the real name, and counts views', async () => {
    const tutor = await createTutor({ verified: true });
    const post = await openTutorPost(tutor);

    const res = await api(null).get(`/tutor-posts/${post.id}`);
    expect(res.status).toBe(200);
    const pub = PublicTutorPost.parse(res.body);
    expect(pub.tutor).toMatchObject({ id: tutor.id, hasVerifiedDegree: false, avatarUrl: null });
    expect(pub.teachingMode).toBe('hybrid');
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(tutor.email);
    expect(text).not.toContain(tutor.fullName);
    expect(text).not.toContain('0912345678');

    await api(null).get(`/tutor-posts/${post.id}`);
    const own = OwnTutorPost.parse((await api(tutor).get(`/me/tutor-posts/${post.id}`)).body);
    expect(own.viewCount).toBe(2);
  });

  it('requires subjects, a teaching mode and an area before publishing', async () => {
    const tutor = await createTutor({ verified: true });
    const post = await createTutorPost(tutor, { teachingMode: null, subjects: [], areaIds: [] });
    const res = await setTutorPostStatus(tutor, post.id, 'open');
    expect(res.status).toBe(422);
    expect(fieldCodes(res)).toEqual(['subjects:required', 'teachingMode:required']);

    const inPerson = await createTutorPost(tutor, { teachingMode: 'in_person', areaIds: [] });
    const res2 = await setTutorPostStatus(tutor, inPerson.id, 'open');
    expect(fieldCodes(res2)).toEqual(['areaIds:required']);

    // Online thì không cần khu vực.
    const online = await createTutorPost(tutor, { teachingMode: 'online', areaIds: [] });
    expect((await setTutorPostStatus(tutor, online.id, 'open')).status).toBe(200);
  });

  it('keeps a published post publishable when editing it', async () => {
    const tutor = await createTutor({ verified: true });
    const post = await openTutorPost(tutor);
    const res = await api(tutor).put(
      `/me/tutor-posts/${post.id}`,
      tutorPostInput({ subjects: [] }),
    );
    expect(res.status).toBe(422);
    expect(fieldCodes(res)).toEqual(['subjects:required']);

    const ok = await api(tutor).put(
      `/me/tutor-posts/${post.id}`,
      tutorPostInput({ title: 'Toán 9 luyện thi vào 10', teachingMode: 'online', areaIds: [] }),
    );
    expect(ok.status).toBe(200);
    expect(OwnTutorPost.parse(ok.body)).toMatchObject({
      title: 'Toán 9 luyện thi vào 10',
      teachingMode: 'online',
      areaIds: [],
      status: 'open',
    });
  });

  it('validates content and catalog references per field', async () => {
    const tutor = await createTutor({ verified: true });
    const online = await api(tutor).post(
      '/me/tutor-posts',
      tutorPostInput({ teachingMode: 'online' }),
    );
    expect(online.status).toBe(422);
    expect(fieldCodes(online)).toContain('areaIds:service_areas_need_in_person');

    const unknown = await api(tutor).post(
      '/me/tutor-posts',
      tutorPostInput({ subjects: [{ subjectId: 99_999, gradeLevelId: ids.grade8 }] }),
    );
    expect(unknown.status).toBe(422);
    expect(fieldCodes(unknown)).toEqual(['subjects:unknown_option']);

    const blank = await api(tutor).post('/me/tutor-posts', tutorPostInput({ title: '  ' }));
    expect(fieldCodes(blank)).toContain('title:required');
  });

  it('follows the B.2 transitions and treats closed as final (D33)', async () => {
    const tutor = await createTutor({ verified: true });
    const post = await openTutorPost(tutor);
    const firstPublishedAt = post.publishedAt;

    for (const [target, expected] of [
      ['paused', 200],
      ['full', 409], // paused -> full không có trong B.2
      ['open', 200],
      ['full', 200],
      ['paused', 409],
      ['open', 200],
      ['closed', 200],
      ['open', 409],
    ] as const) {
      const res = await setTutorPostStatus(tutor, post.id, target);
      expect([target, res.status]).toEqual([target, expected]);
    }
    const closed = OwnTutorPost.parse((await api(tutor).get(`/me/tutor-posts/${post.id}`)).body);
    expect(closed.status).toBe('closed');
    expect(closed.publishedAt).toBe(firstPublishedAt);
    expect((await api(null).get(`/tutor-posts/${post.id}`)).status).toBe(404);

    const edit = await api(tutor).put(`/me/tutor-posts/${post.id}`, tutorPostInput());
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe('invalid_state_transition');

    const copy = await api(tutor).post(`/me/tutor-posts/${post.id}/duplicate`);
    expect(copy.status).toBe(201);
    const draft = OwnTutorPost.parse(copy.body);
    expect(draft).toMatchObject({ status: 'draft', publishedAt: null, title: post.title });
    expect(draft.id).not.toBe(post.id);
    expect(draft.subjects).toEqual(post.subjects);
    expect(draft.slots).toEqual(post.slots);
  });

  it('lists own posts with a status filter and hides deleted ones', async () => {
    const tutor = await createTutor({ verified: true });
    const open = await openTutorPost(tutor);
    const draft = await createTutorPost(tutor);
    const gone = await createTutorPost(tutor);
    expect((await api(tutor).delete(`/me/tutor-posts/${gone.id}`)).status).toBe(204);

    const all = OwnTutorPostList.parse((await api(tutor).get('/me/tutor-posts')).body);
    expect(all.total).toBe(2);
    expect(all.items.map((p) => p.id)).toEqual([draft.id, open.id]);
    const drafts = OwnTutorPostList.parse(
      (await api(tutor).get('/me/tutor-posts?status=draft')).body,
    );
    expect(drafts.items.map((p) => p.id)).toEqual([draft.id]);
    expect((await api(tutor).get(`/me/tutor-posts/${gone.id}`)).status).toBe(404);
  });

  it('keeps posts private to their tutor and the area to tutors', async () => {
    const owner = await createTutor({ verified: true });
    const other = await createTutor({ verified: true });
    const parent = await createUser('parent');
    const post = await createTutorPost(owner);

    expect((await api(other).get(`/me/tutor-posts/${post.id}`)).status).toBe(404);
    expect((await api(other).put(`/me/tutor-posts/${post.id}`, tutorPostInput())).status).toBe(404);
    expect((await setTutorPostStatus(other, post.id, 'open')).status).toBe(404);
    expect((await api(other).delete(`/me/tutor-posts/${post.id}`)).status).toBe(404);
    expect((await api(parent).get('/me/tutor-posts')).status).toBe(403);
    expect((await api(null).get('/me/tutor-posts')).status).toBe(401);
  });

  it('blocks publishing from a restricted account (B.9.3)', async () => {
    const tutor = await createTutor({ verified: true });
    const post = await createTutorPost(tutor);
    await setUserStatus(tutor, 'restricted');
    const res = await setTutorPostStatus(tutor, post.id, 'open');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('account_restricted');
  });

  it('hides posts of tutors who are no longer public, and posts a manager has hidden', async () => {
    const restricted = await createTutor({ verified: true });
    const restrictedPost = await openTutorPost(restricted);
    await setUserStatus(restricted, 'restricted');
    expect((await api(null).get(`/tutor-posts/${restrictedPost.id}`)).status).toBe(404);

    const unverified = await createTutor({ verified: true });
    const unverifiedPost = await openTutorPost(unverified);
    await db.query(`UPDATE tutor_profiles SET profile_status = 'incomplete' WHERE user_id = $1`, [
      unverified.id,
    ]);
    expect((await api(null).get(`/tutor-posts/${unverifiedPost.id}`)).status).toBe(404);

    const tutor = await createTutor({ verified: true });
    const hidden = await openTutorPost(tutor);
    await db.query(`UPDATE tutor_posts SET moderation_hidden_at = now() WHERE id = $1`, [
      hidden.id,
    ]);
    expect((await api(null).get(`/tutor-posts/${hidden.id}`)).status).toBe(404);
    const own = OwnTutorPost.parse((await api(tutor).get(`/me/tutor-posts/${hidden.id}`)).body);
    expect(own.moderationHidden).toBe(true);
  });

  it('enforces the published post invariants in the database', async () => {
    const tutor = await createTutor({ verified: true });
    const post = await createTutorPost(tutor, { teachingMode: null });
    await expect(
      db.query(`UPDATE tutor_posts SET status = 'open', published_at = now() WHERE id = $1`, [
        post.id,
      ]),
    ).rejects.toThrow(/tutor_posts_published_mode_chk/);
    await expect(
      db.query(`UPDATE tutor_posts SET status = 'open', teaches_online = true WHERE id = $1`, [
        post.id,
      ]),
    ).rejects.toThrow(/tutor_posts_published_at_chk/);
  });
});

// ---- Bài tìm gia sư ---------------------------------------------------------------------------

async function createChild(parent: TestUser): Promise<Learner> {
  const res = await api(parent).post('/learners', {
    fullName: 'Trần Minh Khang',
    dateOfBirth: '2012-05-20',
    gradeLevelId: ids.grade8,
    schoolName: 'THCS Nguyễn Du',
    provinceId: ids.hanoi,
    communeId: ids.baDinh,
    addressLine: '12 Phố Huế',
    relationship: 'mother',
    acceptChildDataProcessing: true,
  });
  expect(res.status).toBe(201);
  return Learner.parse(res.body);
}

const requestPostInput = (learnerId: string | undefined, overrides: object = {}) => ({
  ...(learnerId ? { learnerId } : {}),
  subjectId: ids.math,
  gradeLevelId: ids.grade8,
  goal: 'exam_prep',
  goalNote: 'Thi vào lớp 10 năm sau',
  teachingMode: 'in_person',
  provinceId: ids.hanoi,
  communeId: ids.baDinh,
  budget: { minVnd: 150_000, maxVnd: 250_000, unit: 'session' },
  desiredStartDate: '2026-12-15',
  tutorRequirements: 'Có kinh nghiệm luyện thi',
  description: 'Con học chậm phần hình học.',
  slots: [{ weekday: 6, startTime: '08:00', endTime: '10:00' }],
  ...overrides,
});

async function createRequestPost(
  parent: TestUser,
  learnerId: string,
  overrides: object = {},
): Promise<OwnRequestPost> {
  const res = await api(parent).post('/me/request-posts', requestPostInput(learnerId, overrides));
  expect(res.status).toBe(201);
  return OwnRequestPost.parse(res.body);
}

const setRequestPostStatus = (parent: TestUser, postId: string, body: object) =>
  api(parent).post(`/me/request-posts/${postId}/status`, body);

async function openRequestPost(parent: TestUser, learnerId: string, overrides: object = {}) {
  const post = await createRequestPost(parent, learnerId, overrides);
  const res = await setRequestPostStatus(parent, post.id, { status: 'open' });
  expect(res.status).toBe(200);
  return OwnRequestPost.parse(res.body);
}

describe('request posts', () => {
  it('creates a draft for a child the parent manages, and only for that', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);
    const post = await createRequestPost(parent, child.id);
    expect(post).toMatchObject({
      learnerId: child.id,
      status: 'draft',
      closedReason: null,
      budget: { minVnd: 150_000, maxVnd: 250_000, unit: 'session' },
    });

    const other = await createUser('parent');
    const res = await api(other).post('/me/request-posts', requestPostInput(child.id));
    expect(res.status).toBe(404);
    const tutor = await createTutor({ verified: true });
    expect((await api(tutor).post('/me/request-posts', requestPostInput(child.id))).status).toBe(
      403,
    );
  });

  it('validates location, budget and one open post per child and subject (D25)', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);

    const noProvince = await api(parent).post(
      '/me/request-posts',
      requestPostInput(child.id, { provinceId: null, communeId: null }),
    );
    expect(fieldCodes(noProvince)).toEqual(['provinceId:province_required_for_in_person']);
    const wrongCommune = await api(parent).post(
      '/me/request-posts',
      requestPostInput(child.id, { provinceId: ids.hcm }),
    );
    expect(fieldCodes(wrongCommune)).toEqual(['communeId:commune_not_in_province']);
    const budget = await api(parent).post(
      '/me/request-posts',
      requestPostInput(child.id, { budget: { minVnd: 300_000, maxVnd: 200_000, unit: 'hour' } }),
    );
    expect(fieldCodes(budget)).toEqual(['budget.minVnd:budget_range']);
    // Học trực tuyến không cần tỉnh.
    const online = await createRequestPost(parent, child.id, {
      subjectId: ids.english,
      teachingMode: 'online',
      provinceId: null,
      communeId: null,
      budget: null,
    });
    expect(online).toMatchObject({ provinceId: null, budget: null });

    const first = await createRequestPost(parent, child.id);
    const dup = await api(parent).post('/me/request-posts', requestPostInput(child.id));
    expect(dup.status).toBe(422);
    expect(fieldCodes(dup)).toEqual(['subjectId:request_post_exists']);
    // Đổi môn của bài tiếng Anh sang Toán cũng trùng.
    const move = await api(parent).put(
      `/me/request-posts/${online.id}`,
      requestPostInput(undefined, { teachingMode: 'online', provinceId: null, communeId: null }),
    );
    expect(fieldCodes(move)).toEqual(['subjectId:request_post_exists']);

    await setRequestPostStatus(parent, first.id, { status: 'open' });
    await setRequestPostStatus(parent, first.id, {
      status: 'closed',
      closedReason: 'no_longer_needed',
    });
    await createRequestPost(parent, child.id);
  });

  it('shows open posts to verified tutors only, without anything identifying the child (C8, §16.7)', async () => {
    const parent = await createUser('parent', 'Phạm Thu Hà');
    const child = await createChild(parent);
    const post = await openRequestPost(parent, child.id);

    const tutor = await createTutor({ verified: true });
    const res = await api(tutor).get(`/request-posts/${post.id}`);
    expect(res.status).toBe(200);
    const view = RequestPostForTutor.parse(res.body);
    expect(view).toMatchObject({ subjectId: ids.math, provinceId: ids.hanoi, goal: 'exam_prep' });
    expect(Object.keys(res.body)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/learner|author|user/i)]),
    );
    const text = JSON.stringify(res.body);
    for (const secret of [child.id, parent.id, parent.email, 'Trần Minh Khang', 'Nguyễn Du']) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain('12 Phố Huế');
    expect(text).not.toContain('Phạm Thu Hà');

    const unverified = await createTutor();
    const denied = await api(unverified).get(`/request-posts/${post.id}`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('tutor_not_verified');
    expect((await api(parent).get(`/request-posts/${post.id}`)).status).toBe(403);
    expect((await api(null).get(`/request-posts/${post.id}`)).status).toBe(401);

    const draft = await createRequestPost(parent, child.id, { subjectId: ids.english });
    expect((await api(tutor).get(`/request-posts/${draft.id}`)).status).toBe(404);
  });

  it('follows the B.3 transitions: hide, show again, close with a reason', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);
    const tutor = await createTutor({ verified: true });
    const post = await openRequestPost(parent, child.id);

    expect((await setRequestPostStatus(parent, post.id, { status: 'hidden' })).status).toBe(200);
    expect((await api(tutor).get(`/request-posts/${post.id}`)).status).toBe(404);
    expect((await setRequestPostStatus(parent, post.id, { status: 'open' })).status).toBe(200);
    expect((await api(tutor).get(`/request-posts/${post.id}`)).status).toBe(200);

    const noReason = await setRequestPostStatus(parent, post.id, { status: 'closed' });
    expect(fieldCodes(noReason)).toEqual(['closedReason:required']);
    const system = await setRequestPostStatus(parent, post.id, {
      status: 'closed',
      closedReason: 'found_tutor',
    });
    expect(system.status).toBe(422);

    const closed = await setRequestPostStatus(parent, post.id, {
      status: 'closed',
      closedReason: 'other',
    });
    expect(OwnRequestPost.parse(closed.body)).toMatchObject({
      status: 'closed',
      closedReason: 'other',
    });
    expect((await setRequestPostStatus(parent, post.id, { status: 'open' })).status).toBe(409);
    expect(
      (await api(parent).put(`/me/request-posts/${post.id}`, requestPostInput(undefined))).status,
    ).toBe(409);
    expect((await api(tutor).get(`/request-posts/${post.id}`)).status).toBe(404);
  });

  it('keeps posts private to their parent', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);
    const post = await createRequestPost(parent, child.id);
    const other = await createUser('parent');

    expect((await api(other).get(`/me/request-posts/${post.id}`)).status).toBe(404);
    expect(
      (await api(other).put(`/me/request-posts/${post.id}`, requestPostInput(undefined))).status,
    ).toBe(404);
    expect((await setRequestPostStatus(other, post.id, { status: 'open' })).status).toBe(404);
    expect((await api(other).delete(`/me/request-posts/${post.id}`)).status).toBe(404);
    const list = OwnRequestPostList.parse((await api(other).get('/me/request-posts')).body);
    expect(list.total).toBe(0);
  });

  it('lists own posts filtered by child and status', async () => {
    const parent = await createUser('parent');
    const first = await createChild(parent);
    const second = await createChild(parent);
    const a = await openRequestPost(parent, first.id);
    const b = await createRequestPost(parent, second.id);

    const all = OwnRequestPostList.parse((await api(parent).get('/me/request-posts')).body);
    expect(all.items.map((p) => p.id)).toEqual([b.id, a.id]);
    const byChild = OwnRequestPostList.parse(
      (await api(parent).get(`/me/request-posts?learnerId=${first.id}`)).body,
    );
    expect(byChild.items.map((p) => p.id)).toEqual([a.id]);
    const drafts = OwnRequestPostList.parse(
      (await api(parent).get('/me/request-posts?status=draft')).body,
    );
    expect(drafts.items.map((p) => p.id)).toEqual([b.id]);
  });

  it('removes the posts of a deleted child profile', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);
    const tutor = await createTutor({ verified: true });
    const post = await openRequestPost(parent, child.id);

    expect((await api(parent).delete(`/learners/${child.id}`)).status).toBe(204);
    expect((await api(parent).get(`/me/request-posts/${post.id}`)).status).toBe(404);
    expect((await api(tutor).get(`/request-posts/${post.id}`)).status).toBe(404);
  });

  it('blocks a restricted parent from publishing but still lets them close', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);
    const open = await openRequestPost(parent, child.id);
    const draft = await createRequestPost(parent, child.id, { subjectId: ids.english });
    await setUserStatus(parent, 'restricted');

    const res = await setRequestPostStatus(parent, draft.id, { status: 'open' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('account_restricted');
    const close = await setRequestPostStatus(parent, open.id, {
      status: 'closed',
      closedReason: 'no_longer_needed',
    });
    expect(close.status).toBe(200);
  });

  it('hides posts of restricted parents from tutors', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);
    const tutor = await createTutor({ verified: true });
    const post = await openRequestPost(parent, child.id);
    await setUserStatus(parent, 'restricted');
    expect((await api(tutor).get(`/request-posts/${post.id}`)).status).toBe(404);
  });
});
