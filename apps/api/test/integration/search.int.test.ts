// Tìm kiếm marketplace (G4 đợt 2) qua HTTP với PostgreSQL thật: tìm gia sư, tìm bài tuyển (khách), tìm nhu cầu
// (gia sư đã xác minh), slug công khai. Dữ liệu gia sư được ghi thẳng vào database để kiểm soát từng bộ lọc.
//
// Việc chuyển từ G3: gia sư chưa được duyệt danh tính hoặc bị hạn chế không hiện trong kết quả; chỉ môn, khối đang
// bật mới khớp.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  Learner,
  OwnRequestPost,
  OwnTutorPost,
  PublicTutorPost,
  PublicTutorProfile,
  RequestPostSearchResult,
  type Role,
  TutorPostSearchResult,
  TutorSearchResult,
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
import type { FilesService } from '../../src/modules/files/files.service.js';
import { createLearnersService } from '../../src/modules/learners/learners.service.js';
import type { StudentInvitationsService } from '../../src/modules/learners/student-invitations.service.js';
import type { ParentsService } from '../../src/modules/parents/parents.service.js';
import { createRequestPostsService } from '../../src/modules/request-posts/request-posts.service.js';
import type { ConnectionsService } from '../../src/modules/connections/connections.service.js';
import type { MessagingService } from '../../src/modules/messaging/messaging.service.js';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service.js';
import type { SafetyService } from '../../src/modules/safety/safety.service.js';
import type { ClassesService } from '../../src/modules/classes/classes.service.js';
import type { LessonsService } from '../../src/modules/lessons/lessons.service.js';
import { createTutorPostsService } from '../../src/modules/tutor-posts/tutor-posts.service.js';
import { createTutorsService } from '../../src/modules/tutors/tutors.service.js';
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

// ---- Tiện ích ---------------------------------------------------------------------------------

let counter = 0;

interface TestUser {
  id: string;
  email: string;
  fullName: string;
  displayName: string;
  auth: string;
}

async function createUser(
  role: Role,
  displayName = `Người dùng ${counter + 1}`,
): Promise<TestUser> {
  counter += 1;
  const email = `${role}${Date.now()}${counter}@example.com`;
  const fullName = `Họ Tên Thật ${counter}`;
  const [row] = await db.query<{ id: string }[]>(
    `INSERT INTO users (email, email_verified_at, display_name, full_name, phone)
     VALUES ($1, now(), $2, $3, '0987654321') RETURNING id`,
    [email, displayName, fullName],
  );
  const id = row!.id;
  await db.query(`INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2)`, [id, role]);
  const { token } = tokens.signAccessToken({ userId: id, sessionFamilyId: randomUUID() });
  return { id, email, fullName, displayName, auth: `Bearer ${token}` };
}

interface TutorSeed {
  displayName: string;
  verified?: boolean;
  headline?: string;
  online?: boolean;
  inPerson?: boolean;
  rate?: [number, 'hour' | 'session'];
  experience?: number;
  degree?: boolean;
  accepting?: boolean;
  subjects?: [number, number][];
  areas?: number[];
  slots?: [number, string, string][];
}

