// Lớp học (G6 đợt 1) qua HTTP (Supertest) với PostgreSQL thật (Testcontainers): tạo lớp khi xác nhận hợp tác (D9),
// quyền theo vai trò trong lớp (gia sư, phụ huynh, học sinh; người ngoài 404), trạng thái lớp chỉ gia sư đổi (D35),
// đổi học phí cần phụ huynh đồng ý (D17), lưu ý giảng dạy chỉ gia sư thấy, mục tiêu học tập, `teachesStudent`,
// chặn xóa hồ sơ con còn lớp (C2), migration tạo lớp cho yêu cầu đã xác nhận trước G6.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { ClassDetail, ClassList, ConnectionRequestDetail, Learner, type Role } from '@tps/shared';
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
import { createClassesService } from '../../src/modules/classes/classes.service.js';
import type { LessonsService } from '../../src/modules/lessons/lessons.service.js';
import { createConnectionsService } from '../../src/modules/connections/connections.service.js';
import { createLearnerAccess } from '../../src/modules/learners/learner-access.js';
import { createLearnersService } from '../../src/modules/learners/learners.service.js';
import type { StudentInvitationsService } from '../../src/modules/learners/student-invitations.service.js';
import type { MessagingService } from '../../src/modules/messaging/messaging.service.js';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service.js';
import type { ParentsService } from '../../src/modules/parents/parents.service.js';
import type { RequestPostsService } from '../../src/modules/request-posts/request-posts.service.js';
import type { SafetyService } from '../../src/modules/safety/safety.service.js';
import type { TutorPostsService } from '../../src/modules/tutor-posts/tutor-posts.service.js';
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

const ids = { math: 0, grade8: 0, hanoi: 0, baDinh: 0 };

