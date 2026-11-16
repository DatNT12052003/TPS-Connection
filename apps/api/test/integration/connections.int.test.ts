// Yêu cầu kết nối (G5 đợt 1) qua HTTP (Supertest) với PostgreSQL thật (Testcontainers): hai chiều gửi (§5.1, §5.2),
// máy trạng thái B.1, điều khoản theo phiên bản (C3, C6), mở liên hệ khi xác nhận hợp tác (D16), tự hủy ứng tuyển
// khi bài nguồn ẩn hoặc đóng (D31), job nhắc và hết hạn (C3, D30). Người dùng được tạo thẳng trong database và đăng
// nhập bằng access token ký sẵn.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  ConnectionRequestDetail,
  ConnectionRequestList,
  Learner,
  OwnRequestPost,
  OwnTutorPost,
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
import { createConnectionsMaintenance } from '../../src/modules/connections/connections-maintenance.js';
import { createConnectionsRepository } from '../../src/modules/connections/connections.repository.js';
import { createConnectionsService } from '../../src/modules/connections/connections.service.js';
import { createLearnersService } from '../../src/modules/learners/learners.service.js';
import type { MessagingService } from '../../src/modules/messaging/messaging.service.js';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service.js';
import type { SafetyService } from '../../src/modules/safety/safety.service.js';
import type { ClassesService } from '../../src/modules/classes/classes.service.js';
import type { LessonsService } from '../../src/modules/lessons/lessons.service.js';
import type { StudentInvitationsService } from '../../src/modules/learners/student-invitations.service.js';
import type { ParentsService } from '../../src/modules/parents/parents.service.js';
import { createRequestPostsService } from '../../src/modules/request-posts/request-posts.service.js';
import { createTutorPostsService } from '../../src/modules/tutor-posts/tutor-posts.service.js';
import type { TutorsService } from '../../src/modules/tutors/tutors.service.js';
import type { AccountService } from '../../src/modules/users/account.service.js';
import { createUsersRepository } from '../../src/modules/users/users.repository.js';
import type { VerificationReviewService } from '../../src/modules/verification/verification-review.service.js';
import type { VerificationService } from '../../src/modules/verification/verification.service.js';
import { silentLogger, TEST_JWT_SECRET, TEST_ORIGIN, testEnv } from '../helpers.js';

jest.setTimeout(180_000);

let postgres: StartedPostgreSqlContainer;
let db: DataSource;
let app: Express;
const tokens = createTokenService({ secret: TEST_JWT_SECRET });

const ids = { math: 0, english: 0, grade8: 0, grade9: 0, hanoi: 0, baDinh: 0 };

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

  const publicFileUrl = (key: string) => `http://cdn.test/tps-public/${key}`;
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
    tutorPosts: createTutorPostsService({ dataSource: db, logger: silentLogger, publicFileUrl }),
    requestPosts: createRequestPostsService({ dataSource: db, logger: silentLogger }),
    connections: createConnectionsService({ dataSource: db, logger: silentLogger, publicFileUrl }),
    messaging: {} as MessagingService,
    notifications: {} as NotificationsService,
    safety: {} as SafetyService,
    classes: {} as ClassesService,
    lessons: {} as LessonsService,
  });
});

afterAll(async () => {
  await db?.destroy();
  await postgres?.stop();
});

// ---- Tiện ích ---------------------------------------------------------------------------------

let counter = 0;

interface TestUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  auth: string;
}

async function createUser(roles: Role[], fullName: string): Promise<TestUser> {
  counter += 1;
  const email = `${roles[0]}${Date.now()}${counter}@example.com`;
  const phone = `09${String(10_000_000 + counter).padStart(8, '0')}`;
  const [row] = await db.query<{ id: string }[]>(
    `INSERT INTO users (email, email_verified_at, display_name, full_name, phone)
     VALUES ($1, now(), $2, $3, $4) RETURNING id`,
    [email, `Người dùng ${counter}`, fullName, phone],
  );
  const id = row!.id;
  for (const role of roles) {
    await db.query(`INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2)`, [id, role]);
  }
  const { token } = tokens.signAccessToken({ userId: id, sessionFamilyId: randomUUID() });
  return { id, email, fullName, phone, auth: `Bearer ${token}` };
}