/** Gia sư có hồ sơ đầy đủ theo `seed`, ghi thẳng vào database. */
async function seedTutor(seed: TutorSeed): Promise<TestUser> {
  const tutor = await createUser('tutor', seed.displayName);
  const verified = seed.verified ?? true;
  await db.query(
    `INSERT INTO tutor_profiles (user_id, headline, teaches_online, teaches_in_person, rate_amount_vnd,
       rate_unit, experience_years, has_verified_degree, accepting_students, profile_status,
       identity_verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      tutor.id,
      seed.headline ?? null,
      seed.online ?? false,
      seed.inPerson ?? false,
      seed.rate?.[0] ?? null,
      seed.rate?.[1] ?? null,
      seed.experience ?? null,
      seed.degree ?? false,
      seed.accepting ?? true,
      verified ? 'verified' : 'incomplete',
      verified ? new Date() : null,
    ],
  );
  for (const [subjectId, gradeId] of seed.subjects ?? []) {
    await db.query(
      `INSERT INTO tutor_teaching_subjects (tutor_id, subject_id, grade_level_id) VALUES ($1, $2, $3)`,
      [tutor.id, subjectId, gradeId],
    );
  }
  for (const areaId of seed.areas ?? []) {
    await db.query(`INSERT INTO tutor_service_areas (tutor_id, area_id) VALUES ($1, $2)`, [
      tutor.id,
      areaId,
    ]);
  }
  for (const [weekday, start, end] of seed.slots ?? []) {
    await db.query(
      `INSERT INTO tutor_availability_slots (tutor_id, weekday, start_time, end_time)
       VALUES ($1, $2, $3, $4)`,
      [tutor.id, weekday, start, end],
    );
  }
  return tutor;
}

const api = (user: TestUser | null) => {
  const prepare = (req: request.Test) => {
    req.set('Origin', TEST_ORIGIN);
    return user ? req.set('Authorization', user.auth) : req;
  };
  return {
    get: (path: string) => prepare(request(app).get(`/api/v1${path}`)),
    post: (path: string, body?: object) => prepare(request(app).post(`/api/v1${path}`)).send(body),
  };
};

const fieldCodes = (res: request.Response) =>
  (res.body.error.details as { path: string; code: string }[]).map((d) => `${d.path}:${d.code}`);

// ---- Dữ liệu chung ----------------------------------------------------------------------------

/** Gia sư hiển thị công khai (a, b, e, f) và không hiển thị (c chưa xác minh, d bị hạn chế). */
const t = {} as Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f', TestUser>;

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
  const publicFileUrl = (key: string) => `${CDN}/${key}`;
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
    tutors: createTutorsService({
      dataSource: db,
      files: {} as FilesService,
      logger: silentLogger,
      publicFileUrl,
    }),
    verification: {} as VerificationService,
    verificationReview: {} as VerificationReviewService,
    adminAccounts: {} as AdminAccountsService,
    adminCatalog: {} as AdminCatalogService,
    account: {} as AccountService,
    catalog: {} as CatalogService,
    tutorPosts: createTutorPostsService({ dataSource: db, logger: silentLogger, publicFileUrl }),
    requestPosts: createRequestPostsService({ dataSource: db, logger: silentLogger }),
    connections: {} as ConnectionsService,
    messaging: {} as MessagingService,
    notifications: {} as NotificationsService,
    safety: {} as SafetyService,
    classes: {} as ClassesService,
    lessons: {} as LessonsService,
  });

  t.a = await seedTutor({
    displayName: 'Thầy Nguyễn An',
    headline: 'Luyện thi vào lớp 10 chuyên Toán',
    online: true,
    inPerson: true,
    rate: [200_000, 'session'],
    experience: 6,
    degree: true,
    subjects: [
      [ids.math, ids.grade8],
      [ids.math, ids.grade9],
    ],
    areas: [ids.baDinh],
    slots: [[3, '18:00', '20:00']],
  });
  t.b = await seedTutor({
    displayName: 'Cô Bích',
    headline: 'IELTS và tiếng Anh giao tiếp',
    online: true,
    rate: [300_000, 'hour'],
    experience: 2,
    accepting: false,
    subjects: [[ids.english, ids.grade8]],
  });
  t.c = await seedTutor({
    displayName: 'Thầy Chưa Duyệt',
    verified: false,
    inPerson: true,
    subjects: [[ids.math, ids.grade8]],
    areas: [ids.baDinh],
  });
  t.d = await seedTutor({
    displayName: 'Thầy Bị Hạn Chế',
    inPerson: true,
    subjects: [[ids.math, ids.grade8]],
    areas: [ids.baDinh],
  });
  await db.query(`UPDATE users SET status = 'restricted' WHERE id = $1`, [t.d.id]);
  t.e = await seedTutor({
    displayName: 'Thầy Em',
    inPerson: true,
    rate: [150_000, 'session'],
    experience: 4,
    subjects: [[ids.math, ids.grade8]],
    areas: [ids.hcm],
  });
  // Dạy cả tỉnh Hà Nội: khớp khi lọc theo một xã của Hà Nội.
  t.f = await seedTutor({
    displayName: 'Cô Phương',
    inPerson: true,
    rate: [250_000, 'session'],
    subjects: [[ids.math, ids.grade9]],
    areas: [ids.hanoi],
  });
});

afterAll(async () => {
  await db?.destroy();
  await postgres?.stop();
});

// ---- Tìm gia sư -------------------------------------------------------------------------------

async function searchTutors(query = ''): Promise<{ ids: string[]; body: TutorSearchResult }> {
  const res = await api(null).get(`/tutors${query}`);
  expect(res.status).toBe(200);
  const body = TutorSearchResult.parse(res.body);
  return { ids: body.items.map((i) => i.id), body };
}

const sorted = (users: TestUser[]) => users.map((u) => u.id).sort();

describe('tutor search', () => {
  it('lists only verified, active tutors, without contact details or real names', async () => {
    const { ids: found, body } = await searchTutors('?pageSize=50');
    expect([...found].sort()).toEqual(sorted([t.a, t.b, t.e, t.f]));
    expect(body.total).toBe(4);
    const text = JSON.stringify(body);
    for (const u of Object.values(t)) {
      expect(text).not.toContain(u.email);
      expect(text).not.toContain(u.fullName);
    }
    expect(text).not.toContain('0987654321');

    const a = body.items.find((i) => i.id === t.a.id)!;
    expect(a).toMatchObject({
      displayName: 'Thầy Nguyễn An',
      teachingMode: 'hybrid',
      rate: { amountVnd: 200_000, unit: 'session' },
      hasVerifiedDegree: true,
      provinceIds: [ids.hanoi],
    });
    expect(a.slug).toMatch(/^thay-nguyen-an-[0-9a-f]{10}$/);
    expect(a.subjects).toHaveLength(2);
  });

  it('filters by subject and grade', async () => {
    expect([...(await searchTutors(`?subjectId=${ids.math}`)).ids].sort()).toEqual(
      sorted([t.a, t.e, t.f]),
    );
    expect(
      [...(await searchTutors(`?subjectId=${ids.math}&gradeLevelId=${ids.grade9}`)).ids].sort(),
    ).toEqual(sorted([t.a, t.f]));
    expect(
      (await searchTutors(`?gradeLevelId=${ids.grade8}&subjectId=${ids.english}`)).ids,
    ).toEqual([t.b.id]);
  });

  it('filters by teaching mode; hybrid tutors match both', async () => {
    expect([...(await searchTutors('?mode=online')).ids].sort()).toEqual(sorted([t.a, t.b]));
    expect([...(await searchTutors('?mode=in_person')).ids].sort()).toEqual(
      sorted([t.a, t.e, t.f]),
    );
  });

  it('filters by area: a commune matches tutors serving it or its whole province', async () => {
    expect([...(await searchTutors(`?provinceId=${ids.hanoi}`)).ids].sort()).toEqual(
      sorted([t.a, t.f]),
    );
    expect([...(await searchTutors(`?communeId=${ids.baDinh}`)).ids].sort()).toEqual(
      sorted([t.a, t.f]),
    );
    expect((await searchTutors(`?provinceId=${ids.hcm}`)).ids).toEqual([t.e.id]);
  });

  it('filters by rate, experience, availability and verified degree', async () => {
    expect(
      [...(await searchTutors('?rateUnit=session&minRate=150000&maxRate=220000')).ids].sort(),
    ).toEqual(sorted([t.a, t.e]));
    expect([...(await searchTutors('?minExperience=4')).ids].sort()).toEqual(sorted([t.a, t.e]));
    expect((await searchTutors('?weekday=3&from=18:30&to=19:30')).ids).toEqual([t.a.id]);
    expect((await searchTutors('?weekday=3&from=17:00&to=19:00')).ids).toEqual([]);
    expect((await searchTutors('?weekday=4')).ids).toEqual([]);
    expect((await searchTutors('?verifiedDegree=true')).ids).toEqual([t.a.id]);
    expect((await searchTutors('?acceptingOnly=1&subjectId=' + ids.english)).ids).toEqual([]);
  });

  it('searches the profile text and display name with or without accents, never real names or emails', async () => {
    expect((await searchTutors('?q=luyen%20thi')).ids).toEqual([t.a.id]);
    expect((await searchTutors(`?q=${encodeURIComponent('luyện thi')}`)).ids).toEqual([t.a.id]);
    expect((await searchTutors('?q=nguyen%20an')).ids).toEqual([t.a.id]);
    expect((await searchTutors(`?q=${encodeURIComponent('Bích')}`)).ids).toEqual([t.b.id]);
    expect((await searchTutors(`?q=${encodeURIComponent(t.a.fullName)}`)).ids).toEqual([]);
    expect((await searchTutors(`?q=${encodeURIComponent(t.a.email)}`)).ids).toEqual([]);
    expect((await searchTutors('?q=100%25')).ids).toEqual([]);
  });

  it('sorts results', async () => {
    expect((await searchTutors('?rateUnit=session&sort=rate_asc')).ids).toEqual([
      t.e.id,
      t.a.id,
      t.f.id,
    ]);
    expect((await searchTutors('?sort=experience')).ids.slice(0, 3)).toEqual([
      t.a.id,
      t.e.id,
      t.b.id,
    ]);
    // Mặc định: đang nhận học sinh trước, nên Cô Bích (không nhận) xếp cuối.
    expect((await searchTutors()).ids.at(-1)).toBe(t.b.id);
  });

  it('paginates', async () => {
    const page2 = await searchTutors('?sort=experience&pageSize=2&page=2');
    expect(page2.body).toMatchObject({ page: 2, pageSize: 2, total: 4 });
    expect(page2.ids).toEqual([t.b.id, t.f.id]);
    expect((await searchTutors('?page=10')).body).toMatchObject({ items: [], total: 4 });
  });

  it('only matches subjects and grades that are switched on', async () => {
    await db.query(`UPDATE subjects SET is_active = false WHERE id = $1`, [ids.math]);
    try {
      expect((await searchTutors(`?subjectId=${ids.math}`)).ids).toEqual([]);
      const { body } = await searchTutors('?pageSize=50');
      expect(body.items.find((i) => i.id === t.a.id)?.subjects).toEqual([]);
    } finally {
      await db.query(`UPDATE subjects SET is_active = true WHERE id = $1`, [ids.math]);
    }
  });

  it('rejects invalid filters', async () => {
    expect(fieldCodes(await api(null).get('/tutors?minRate=300000&maxRate=100000'))).toEqual([
      'minRate:budget_range',
    ]);
    expect(fieldCodes(await api(null).get('/tutors?from=18:00'))).toEqual(['weekday:required']);
    expect(fieldCodes(await api(null).get('/tutors?weekday=2&from=20:00&to=19:00'))).toEqual([
      'to:end_before_start',
    ]);
    expect((await api(null).get('/tutors?pageSize=51')).status).toBe(422);
    expect((await api(null).get('/tutors?sort=popular')).status).toBe(422);
  });
});

describe('public tutor profile by slug', () => {
  it('finds the tutor by slug or id, whatever words come before the code', async () => {
    const { body } = await searchTutors(`?q=nguyen%20an`);
    const slug = body.items[0]!.slug;
    const bySlug = await api(null).get(`/tutors/${slug}`);
    expect(bySlug.status).toBe(200);
    expect(PublicTutorProfile.parse(bySlug.body)).toMatchObject({ id: t.a.id, slug });

    const code = slug.slice(-10);
    expect((await api(null).get(`/tutors/ten-cu-${code}`)).body.id).toBe(t.a.id);
    expect((await api(null).get(`/tutors/${t.a.id}`)).body.slug).toBe(slug);
    expect((await api(null).get('/tutors/khong-co-ma')).status).toBe(404);
    expect((await api(null).get('/tutors/thay-x-0000000000')).status).toBe(404);
  });

  it('does not expose hidden tutors by slug', async () => {
    const [row] = await db.query<{ public_code: string }[]>(
      `SELECT public_code FROM tutor_profiles WHERE user_id = $1`,
      [t.c.id],
    );
    expect((await api(null).get(`/tutors/x-${row!.public_code}`)).status).toBe(404);
  });
});

// ---- Tìm bài tuyển ----------------------------------------------------------------------------

async function tutorPost(tutor: TestUser, input: object, open = true): Promise<OwnTutorPost> {
  const res = await api(tutor).post('/me/tutor-posts', {
    description: 'Mô tả bài đăng. '.repeat(30),
    ...input,
  });
  expect(res.status).toBe(201);
  const post = OwnTutorPost.parse(res.body);
  if (!open) return post;
  const opened = await api(tutor).post(`/me/tutor-posts/${post.id}/status`, { status: 'open' });
  expect(opened.status).toBe(200);
  return OwnTutorPost.parse(opened.body);
}

describe('tutor post search', () => {
  const p = {} as Record<'math' | 'english' | 'draft' | 'restricted', OwnTutorPost>;

  beforeAll(async () => {
    p.english = await tutorPost(t.b, {
      title: 'IELTS online cấp tốc',
      teachingMode: 'online',
      subjects: [{ subjectId: ids.english, gradeLevelId: ids.grade8 }],
    });
    p.math = await tutorPost(t.a, {
      title: 'Toán 9 luyện thi vào 10',
      teachingMode: 'hybrid',
      rate: { amountVnd: 220_000, unit: 'session' },
      subjects: [{ subjectId: ids.math, gradeLevelId: ids.grade9 }],
      areaIds: [ids.baDinh],
    });
    p.draft = await tutorPost(
      t.a,
      {
        title: 'Nháp Toán 8',
        teachingMode: 'online',
        subjects: [{ subjectId: ids.math, gradeLevelId: ids.grade8 }],
      },
      false,
    );
    // Đăng khi còn hoạt động, sau đó tài khoản bị hạn chế.
    await db.query(`UPDATE users SET status = 'active' WHERE id = $1`, [t.d.id]);
    p.restricted = await tutorPost(t.d, {
      title: 'Toán 8 tại nhà',
      teachingMode: 'in_person',
      subjects: [{ subjectId: ids.math, gradeLevelId: ids.grade8 }],
      areaIds: [ids.baDinh],
    });
    await db.query(`UPDATE users SET status = 'restricted' WHERE id = $1`, [t.d.id]);
  });

  async function searchPosts(query = '') {
    const res = await api(null).get(`/tutor-posts${query}`);
    expect(res.status).toBe(200);
    const body = TutorPostSearchResult.parse(res.body);
    return { ids: body.items.map((i) => i.id), body };
  }

  it('lists open posts of visible tutors, newest first', async () => {
    const { ids: found, body } = await searchPosts();
    expect(found).toEqual([p.math.id, p.english.id]);
    const math = body.items[0]!;
    expect(math.slug).toMatch(/^toan-9-luyen-thi-vao-10-[0-9a-f]{10}$/);
    expect(math.excerpt.length).toBeLessThanOrEqual(201);
    expect(math.excerpt.endsWith('…')).toBe(true);
    expect(math.tutor).toMatchObject({ id: t.a.id, displayName: 'Thầy Nguyễn An' });
    expect(math.tutor.slug).toMatch(/^thay-nguyen-an-[0-9a-f]{10}$/);
    expect(JSON.stringify(body)).not.toContain(t.a.email);
  });

  it('filters by subject, mode, area, tutor and keyword', async () => {
    expect((await searchPosts(`?subjectId=${ids.english}`)).ids).toEqual([p.english.id]);
    expect((await searchPosts('?mode=in_person')).ids).toEqual([p.math.id]);
    expect((await searchPosts('?mode=online')).ids).toEqual([p.math.id, p.english.id]);
    expect((await searchPosts(`?communeId=${ids.baDinh}`)).ids).toEqual([p.math.id]);
    expect((await searchPosts(`?provinceId=${ids.hcm}`)).ids).toEqual([]);
    expect((await searchPosts(`?tutorId=${t.b.id}`)).ids).toEqual([p.english.id]);
    expect((await searchPosts('?q=toan%209')).ids).toEqual([p.math.id]);
    expect((await searchPosts('?q=ielts&sort=relevance')).ids).toEqual([p.english.id]);
  });

  it('opens a post by slug and keeps the slug stable when only the words change', async () => {
    const { body } = await searchPosts(`?tutorId=${t.a.id}`);
    const slug = body.items[0]!.slug;
    const res = await api(null).get(`/tutor-posts/${slug}`);
    expect(res.status).toBe(200);
    expect(PublicTutorPost.parse(res.body)).toMatchObject({ id: p.math.id, slug });
    expect((await api(null).get(`/tutor-posts/bai-cu-${slug.slice(-10)}`)).status).toBe(200);
    expect((await api(null).get(`/tutor-posts/${p.draft.id}`)).status).toBe(404);
  });
});

// ---- Tìm nhu cầu ------------------------------------------------------------------------------

describe('request post search', () => {
  let parent: TestUser;
  let child: Learner;
  const r = {} as Record<'math' | 'english' | 'draft' | 'hidden', OwnRequestPost>;

  async function requestPost(input: object, status?: 'open' | 'hidden'): Promise<OwnRequestPost> {
    const res = await api(parent).post('/me/request-posts', {
      learnerId: child.id,
      gradeLevelId: ids.grade8,
      goal: 'reinforce',
      ...input,
    });
    expect(res.status).toBe(201);
    let post = OwnRequestPost.parse(res.body);
    for (const next of status === 'hidden' ? ['open', 'hidden'] : status ? ['open'] : []) {
      const changed = await api(parent).post(`/me/request-posts/${post.id}/status`, {
        status: next,
      });
      expect(changed.status).toBe(200);
      post = OwnRequestPost.parse(changed.body);
    }
    return post;
  }

  beforeAll(async () => {
    parent = await createUser('parent', 'Phụ Huynh Hà');
    const res = await api(parent).post('/learners', {
      fullName: 'Lê Gia Bảo',
      dateOfBirth: '2012-03-01',
      gradeLevelId: ids.grade8,
      schoolName: 'THCS Giảng Võ',
      provinceId: ids.hanoi,
      communeId: ids.baDinh,
      relationship: 'father',
      acceptChildDataProcessing: true,
    });
    expect(res.status).toBe(201);
    child = Learner.parse(res.body);

    r.english = await requestPost(
      { subjectId: ids.english, teachingMode: 'online', provinceId: null },
      'open',
    );
    r.math = await requestPost(
      {
        subjectId: ids.math,
        teachingMode: 'in_person',
        provinceId: ids.hanoi,
        communeId: ids.baDinh,
        budget: { maxVnd: 250_000, unit: 'session' },
      },
      'open',
    );
    // Môn khác cho từng bài vì mỗi con chỉ một bài chưa đóng mỗi môn (D25).
    const physics = (
      await db.query<{ id: number }[]>(`SELECT id FROM subjects WHERE code = 'physics'`)
    )[0]!.id;
    const chemistry = (
      await db.query<{ id: number }[]>(`SELECT id FROM subjects WHERE code = 'chemistry'`)
    )[0]!.id;
    r.draft = await requestPost({ subjectId: physics, teachingMode: 'online' });
    r.hidden = await requestPost({ subjectId: chemistry, teachingMode: 'online' }, 'hidden');
  });

  async function searchRequests(tutor: TestUser, query = '') {
    const res = await api(tutor).get(`/request-posts${query}`);
    expect(res.status).toBe(200);
    const body = RequestPostSearchResult.parse(res.body);
    return { ids: body.items.map((i) => i.id), body };
  }

  it('lists open requests to verified tutors only, without anything identifying the child', async () => {
    const { ids: found, body } = await searchRequests(t.a);
    expect(found).toEqual([r.math.id, r.english.id]);
    const text = JSON.stringify(body);
    for (const secret of [
      child.id,
      parent.id,
      parent.email,
      'Lê Gia Bảo',
      'Giảng Võ',
      'Phụ Huynh Hà',
    ]) {
      expect(text).not.toContain(secret);
    }

    const unverified = await api(t.c).get('/request-posts');
    expect(unverified.status).toBe(403);
    expect(unverified.body.error.code).toBe('tutor_not_verified');
    expect((await api(parent).get('/request-posts')).status).toBe(403);
    expect((await api(null).get('/request-posts')).status).toBe(401);
  });

  it('filters by subject, mode, area, budget and the tutor profile', async () => {
    expect((await searchRequests(t.a, `?subjectId=${ids.english}`)).ids).toEqual([r.english.id]);
    expect((await searchRequests(t.a, '?mode=online')).ids).toEqual([r.english.id]);
    expect((await searchRequests(t.a, `?communeId=${ids.baDinh}`)).ids).toEqual([r.math.id]);
    expect((await searchRequests(t.a, `?provinceId=${ids.hcm}`)).ids).toEqual([]);
    expect((await searchRequests(t.a, '?minBudget=200000&budgetUnit=session')).ids).toEqual([
      r.math.id,
    ]);
    expect((await searchRequests(t.a, '?minBudget=300000')).ids).toEqual([]);
    // Thầy An dạy Toán 8, 9; Cô Bích dạy Tiếng Anh 8.
    expect((await searchRequests(t.a, '?matchProfile=true')).ids).toEqual([r.math.id]);
    expect((await searchRequests(t.b, '?matchProfile=true')).ids).toEqual([r.english.id]);
    expect((await searchRequests(t.a, '?sort=budget_desc')).ids).toEqual([r.math.id, r.english.id]);
  });
});