beforeAll(async () => {
  postgres = await new PostgreSqlContainer('postgres:18.6-alpine').start();
  db = createDataSource({ DATABASE_URL: postgres.getConnectionUri(), DATABASE_POOL_MAX: 4 });
  await db.initialize();
  await db.runMigrations();

  const one = async (sql: string, params: unknown[] = []) =>
    (await db.query<{ id: number }[]>(sql, params))[0]!.id;
  ids.math = await one(`SELECT id FROM subjects WHERE code = 'math'`);
  ids.grade8 = await one(`SELECT id FROM grade_levels WHERE code = 'grade_8'`);
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
    tutorPosts: {} as TutorPostsService,
    requestPosts: {} as RequestPostsService,
    connections: createConnectionsService({ dataSource: db, logger: silentLogger, publicFileUrl }),
    messaging: {} as MessagingService,
    notifications: {} as NotificationsService,
    safety: {} as SafetyService,
    classes: createClassesService({ dataSource: db, logger: silentLogger, publicFileUrl }),
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
  const phone = `09${String(20_000_000 + counter).padStart(8, '0')}`;
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

async function createTutor(): Promise<TestUser> {
  const tutor = await createUser(['tutor'], 'Phạm Quốc Bảo');
  await db.query(
    `INSERT INTO tutor_profiles (user_id, profile_status, identity_verified_at)
     VALUES ($1, 'verified', now())`,
    [tutor.id],
  );
  await db.query(
    `INSERT INTO tutor_teaching_subjects (tutor_id, subject_id, grade_level_id) VALUES ($1, $2, $3)`,
    [tutor.id, ids.math, ids.grade8],
  );
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
    patch: (path: string, body?: object) =>
      prepare(request(app).patch(`/api/v1${path}`)).send(body),
    delete: (path: string) => prepare(request(app).delete(`/api/v1${path}`)),
  };
};

const fieldCodes = (res: request.Response) =>
  (res.body.error.details as { path: string; code: string }[]).map((d) => `${d.path}:${d.code}`);

async function createChild(parent: TestUser): Promise<Learner> {
  const res = await api(parent).post('/learners', {
    fullName: 'Trần Minh Khang',
    nickname: 'Bin',
    schoolName: 'THCS Nguyễn Du',
    addressLine: '12 Phố Huế',
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

/** Tài khoản học sinh gắn với hồ sơ con (như khi nhận lời mời, D50). */
async function createStudentAccount(learner: Learner): Promise<TestUser> {
  const student = await createUser(['student'], 'Trần Minh Khang');
  await db.query(`UPDATE learners SET account_user_id = $2 WHERE id = $1`, [
    learner.id,
    student.id,
  ]);
  return student;
}

/** Phụ huynh gửi, gia sư chấp nhận, gia sư đề xuất điều khoản, hai bên xác nhận. */
async function confirmedClass(options: { startDate?: string | null } = {}) {
  const tutor = await createTutor();
  const parent = await createUser(['parent'], 'Nguyễn Thị Lan');
  const child = await createChild(parent);
  const sent = await api(parent).post('/connection-requests', {
    direction: 'client_to_tutor',
    tutorId: tutor.id,
    learnerId: child.id,
    subjectId: ids.math,
    gradeLevelId: ids.grade8,
    goal: 'exam_prep',
    goalNote: 'Thi vào lớp 10',
    teachingMode: 'in_person',
    provinceId: ids.hanoi,
    communeId: ids.baDinh,
    message: 'Chào thầy, con tôi cần ôn thi vào lớp 10.',
  });
  expect(sent.status).toBe(201);
  const requestId = sent.body.id as string;
  expect((await api(tutor).post(`/connection-requests/${requestId}/accept`)).status).toBe(200);
  const terms = await api(tutor).post(`/connection-requests/${requestId}/terms`, {
    gradeLevelId: ids.grade8,
    goal: 'exam_prep',
    goalNote: 'Đạt 8 điểm thi vào 10',
    teachingMode: 'in_person',
    provinceId: ids.hanoi,
    communeId: ids.baDinh,
    sessionPriceVnd: 250_000,
    sessionMinutes: 90,
    sessionsPerWeek: 2,
    schedule: [{ weekday: 2, startTime: '18:00' }],
    startDate: options.startDate === undefined ? '2026-12-01' : options.startDate,
  });
  expect(terms.status).toBe(201);
  expect(
    (await api(tutor).post(`/connection-requests/${requestId}/confirm`, { version: 1 })).status,
  ).toBe(200);
  const confirmed = await api(parent).post(`/connection-requests/${requestId}/confirm`, {
    version: 1,
  });
  expect(confirmed.status).toBe(200);
  const detail = ConnectionRequestDetail.parse(confirmed.body);
  expect(detail.status).toBe('confirmed');
  expect(detail.classId).not.toBeNull();
  return { tutor, parent, child, requestId, classId: detail.classId! };
}

async function getClass(user: TestUser, classId: string): Promise<ClassDetail> {
  const res = await api(user).get(`/classes/${classId}`);
  expect(res.status).toBe(200);
  return ClassDetail.parse(res.body);
}

// ---- Tạo lớp khi xác nhận hợp tác (D9) -----------------------------------------------------------

describe('class created on confirmation', () => {
  it('creates an active 1-on-1 class, enrollment and first fee from the agreed terms', async () => {
    const { tutor, parent, child, requestId, classId } = await confirmedClass();
    const cls = await getClass(tutor, classId);
    expect(cls).toMatchObject({
      id: classId,
      name: null,
      status: 'active',
      myRole: 'tutor',
      subjectId: ids.math,
      gradeLevelId: ids.grade8,
      teachingMode: 'in_person',
      startedOn: '2026-12-01',
      endedOn: null,
      goal: 'exam_prep',
      goalNote: 'Đạt 8 điểm thi vào 10',
      provinceId: ids.hanoi,
      communeId: ids.baDinh,
      connectionRequestId: requestId,
      learner: { id: child.id, name: 'Bin' },
      currentFee: { sessionPriceVnd: 250_000, sessionMinutes: 90 },
      feeChangePending: false,
    });
    expect(cls.conversationId).not.toBeNull();
    expect(cls.enrollments).toHaveLength(1);
    expect(cls.enrollments[0]).toMatchObject({
      id: cls.enrollmentId,
      status: 'active',
      joinedOn: '2026-12-01',
      feeRates: [{ status: 'active', source: 'terms', sessionPriceVnd: 250_000 }],
    });
    // Gia sư thấy liên hệ của phụ huynh và danh tính của trẻ (D16); phụ huynh thấy liên hệ của gia sư.
    expect(cls.contact).toEqual({
      fullName: parent.fullName,
      email: parent.email,
      phone: parent.phone,
    });
    expect(cls.learnerIdentity).toMatchObject({
      fullName: 'Trần Minh Khang',
      schoolName: 'THCS Nguyễn Du',
    });
    const forParent = await getClass(parent, classId);
    expect(forParent.myRole).toBe('client');
    expect(forParent.contact).toEqual({
      fullName: tutor.fullName,
      email: tutor.email,
      phone: tutor.phone,
    });
    expect(forParent.learnerIdentity).toBeNull();
  });

  it('starts today (Vietnam time) when the terms have no start date', async () => {
    const { tutor, classId } = await confirmedClass({ startDate: null });
    const [today] = await db.query<{ d: string }[]>(
      `SELECT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS d`,
    );
    expect((await getClass(tutor, classId)).startedOn).toBe(today!.d);
  });

  it('teachesStudent is true only for the class tutor', async () => {
    const { tutor, child } = await confirmedClass();
    const other = await createTutor();
    const access = createLearnerAccess(db.manager);
    expect(await access.teachesStudent(tutor.id, child.id)).toBe(true);
    expect(await access.teachesStudent(other.id, child.id)).toBe(false);
  });
});

// ---- Quyền xem ------------------------------------------------------------------------------------

describe('who can see a class', () => {
  it('lists classes per role and hides other people’s classes (404)', async () => {
    const { tutor, parent, child, classId } = await confirmedClass();
    const student = await createStudentAccount(child);
    const outsider = await createUser(['parent'], 'Người ngoài');
    const otherTutor = await createTutor();

    for (const user of [tutor, parent, student]) {
      const res = await api(user).get('/classes');
      expect(res.status).toBe(200);
      expect(ClassList.parse(res.body).items.map((c) => c.id)).toContain(classId);
    }
    for (const user of [outsider, otherTutor]) {
      const res = await api(user).get('/classes');
      expect(ClassList.parse(res.body).items).toEqual([]);
      expect((await api(user).get(`/classes/${classId}`)).status).toBe(404);
    }
    expect((await api(null).get(`/classes/${classId}`)).status).toBe(401);
    const filtered = ClassList.parse(
      (await api(parent).get(`/classes?learnerId=${child.id}&state=current`)).body,
    );
    expect(filtered.total).toBe(1);
    const ended = ClassList.parse((await api(parent).get(`/classes?state=ended`)).body);
    expect(ended.total).toBe(0);
  });

  it('students see the class read-only, without fees, notes, contacts or chat', async () => {
    const { tutor, child, classId } = await confirmedClass();
    const student = await createStudentAccount(child);
    const enrollmentId = (await getClass(tutor, classId)).enrollmentId;
    await api(tutor).patch(`/classes/${classId}/enrollments/${enrollmentId}`, {
      initialAssessment: 'Nắm chắc đại số',
      teachingNotes: 'Cần nhắc làm bài tập',
    });

    const cls = await getClass(student, classId);
    expect(cls.myRole).toBe('student');
    expect(cls.currentFee).toBeNull();
    expect(cls.conversationId).toBeNull();
    expect(cls.connectionRequestId).toBeNull();
    expect(cls.contact).toBeNull();
    expect(cls.enrollments[0]).toMatchObject({
      initialAssessment: null,
      teachingNotes: null,
      feeRates: [],
    });
    for (const call of [
      api(student).post(`/classes/${classId}/pause`),
      api(student).patch(`/classes/${classId}`, { name: 'Lớp của em' }),
    ]) {
      expect((await call).status).toBe(403);
    }
  });

  it('teaching notes are tutor-only; the parent sees the initial assessment', async () => {
    const { tutor, parent, classId } = await confirmedClass();
    const enrollmentId = (await getClass(tutor, classId)).enrollmentId;
    const res = await api(tutor).patch(`/classes/${classId}/enrollments/${enrollmentId}`, {
      initialAssessment: 'Nắm chắc đại số',
      teachingNotes: 'Cần nhắc làm bài tập',
    });
    expect(res.status).toBe(200);
    expect(ClassDetail.parse(res.body).enrollments[0]?.teachingNotes).toBe('Cần nhắc làm bài tập');
    const forParent = await getClass(parent, classId);
    expect(forParent.enrollments[0]).toMatchObject({
      initialAssessment: 'Nắm chắc đại số',
      teachingNotes: null,
    });
    expect(
      (
        await api(parent).patch(`/classes/${classId}/enrollments/${enrollmentId}`, {
          teachingNotes: 'x',
        })
      ).status,
    ).toBe(403);
    const empty = await api(tutor).patch(`/classes/${classId}/enrollments/${enrollmentId}`, {});
    expect(empty.status).toBe(422);
  });
});

// ---- Trạng thái lớp (B.5.1, D35) -------------------------------------------------------------------

describe('class status', () => {
  it('only the tutor pauses, resumes and ends; ended classes stay readable', async () => {
    const { tutor, parent, child, classId } = await confirmedClass();
    expect((await api(parent).post(`/classes/${classId}/pause`)).status).toBe(403);

    const paused = await api(tutor).post(`/classes/${classId}/pause`);
    expect(paused.status).toBe(200);
    expect(ClassDetail.parse(paused.body)).toMatchObject({
      status: 'paused',
      enrollments: [{ status: 'paused' }],
    });
    expect((await api(tutor).post(`/classes/${classId}/pause`)).status).toBe(409);

    const resumed = await api(tutor).post(`/classes/${classId}/resume`);
    expect(ClassDetail.parse(resumed.body)).toMatchObject({
      status: 'active',
      enrollments: [{ status: 'active' }],
    });

    expect((await api(tutor).post(`/classes/${classId}/end`, {})).status).toBe(422);
    const ended = await api(tutor).post(`/classes/${classId}/end`, { reason: 'Hết học kỳ' });
    expect(ended.status).toBe(200);
    const cls = ClassDetail.parse(ended.body);
    // Lớp bắt đầu 2026-12-01 (sau hôm nay): ngày kết thúc không sớm hơn ngày bắt đầu.
    expect(cls).toMatchObject({
      status: 'ended',
      endedReason: 'Hết học kỳ',
      endedOn: '2026-12-01',
      enrollments: [{ status: 'left', leftOn: '2026-12-01' }],
    });

    // Lớp đã kết thúc: không đổi được gì nữa, nhưng các bên vẫn xem được.
    for (const call of [
      api(tutor).post(`/classes/${classId}/resume`),
      api(tutor).patch(`/classes/${classId}`, { name: 'Lớp mới' }),
      api(tutor).post(`/classes/${classId}/enrollments/${cls.enrollmentId}/fee-rates`, {
        sessionPriceVnd: 300_000,
        sessionMinutes: 90,
      }),
    ]) {
      expect((await call).status).toBe(409);
    }
    expect((await getClass(parent, classId)).status).toBe('ended');
    const list = ClassList.parse((await api(parent).get(`/classes?state=ended`)).body);
    expect(list.items.map((c) => c.id)).toContain(classId);
    expect(await createLearnerAccess(db.manager).teachesStudent(tutor.id, child.id)).toBe(true);
  });

  it('the tutor names and unnames the class', async () => {
    const { tutor, parent, classId } = await confirmedClass();
    const named = await api(tutor).patch(`/classes/${classId}`, { name: '  Toán 8 – ôn thi  ' });
    expect(ClassDetail.parse(named.body).name).toBe('Toán 8 – ôn thi');
    expect((await getClass(parent, classId)).name).toBe('Toán 8 – ôn thi');
    const cleared = await api(tutor).patch(`/classes/${classId}`, { name: '' });
    expect(ClassDetail.parse(cleared.body).name).toBeNull();
  });
});

// ---- Đổi học phí (D17, B.5.3) ------------------------------------------------------------------------

describe('fee changes', () => {
  it('a new fee applies only after the parent accepts', async () => {
    const { tutor, parent, classId } = await confirmedClass();
    const { enrollmentId } = await getClass(tutor, classId);
    const base = `/classes/${classId}/enrollments/${enrollmentId}/fee-rates`;

    expect((await api(parent).post(base, { sessionPriceVnd: 1, sessionMinutes: 90 })).status).toBe(
      403,
    );
    const invalid = await api(tutor).post(base, { sessionPriceVnd: 0, sessionMinutes: 5 });
    expect(invalid.status).toBe(422);
    expect(fieldCodes(invalid)).toEqual(
      expect.arrayContaining([
        'sessionPriceVnd:invalid_amount',
        'sessionMinutes:invalid_session_minutes',
      ]),
    );

    const proposed = await api(tutor).post(base, {
      sessionPriceVnd: 300_000,
      sessionMinutes: 120,
      note: 'Tăng thời lượng ôn thi',
    });
    expect(proposed.status).toBe(201);
    const afterPropose = ClassDetail.parse(proposed.body);
    expect(afterPropose.feeChangePending).toBe(true);
    // Mức đang áp dụng chưa đổi.
    expect(afterPropose.currentFee).toMatchObject({ sessionPriceVnd: 250_000 });
    const proposal = afterPropose.enrollments[0]!.feeRates[0]!;
    expect(proposal).toMatchObject({ status: 'proposed', source: 'proposal', effectiveFrom: null });

    const again = await api(tutor).post(base, { sessionPriceVnd: 320_000, sessionMinutes: 120 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('fee_change_pending');

    // Gia sư không tự đồng ý được; phụ huynh không rút được.
    expect((await api(tutor).post(`${base}/${proposal.id}/accept`)).status).toBe(403);
    expect((await api(parent).post(`${base}/${proposal.id}/withdraw`)).status).toBe(403);

    const accepted = await api(parent).post(`${base}/${proposal.id}/accept`);
    expect(accepted.status).toBe(200);
    const cls = ClassDetail.parse(accepted.body);
    expect(cls.feeChangePending).toBe(false);
    expect(cls.currentFee).toMatchObject({ sessionPriceVnd: 300_000, sessionMinutes: 120 });
    expect(cls.enrollments[0]!.feeRates.map((r) => r.status)).toEqual(['active', 'superseded']);
    expect((await api(parent).post(`${base}/${proposal.id}/accept`)).status).toBe(409);
  });

  it('the parent rejects or the tutor withdraws a proposal', async () => {
    const { tutor, parent, classId } = await confirmedClass();
    const { enrollmentId } = await getClass(tutor, classId);
    const base = `/classes/${classId}/enrollments/${enrollmentId}/fee-rates`;

    const first = ClassDetail.parse(
      (await api(tutor).post(base, { sessionPriceVnd: 300_000, sessionMinutes: 90 })).body,
    ).enrollments[0]!.feeRates[0]!;
    const rejected = await api(parent).post(`${base}/${first.id}/reject`);
    expect(ClassDetail.parse(rejected.body).currentFee).toMatchObject({ sessionPriceVnd: 250_000 });

    const second = ClassDetail.parse(
      (await api(tutor).post(base, { sessionPriceVnd: 280_000, sessionMinutes: 90 })).body,
    ).enrollments[0]!.feeRates[0]!;
    const withdrawn = await api(tutor).post(`${base}/${second.id}/withdraw`);
    expect(ClassDetail.parse(withdrawn.body).enrollments[0]!.feeRates.map((r) => r.status)).toEqual(
      ['withdrawn', 'rejected', 'active'],
    );
  });

  it('a pending proposal is withdrawn when the class ends', async () => {
    const { tutor, classId } = await confirmedClass();
    const { enrollmentId } = await getClass(tutor, classId);
    await api(tutor).post(`/classes/${classId}/enrollments/${enrollmentId}/fee-rates`, {
      sessionPriceVnd: 300_000,
      sessionMinutes: 90,
    });
    const ended = ClassDetail.parse(
      (await api(tutor).post(`/classes/${classId}/end`, { reason: 'Dừng học' })).body,
    );
    expect(ended.feeChangePending).toBe(false);
    expect(ended.enrollments[0]!.feeRates[0]!.status).toBe('withdrawn');
  });

  it('another parent cannot touch the fee (404)', async () => {
    const { tutor, classId } = await confirmedClass();
    const { enrollmentId, enrollments } = await getClass(tutor, classId);
    const outsider = await createUser(['parent'], 'Người ngoài');
    const rateId = enrollments[0]!.feeRates[0]!.id;
    const res = await api(outsider).post(
      `/classes/${classId}/enrollments/${enrollmentId}/fee-rates/${rateId}/accept`,
    );
    expect(res.status).toBe(404);
  });
});

// ---- Mục tiêu học tập ----------------------------------------------------------------------------------

describe('learning goals', () => {
  it('the tutor sets goals and records the result; parent and student read them', async () => {
    const { tutor, parent, child, classId } = await confirmedClass();
    const student = await createStudentAccount(child);
    const { enrollmentId } = await getClass(tutor, classId);
    const base = `/classes/${classId}/enrollments/${enrollmentId}/goals`;

    const bad = await api(tutor).post(base, {
      periodType: 'month',
      periodStart: '2026-12-31',
      periodEnd: '2026-12-01',
      description: 'Làm chắc phương trình',
    });
    expect(bad.status).toBe(422);
    expect(fieldCodes(bad)).toContain('periodEnd:period_end_before_start');
    expect(
      (
        await api(parent).post(base, {
          periodType: 'month',
          periodStart: '2026-12-01',
          periodEnd: '2026-12-31',
          description: 'x',
        })
      ).status,
    ).toBe(403);

    const created = await api(tutor).post(base, {
      periodType: 'month',
      periodStart: '2026-12-01',
      periodEnd: '2026-12-31',
      description: 'Làm chắc phương trình bậc nhất',
    });
    expect(created.status).toBe(201);
    const goal = ClassDetail.parse(created.body).enrollments[0]!.goals[0]!;
    expect(goal).toMatchObject({ status: 'active', progressNote: null });

    const updated = await api(tutor).patch(`${base}/${goal.id}`, {
      status: 'achieved',
      progressNote: 'Làm đúng 9/10 bài',
    });
    expect(updated.status).toBe(200);
    const shrink = await api(tutor).patch(`${base}/${goal.id}`, { periodEnd: '2026-11-30' });
    expect(shrink.status).toBe(422);
    expect(fieldCodes(shrink)).toContain('periodEnd:period_end_before_start');

    for (const user of [parent, student]) {
      expect((await getClass(user, classId)).enrollments[0]!.goals[0]).toMatchObject({
        status: 'achieved',
        progressNote: 'Làm đúng 9/10 bài',
      });
    }
  });
});

// ---- Xóa hồ sơ con khi đã có lớp (C2) ------------------------------------------------------------------

describe('deleting a learner with classes', () => {
  it('is blocked while a class is active or paused, allowed once it has ended', async () => {
    const { tutor, parent, child, classId } = await confirmedClass();
    const blocked = await api(parent).delete(`/learners/${child.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('learner_in_class');

    await api(tutor).post(`/classes/${classId}/end`, { reason: 'Kết thúc' });
    expect((await api(parent).delete(`/learners/${child.id}`)).status).toBe(204);
    // Lịch sử lớp còn nguyên cho gia sư; phụ huynh không còn thấy hồ sơ đã xóa.
    expect((await getClass(tutor, classId)).status).toBe('ended');
    expect((await api(parent).get(`/classes/${classId}`)).status).toBe(404);
  });
});

// ---- Migration tạo lớp cho yêu cầu đã xác nhận trước G6 --------------------------------------------------

describe('migration backfill', () => {
  // Chạy sau cùng: gỡ migration buổi học và lớp học (xóa mọi lớp) rồi chạy lại.
  it('creates a class for every confirmed request', async () => {
    const { tutor, requestId } = await confirmedClass();
    // Gỡ CreateLessons rồi CreateTeachingClasses, chạy lại cả hai.
    await db.undoLastMigration();
    await db.undoLastMigration();
    await db.runMigrations();
    const [row] = await db.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM connection_requests r
        WHERE r.status = 'confirmed'
          AND NOT EXISTS (SELECT 1 FROM tutoring_classes c WHERE c.created_from_request_id = r.id)`,
    );
    expect(row?.n).toBe(0);
    const detail = ConnectionRequestDetail.parse(
      (await api(tutor).get(`/connection-requests/${requestId}`)).body,
    );
    const cls = await getClass(tutor, detail.classId!);
    expect(cls).toMatchObject({
      status: 'active',
      startedOn: '2026-12-01',
      currentFee: { sessionPriceVnd: 250_000, sessionMinutes: 90 },
      enrollments: [{ feeRates: [{ source: 'terms', status: 'active' }] }],
    });
  });
});