/** Gia sư đã (hoặc chưa) được duyệt danh tính, dạy Toán 8, 9. */
async function createTutor(options: { verified?: boolean } = {}): Promise<TestUser> {
  const tutor = await createUser(['tutor'], 'Phạm Quốc Bảo');
  await db.query(
    options.verified === false
      ? `INSERT INTO tutor_profiles (user_id) VALUES ($1)`
      : `INSERT INTO tutor_profiles (user_id, profile_status, identity_verified_at)
         VALUES ($1, 'verified', now())`,
    [tutor.id],
  );
  await db.query(
    `INSERT INTO tutor_teaching_subjects (tutor_id, subject_id, grade_level_id)
     VALUES ($1, $2, $3), ($1, $2, $4)`,
    [tutor.id, ids.math, ids.grade8, ids.grade9],
  );
  return tutor;
}

const createParent = () => createUser(['parent'], 'Nguyễn Thị Lan');

const api = (user: TestUser | null) => {
  const prepare = (req: request.Test) => {
    req.set('Origin', TEST_ORIGIN);
    return user ? req.set('Authorization', user.auth) : req;
  };
  return {
    get: (path: string) => prepare(request(app).get(`/api/v1${path}`)),
    post: (path: string, body?: object) => prepare(request(app).post(`/api/v1${path}`)).send(body),
    delete: (path: string) => prepare(request(app).delete(`/api/v1${path}`)),
  };
};

const fieldCodes = (res: request.Response) =>
  (res.body.error.details as { path: string; code: string }[]).map((d) => `${d.path}:${d.code}`);

const CHILD = {
  fullName: 'Trần Minh Khang',
  nickname: 'Bin',
  schoolName: 'THCS Nguyễn Du',
  addressLine: '12 Phố Huế',
};

async function createChild(parent: TestUser): Promise<Learner> {
  const res = await api(parent).post('/learners', {
    ...CHILD,
    dateOfBirth: '2012-05-20',
    gradeLevelId: ids.grade8,
    provinceId: ids.hanoi,
    communeId: ids.baDinh,
    relationship: 'mother',
    acceptChildDataProcessing: true,
  });
  expect(res.status).toBe(201);
  return Learner.parse(res.body);
}

const sendInput = (tutor: TestUser, learner: Learner, overrides: object = {}) => ({
  direction: 'client_to_tutor',
  tutorId: tutor.id,
  learnerId: learner.id,
  subjectId: ids.math,
  gradeLevelId: ids.grade8,
  goal: 'exam_prep',
  goalNote: 'Thi vào lớp 10',
  teachingMode: 'in_person',
  provinceId: ids.hanoi,
  communeId: ids.baDinh,
  message: 'Chào thầy, con tôi cần ôn thi vào lớp 10.',
  ...overrides,
});

async function send(
  parent: TestUser,
  tutor: TestUser,
  learner: Learner,
  overrides: object = {},
): Promise<ConnectionRequestDetail> {
  const res = await api(parent).post('/connection-requests', sendInput(tutor, learner, overrides));
  expect(res.status).toBe(201);
  return ConnectionRequestDetail.parse(res.body);
}

const act = async (user: TestUser, id: string, action: string, body?: object) =>
  api(user).post(`/connection-requests/${id}/${action}`, body);

const detail = async (user: TestUser, id: string) => {
  const res = await api(user).get(`/connection-requests/${id}`);
  expect(res.status).toBe(200);
  return ConnectionRequestDetail.parse(res.body);
};

const termsInput = (overrides: object = {}) => ({
  gradeLevelId: ids.grade8,
  goal: 'exam_prep',
  teachingMode: 'in_person',
  provinceId: ids.hanoi,
  communeId: ids.baDinh,
  sessionPriceVnd: 250_000,
  sessionMinutes: 90,
  sessionsPerWeek: 2,
  schedule: [
    { weekday: 2, startTime: '18:00' },
    { weekday: 5, startTime: '18:00' },
  ],
  startDate: '2026-12-01',
  ...overrides,
});

/** Đi tới trạng thái `negotiating`: phụ huynh gửi, gia sư chấp nhận. */
async function negotiating() {
  const tutor = await createTutor();
  const parent = await createParent();
  const child = await createChild(parent);
  const sent = await send(parent, tutor, child);
  expect((await act(tutor, sent.id, 'accept')).status).toBe(200);
  return { tutor, parent, child, id: sent.id };
}

async function openRequestPost(parent: TestUser, learner: Learner): Promise<OwnRequestPost> {
  const created = await api(parent).post('/me/request-posts', {
    learnerId: learner.id,
    subjectId: ids.math,
    gradeLevelId: ids.grade8,
    goal: 'reinforce',
    teachingMode: 'online',
    budget: { minVnd: 150_000, maxVnd: 250_000, unit: 'session' },
  });
  expect(created.status).toBe(201);
  const opened = await api(parent).post(`/me/request-posts/${created.body.id}/status`, {
    status: 'open',
  });
  expect(opened.status).toBe(200);
  return OwnRequestPost.parse(opened.body);
}

async function apply(tutor: TestUser, postId: string) {
  return api(tutor).post('/connection-requests', {
    direction: 'tutor_to_client',
    requestPostId: postId,
    message: 'Tôi đã dạy Toán 8 ba năm, xin được nhận lớp.',
  });
}

// ---- Phụ huynh gửi gia sư (§5.1) --------------------------------------------------------------

describe('parent sends a request to a tutor', () => {
  it('creates a pending request that the tutor sees without the child identity (D16)', async () => {
    const tutor = await createTutor();
    const parent = await createParent();
    const child = await createChild(parent);

    const sent = await send(parent, tutor, child);
    expect(sent).toMatchObject({
      direction: 'client_to_tutor',
      status: 'pending',
      myRole: 'client',
      isSender: true,
      awaitingMe: false,
      learner: { id: child.id, name: 'Bin' },
      need: { subjectId: ids.math, gradeLevelId: ids.grade8, goal: 'exam_prep' },
      contact: null,
      terms: null,
    });
    const days = (Date.parse(sent.expiresAt!) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    expect(sent.events.map((e) => [e.event, e.actor])).toEqual([['created', 'client']]);

    const received = await api(tutor).get('/connection-requests?box=received&state=open');
    const list = ConnectionRequestList.parse(received.body);
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({
      id: sent.id,
      myRole: 'tutor',
      isSender: false,
      awaitingMe: true,
      client: null,
      learner: null,
    });

    const res = await api(tutor).get(`/connection-requests/${sent.id}`);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    for (const secret of [
      CHILD.fullName,
      CHILD.schoolName,
      CHILD.addressLine,
      child.id,
      parent.email,
      parent.phone,
      parent.fullName,
    ]) {
      expect(text).not.toContain(secret);
    }

    // Người ngoài không thấy (404, không lộ yêu cầu có tồn tại).
    const outsider = await createParent();
    expect((await api(outsider).get(`/connection-requests/${sent.id}`)).status).toBe(404);
    expect((await api(null).get(`/connection-requests/${sent.id}`)).status).toBe(401);
  });

  it('only sends to tutors who are public and accepting students', async () => {
    const parent = await createParent();
    const child = await createChild(parent);

    const unverified = await createTutor({ verified: false });
    const notPublic = await api(parent).post('/connection-requests', sendInput(unverified, child));
    expect(notPublic.status).toBe(404);

    const busy = await createTutor();
    await db.query(`UPDATE tutor_profiles SET accepting_students = false WHERE user_id = $1`, [
      busy.id,
    ]);
    const notAccepting = await api(parent).post('/connection-requests', sendInput(busy, child));
    expect(notAccepting.status).toBe(409);
    expect(notAccepting.body.error.code).toBe('tutor_not_accepting');

    const tutor = await createTutor();
    const wrongSubject = await api(parent).post(
      '/connection-requests',
      sendInput(tutor, child, { subjectId: ids.english }),
    );
    expect(wrongSubject.status).toBe(422);
    expect(fieldCodes(wrongSubject)).toEqual(['subjectId:subject_not_taught']);

    const blocked = await createTutor();
    await db.query(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [
      blocked.id,
      parent.id,
    ]);
    expect((await api(parent).post('/connection-requests', sendInput(blocked, child))).status).toBe(
      404,
    );
  });

  it("rejects another parent's child, duplicates and restricted accounts", async () => {
    const tutor = await createTutor();
    const parent = await createParent();
    const child = await createChild(parent);

    const stranger = await createParent();
    expect((await api(stranger).post('/connection-requests', sendInput(tutor, child))).status).toBe(
      404,
    );

    await send(parent, tutor, child);
    const duplicate = await api(parent).post('/connection-requests', sendInput(tutor, child));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('connection_exists');
    // Môn khác với cùng gia sư là một yêu cầu riêng (D21).
    await db.query(
      `INSERT INTO tutor_teaching_subjects (tutor_id, subject_id, grade_level_id) VALUES ($1, $2, $3)`,
      [tutor.id, ids.english, ids.grade8],
    );
    await send(parent, tutor, child, { subjectId: ids.english });

    await db.query(`UPDATE users SET status = 'restricted' WHERE id = $1`, [parent.id]);
    const restricted = await api(parent).post(
      '/connection-requests',
      sendInput(await createTutor(), child),
    );
    expect(restricted.status).toBe(403);
    expect(restricted.body.error.code).toBe('account_restricted');

    // Tutor không phải phụ huynh thì không gửi theo chiều phụ huynh → gia sư.
    const otherTutor = await createTutor();
    const wrongRole = await api(otherTutor).post('/connection-requests', sendInput(tutor, child));
    expect(wrongRole.status).toBe(403);
  });

  it('needs an open post of that tutor teaching that subject when sent from a post', async () => {
    const tutor = await createTutor();
    const parent = await createParent();
    const child = await createChild(parent);
    const created = await api(tutor).post('/me/tutor-posts', {
      title: 'Nhận dạy Toán 8',
      description: 'Luyện đề.',
      teachingMode: 'online',
      subjects: [{ subjectId: ids.math, gradeLevelId: ids.grade8 }],
    });
    const post = OwnTutorPost.parse(created.body);

    const draft = await api(parent).post(
      '/connection-requests',
      sendInput(tutor, child, { tutorPostId: post.id }),
    );
    expect(draft.status).toBe(404);

    await api(tutor).post(`/me/tutor-posts/${post.id}/status`, { status: 'open' });
    const sent = await send(parent, tutor, child, { tutorPostId: post.id });
    expect(sent.tutorPostId).toBe(post.id);
  });
});

// ---- Chấp nhận, từ chối, hủy (B.1) ------------------------------------------------------------

describe('state machine', () => {
  it('lets only the recipient accept, then opens negotiation for 30 days', async () => {
    const tutor = await createTutor();
    const parent = await createParent();
    const child = await createChild(parent);
    const sent = await send(parent, tutor, child);

    const bySender = await act(parent, sent.id, 'accept');
    expect(bySender.status).toBe(403);

    const accepted = ConnectionRequestDetail.parse((await act(tutor, sent.id, 'accept')).body);
    expect(accepted.status).toBe('negotiating');
    expect(accepted.acceptedAt).not.toBeNull();
    expect(accepted.client).toEqual({ displayName: expect.any(String) });
    expect(accepted.contact).toBeNull();
    expect(accepted.learnerIdentity).toBeNull();
    const days = (Date.parse(accepted.expiresAt!) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);

    const again = await act(tutor, sent.id, 'accept');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('invalid_state_transition');
  });

  it('rejects with a note, and the sender withdraws a pending request', async () => {
    const tutor = await createTutor();
    const parent = await createParent();
    const child = await createChild(parent);

    const first = await send(parent, tutor, child);
    const rejected = await act(tutor, first.id, 'reject', { note: 'Lịch của tôi đã kín.' });
    expect(rejected.status).toBe(200);
    expect(ConnectionRequestDetail.parse(rejected.body)).toMatchObject({
      status: 'rejected',
      rejectionNote: 'Lịch của tôi đã kín.',
      expiresAt: null,
    });

    // Sau khi bị từ chối vẫn gửi lại được (C3).
    const second = await send(parent, tutor, child);
    expect((await act(tutor, second.id, 'cancel')).status).toBe(403);
    const withdrawn = ConnectionRequestDetail.parse((await act(parent, second.id, 'cancel')).body);
    expect(withdrawn).toMatchObject({ status: 'cancelled', cancelReason: 'withdrawn' });
    expect((await act(tutor, second.id, 'reject')).status).toBe(409);
  });

  it('lets either side end a negotiation', async () => {
    const { tutor, id } = await negotiating();
    const ended = ConnectionRequestDetail.parse((await act(tutor, id, 'cancel')).body);
    expect(ended).toMatchObject({ status: 'cancelled', cancelReason: 'ended_by_party' });
    expect(ended.events.map((e) => e.event)).toEqual(['created', 'accepted', 'cancelled_by_party']);
  });

  it('treats an overdue request as expired even before the job runs', async () => {
    const tutor = await createTutor();
    const parent = await createParent();
    const child = await createChild(parent);
    const sent = await send(parent, tutor, child);
    await db.query(
      `UPDATE connection_requests SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [sent.id],
    );
    expect((await act(tutor, sent.id, 'accept')).status).toBe(409);
  });

  it('does not let a tutor whose verification was withdrawn accept', async () => {
    const tutor = await createTutor();
    const parent = await createParent();
    const child = await createChild(parent);
    const sent = await send(parent, tutor, child);
    await db.query(`UPDATE tutor_profiles SET profile_status = 'incomplete' WHERE user_id = $1`, [
      tutor.id,
    ]);
    const res = await act(tutor, sent.id, 'accept');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('tutor_not_verified');
  });
});

// ---- Điều khoản và xác nhận hợp tác (C3, C6, D16) ---------------------------------------------

describe('terms and confirmation', () => {
  it('confirms only when both sides confirm the latest version, then reveals contacts', async () => {
    const { tutor, parent, id } = await negotiating();

    // Chưa có điều khoản thì chưa xác nhận được.
    expect((await act(tutor, id, 'confirm', { version: 1 })).status).toBe(409);

    const v1 = await act(tutor, id, 'terms', termsInput());
    expect(v1.status).toBe(201);
    expect(ConnectionRequestDetail.parse(v1.body).terms).toMatchObject({
      version: 1,
      proposedBy: 'tutor',
      subjectId: ids.math,
      sessionPriceVnd: 250_000,
      sessionMinutes: 90,
      tutorConfirmedAt: null,
      clientConfirmedAt: null,
    });
    const tutorConfirmsV1 = ConnectionRequestDetail.parse(
      (await act(tutor, id, 'confirm', { version: 1 })).body,
    );
    expect(tutorConfirmsV1.status).toBe('negotiating');
    expect(tutorConfirmsV1.awaitingMe).toBe(false);
    expect((await detail(parent, id)).awaitingMe).toBe(true);

    // Phụ huynh đề xuất bản 2: xác nhận của gia sư trên bản 1 mất hiệu lực.
    const v2 = await act(parent, id, 'terms', termsInput({ sessionPriceVnd: 220_000 }));
    expect(ConnectionRequestDetail.parse(v2.body).terms).toMatchObject({
      version: 2,
      proposedBy: 'client',
      tutorConfirmedAt: null,
    });
    const outdated = await act(tutor, id, 'confirm', { version: 1 });
    expect(outdated.status).toBe(409);
    expect(outdated.body.error).toMatchObject({
      code: 'terms_outdated',
      meta: { latestVersion: 2 },
    });

    await act(parent, id, 'confirm', { version: 2 });
    const done = ConnectionRequestDetail.parse(
      (await act(tutor, id, 'confirm', { version: 2 })).body,
    );
    expect(done).toMatchObject({ status: 'confirmed', expiresAt: null, awaitingMe: false });
    expect(done.terms).toMatchObject({ version: 2, sessionPriceVnd: 220_000 });
    expect(done.contact).toEqual({
      fullName: parent.fullName,
      email: parent.email,
      phone: parent.phone,
    });
    expect(done.learnerIdentity).toEqual(CHILD);
    expect(done.events.map((e) => e.event)).toEqual([
      'created',
      'accepted',
      'terms_proposed',
      'confirmed_by_tutor',
      'terms_proposed',
      'confirmed_by_client',
      'confirmed_by_tutor',
      'confirmed',
    ]);
    expect(done.events.at(-1)?.actor).toBe('system');

    const parentView = await detail(parent, id);
    expect(parentView.contact).toEqual({
      fullName: tutor.fullName,
      email: tutor.email,
      phone: tutor.phone,
    });
    expect(parentView.learnerIdentity).toBeNull();

    // Đã xác nhận là trạng thái cuối.
    expect((await act(parent, id, 'terms', termsInput())).status).toBe(409);
    expect((await act(parent, id, 'cancel')).status).toBe(409);
  });

  it('keeps every terms version immutable in the database', async () => {
    const { tutor, id } = await negotiating();
    await act(tutor, id, 'terms', termsInput());
    await expect(
      db.query(`UPDATE connection_terms SET session_price_vnd = 1 WHERE request_id = $1`, [id]),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.query(`DELETE FROM connection_terms WHERE request_id = $1`, [id]),
    ).rejects.toThrow(/cannot be deleted/);
  });

  it('validates terms', async () => {
    const { tutor, id } = await negotiating();
    const res = await act(
      tutor,
      id,
      'terms',
      termsInput({
        sessionMinutes: 10,
        sessionPriceVnd: 0,
        provinceId: null,
        schedule: [
          { weekday: 2, startTime: '18:00' },
          { weekday: 2, startTime: '18:00' },
        ],
      }),
    );
    expect(res.status).toBe(422);
    expect(fieldCodes(res).sort()).toEqual([
      'provinceId:province_required_for_in_person',
      'schedule:duplicate',
      'sessionMinutes:invalid_session_minutes',
      'sessionPriceVnd:invalid_amount',
    ]);
  });

  it('does not reveal contacts while negotiating, even with confirmed terms on one side', async () => {
    const { tutor, parent, id } = await negotiating();
    await act(tutor, id, 'terms', termsInput());
    await act(tutor, id, 'confirm', { version: 1 });
    const text = JSON.stringify((await api(tutor).get(`/connection-requests/${id}`)).body);
    expect(text).not.toContain(parent.email);
    expect(text).not.toContain(parent.phone);
    expect(text).not.toContain(CHILD.fullName);
  });
});

// ---- Gia sư ứng tuyển (§5.2, D31) -------------------------------------------------------------

describe('tutor applies to a request post', () => {
  it('needs identity verification and an open post', async () => {
    const parent = await createParent();
    const child = await createChild(parent);
    const post = await openRequestPost(parent, child);

    const unverified = await createTutor({ verified: false });
    const res = await apply(unverified, post.id);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('tutor_not_verified');

    const tutor = await createTutor();
    const applied = await apply(tutor, post.id);
    expect(applied.status).toBe(201);
    expect(ConnectionRequestDetail.parse(applied.body)).toMatchObject({
      direction: 'tutor_to_client',
      requestPostId: post.id,
      myRole: 'tutor',
      isSender: true,
      client: null,
      learner: null,
      need: { subjectId: ids.math, goal: 'reinforce', teachingMode: 'online' },
    });
    const again = await apply(tutor, post.id);
    expect(again.body.error.code).toBe('connection_exists');

    // Phụ huynh xem các ứng tuyển của bài.
    const applicants = ConnectionRequestList.parse(
      (await api(parent).get(`/connection-requests?requestPostId=${post.id}`)).body,
    );
    expect(applicants.items).toHaveLength(1);
    expect(applicants.items[0]).toMatchObject({ awaitingMe: true, isSender: false });
  });

  it('cancels pending applications when the post is hidden (D31)', async () => {
    const parent = await createParent();
    const child = await createChild(parent);
    const post = await openRequestPost(parent, child);
    const pendingTutor = await createTutor();
    const pending = ConnectionRequestDetail.parse((await apply(pendingTutor, post.id)).body);
    const acceptedTutor = await createTutor();
    const accepted = ConnectionRequestDetail.parse((await apply(acceptedTutor, post.id)).body);
    await act(parent, accepted.id, 'accept');

    await api(parent).post(`/me/request-posts/${post.id}/status`, { status: 'hidden' });

    const cancelled = await detail(pendingTutor, pending.id);
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'source_closed' });
    expect(cancelled.events.at(-1)).toMatchObject({
      event: 'cancelled_by_system',
      actor: 'system',
    });
    // Ứng tuyển đã được chấp nhận thì vẫn trao đổi tiếp.
    expect((await detail(acceptedTutor, accepted.id)).status).toBe('negotiating');
    // Bài đã ẩn thì không ứng tuyển được nữa.
    expect((await apply(await createTutor(), post.id)).status).toBe(404);
  });

  it('closes the post as found_tutor on confirmation and cancels other pending applications', async () => {
    const parent = await createParent();
    const child = await createChild(parent);
    const post = await openRequestPost(parent, child);
    const winner = await createTutor();
    const won = ConnectionRequestDetail.parse((await apply(winner, post.id)).body);
    const other = await createTutor();
    const lost = ConnectionRequestDetail.parse((await apply(other, post.id)).body);

    await act(parent, won.id, 'accept');
    await act(
      winner,
      won.id,
      'terms',
      termsInput({ teachingMode: 'online', provinceId: null, communeId: null }),
    );
    await act(winner, won.id, 'confirm', { version: 1 });
    const done = ConnectionRequestDetail.parse(
      (await act(parent, won.id, 'confirm', { version: 1 })).body,
    );
    expect(done.status).toBe('confirmed');

    const own = OwnRequestPost.parse((await api(parent).get(`/me/request-posts/${post.id}`)).body);
    expect(own).toMatchObject({ status: 'closed', closedReason: 'found_tutor' });
    expect(await detail(other, lost.id)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'source_closed',
    });
  });
});

// ---- Hủy do việc khác, job hết hạn ------------------------------------------------------------

describe('system cancellations and expiry', () => {
  it('cancels open requests when the parent deletes the child profile', async () => {
    const tutor = await createTutor();
    const parent = await createParent();
    const child = await createChild(parent);
    const sent = await send(parent, tutor, child);
    expect((await api(parent).delete(`/learners/${child.id}`)).status).toBe(204);
    expect(await detail(tutor, sent.id)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'ended_by_party',
    });
  });

  it('cancels open requests of a locked account (B.1)', async () => {
    const { tutor, parent, id } = await negotiating();
    await db.transaction((manager) =>
      createConnectionsRepository(manager).cancelOpenForUser(tutor.id),
    );
    expect(await detail(parent, id)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'ended_by_party',
    });
  });

  it('reminds once before expiry and cancels overdue requests (C3, D30)', async () => {
    const maintenance = createConnectionsMaintenance({ dataSource: db });
    const tutor = await createTutor();
    const parent = await createParent();
    const child = await createChild(parent);
    const soon = await send(parent, tutor, child);
    const { id: negotiatingId } = await negotiating();
    const overdue = await send(parent, await createTutor(), child);

    await db.query(
      `UPDATE connection_requests SET expires_at = now() + interval '12 hours' WHERE id = $1`,
      [soon.id],
    );
    await db.query(
      `UPDATE connection_requests SET expires_at = now() + interval '2 days' WHERE id = $1`,
      [negotiatingId],
    );
    await db.query(
      `UPDATE connection_requests SET expires_at = now() - interval '1 hour' WHERE id = $1`,
      [overdue.id],
    );

    expect(await maintenance.run()).toBeGreaterThanOrEqual(3);
    // Chạy lại không nhắc lần hai.
    await maintenance.run();

    const reminded = await detail(parent, soon.id);
    expect(reminded.status).toBe('pending');
    expect(reminded.events.filter((e) => e.event === 'expiry_reminded')).toHaveLength(1);
    const [negotiatingEvents] = await db.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM connection_events
        WHERE request_id = $1 AND event = 'expiry_reminded'`,
      [negotiatingId],
    );
    expect(negotiatingEvents?.n).toBe(1);

    expect(await detail(parent, overdue.id)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'expired_pending',
    });
  });
});

// ---- Ràng buộc database ---------------------------------------------------------------------

describe('database constraints', () => {
  it('allows only one open request per tutor, learner and subject (D21)', async () => {
    const tutor = await createTutor();
    const parent = await createParent();
    const child = await createChild(parent);
    const sent = await send(parent, tutor, child);
    await expect(
      db.query(
        `INSERT INTO connection_requests (direction, tutor_id, client_user_id, learner_id, subject_id,
           grade_level_id, goal, teaching_mode, message, expires_at)
         SELECT direction, tutor_id, client_user_id, learner_id, subject_id, grade_level_id, goal,
                'online', 'x', now() + interval '1 day'
           FROM connection_requests WHERE id = $1`,
        [sent.id],
      ),
    ).rejects.toThrow(/connection_requests_open_uq/);
    await expect(
      db.query(`UPDATE connection_requests SET status = 'confirmed' WHERE id = $1`, [sent.id]),
    ).rejects.toThrow(/connection_requests_accepted_chk/);
  });
});
