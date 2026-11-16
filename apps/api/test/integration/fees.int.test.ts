// Học phí (G7) qua HTTP với PostgreSQL thật (Testcontainers): job lập bảng tháng trước từ các buổi đã chốt (C6, D23,
// D40), giá đã chụp lúc điểm danh khi đổi học phí giữa tháng (D17), buổi vắng, gia sư vắng, hủy muộn, học bù và khiếu
// nại (C5: buổi khiếu nại chưa tính, chốt muộn thì vào bảng sau hoặc bảng lập lại), hủy bảng để lập lại (B.10.1), ghi
// nhận và xác nhận thanh toán (D41), nhắc đến hạn (D24), quyền theo vai trò, thông báo.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  ClassDetail,
  ConnectionRequestDetail,
  FeeMonthDetail,
  FeeOverview,
  Learner,
  LessonDetail,
  type NotificationType,
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
import { createClassesService } from '../../src/modules/classes/classes.service.js';
import { createConnectionsService } from '../../src/modules/connections/connections.service.js';
import { createFeesMaintenance } from '../../src/modules/fees/fees-maintenance.js';
import { createFeesService } from '../../src/modules/fees/fees.service.js';
import { createLearnersService } from '../../src/modules/learners/learners.service.js';
import type { StudentInvitationsService } from '../../src/modules/learners/student-invitations.service.js';
import { createLessonsMaintenance } from '../../src/modules/lessons/lessons-maintenance.js';
import { createLessonsService } from '../../src/modules/lessons/lessons.service.js';
import type { MessagingService } from '../../src/modules/messaging/messaging.service.js';
import {
  createNotificationsService,
  type Notifier,
} from '../../src/modules/notifications/notifications.service.js';
import type { ParentsService } from '../../src/modules/parents/parents.service.js';
import type { RequestPostsService } from '../../src/modules/request-posts/request-posts.service.js';
import type { SafetyService } from '../../src/modules/safety/safety.service.js';
import type { TutorPostsService } from '../../src/modules/tutor-posts/tutor-posts.service.js';
import type { TutorsService } from '../../src/modules/tutors/tutors.service.js';
import type { AccountService } from '../../src/modules/users/account.service.js';
import { createUsersRepository } from '../../src/modules/users/users.repository.js';
import type { VerificationReviewService } from '../../src/modules/verification/verification-review.service.js';
import type { VerificationService } from '../../src/modules/verification/verification.service.js';
import { noopRealtime } from '../../src/realtime/realtime.js';
import { silentLogger, TEST_JWT_SECRET, TEST_ORIGIN, testEnv } from '../helpers.js';

jest.setTimeout(240_000);

let postgres: StartedPostgreSqlContainer;
let db: DataSource;
let app: Express;
let notifier: Notifier;
const tokens = createTokenService({ secret: TEST_JWT_SECRET });
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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

  notifier = createNotificationsService({
    dataSource: db,
    realtime: noopRealtime,
    sendEmail: async () => undefined,
    webUrl: 'https://tps.test',
    logger: silentLogger,
  }).notifier;
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
    notifications: {} as never,
    safety: {} as SafetyService,
    classes: createClassesService({
      dataSource: db,
      logger: silentLogger,
      publicFileUrl,
      notifier,
    }),
    lessons: createLessonsService({ dataSource: db, logger: silentLogger, notifier }),
    fees: createFeesService({ dataSource: db, logger: silentLogger, notifier }),
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
  auth: string;
}

async function createUser(roles: Role[], displayName = `Người dùng ${counter + 1}`) {
  counter += 1;
  const [row] = await db.query<{ id: string }[]>(
    `INSERT INTO users (email, email_verified_at, display_name, full_name, phone)
     VALUES ($1, now(), $2, $2, $3) RETURNING id`,
    [`${roles[0]}${Date.now()}${counter}@example.com`, displayName, `09${30_000_000 + counter}`],
  );
  const id = row!.id;
  for (const role of roles) {
    await db.query(`INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2)`, [id, role]);
  }
  const { token } = tokens.signAccessToken({ userId: id, sessionFamilyId: randomUUID() });
  return { id, auth: `Bearer ${token}` } satisfies TestUser;
}

async function createTutor(): Promise<TestUser> {
  const tutor = await createUser(['tutor'], 'Thầy Bảo');
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
    put: (path: string, body?: object) => prepare(request(app).put(`/api/v1${path}`)).send(body),
    patch: (path: string, body?: object) =>
      prepare(request(app).patch(`/api/v1${path}`)).send(body),
  };
};

const fieldCodes = (res: request.Response) =>
  (res.body.error.details as { path: string; code: string }[]).map((d) => `${d.path}:${d.code}`);

/** Lớp đã xác nhận hợp tác: 250.000đ / 90 phút. */
async function setup() {
  const tutor = await createTutor();
  const parent = await createUser(['parent'], 'Chị Lan');
  const childRes = await api(parent).post('/learners', {
    fullName: 'Trần Minh Khang',
    nickname: 'Bin',
    dateOfBirth: '2012-05-20',
    gradeLevelId: ids.grade8,
    relationship: 'mother',
    acceptChildDataProcessing: true,
  });
  expect(childRes.status).toBe(201);
  const child = Learner.parse(childRes.body);
  const sent = await api(parent).post('/connection-requests', {
    direction: 'client_to_tutor',
    tutorId: tutor.id,
    learnerId: child.id,
    subjectId: ids.math,
    gradeLevelId: ids.grade8,
    goal: 'reinforce',
    teachingMode: 'online',
    message: 'Nhờ thầy kèm Toán.',
  });
  expect(sent.status).toBe(201);
  const requestId = sent.body.id as string;
  await api(tutor).post(`/connection-requests/${requestId}/accept`);
  await api(tutor).post(`/connection-requests/${requestId}/terms`, {
    gradeLevelId: ids.grade8,
    goal: 'reinforce',
    teachingMode: 'online',
    sessionPriceVnd: 250_000,
    sessionMinutes: 90,
  });
  await api(tutor).post(`/connection-requests/${requestId}/confirm`, { version: 1 });
  const confirmed = ConnectionRequestDetail.parse(
    (await api(parent).post(`/connection-requests/${requestId}/confirm`, { version: 1 })).body,
  );
  const classId = confirmed.classId!;
  // Lớp bắt đầu từ 10 ngày trước, để ghi được các buổi đã diễn ra.
  await db.query(`UPDATE tutoring_classes SET started_on = started_on - 10 WHERE id = $1`, [
    classId,
  ]);
  await db.query(`UPDATE class_enrollments SET joined_on = joined_on - 10 WHERE class_id = $1`, [
    classId,
  ]);
  const student = await createUser(['student'], 'Bin');
  await db.query(`UPDATE learners SET account_user_id = $2 WHERE id = $1`, [child.id, student.id]);
  const cls = ClassDetail.parse((await api(tutor).get(`/classes/${classId}`)).body);
  return { tutor, parent, student, child, classId, enrollmentId: cls.enrollmentId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** Gia sư tạo một buổi lẻ bắt đầu sau `offsetMs` (âm: đã diễn ra). */
async function oneOff(s: Setup, offsetMs: number, minutes = 90): Promise<LessonDetail> {
  const res = await api(s.tutor).post(`/classes/${s.classId}/lessons`, {
    startsAt: new Date(Date.now() + offsetMs).toISOString(),
    durationMinutes: minutes,
    teachingMode: 'online',
    onlineUrl: 'https://meet.example.com/abc',
  });
  expect(res.status).toBe(201);
  return LessonDetail.parse(res.body);
}

async function record(s: Setup, lessonId: string, status = 'present') {
  const res = await api(s.tutor).put(`/lessons/${lessonId}/attendance`, {
    outcome: 'held',
    contentTaught: 'Phương trình bậc nhất',
    actualMinutes: 90,
    attendances: [{ enrollmentId: s.enrollmentId, status, comment: null }],
  });
  expect(res.status).toBe(200);
  return LessonDetail.parse(res.body);
}

async function confirm(s: Setup, lesson: LessonDetail) {
  const res = await api(s.parent).post(
    `/lessons/${lesson.id}/attendances/${lesson.attendances[0]!.id}/confirm`,
  );
  expect(res.status).toBe(200);
}

async function notificationsOf(userId: string, type: NotificationType) {
  return db.query<{ data: Record<string, unknown> }[]>(
    `SELECT data FROM notifications WHERE user_id = $1 AND type = $2 ORDER BY created_at`,
    [userId, type],
  );
}

const VN_MONTH_START = `date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')`;

/** Tháng trước (giờ Việt Nam), dạng `YYYY-MM`. */
async function previousMonth(): Promise<string> {
  const [row] = await db.query<{ m: string }[]>(
    `SELECT to_char(${VN_MONTH_START} - interval '1 month', 'YYYY-MM') AS m`,
  );
  return row!.m;
}

/** Dời buổi về ngày `day` của tháng trước, 18:00 giờ Việt Nam (dữ liệu tháng trước cho job). */
async function moveToPreviousMonth(lessonId: string, day: number) {
  const at = (minutes: number) =>
    `((${VN_MONTH_START} - interval '1 month')
       + make_interval(days => $2 - 1, hours => 18, mins => ${minutes})) AT TIME ZONE 'Asia/Ho_Chi_Minh'`;
  await db.query(`UPDATE lessons SET starts_at = ${at(0)}, ends_at = ${at(90)} WHERE id = $1`, [
    lessonId,
    day,
  ]);
}

const runJob = () => createFeesMaintenance({ dataSource: db, notifier }).run();

async function monthDetail(user: TestUser, s: Setup, month: string) {
  const res = await api(user).get(`/fees/enrollments/${s.enrollmentId}?month=${month}`);
  expect(res.status).toBe(200);
  return FeeMonthDetail.parse(res.body);
}

/**
 * Tháng trước có 7 buổi: L1 có mặt (phụ huynh xác nhận), L2 có mặt (tự chốt sau 48 giờ), L3 vắng có báo, L4 có mặt
 * nhưng bị khiếu nại, L5 phụ huynh hủy muộn, L6 học bù cho L5 sau khi học phí tăng lên 300.000đ, L7 gia sư vắng.
 */
async function previousMonthHistory(s: Setup) {
  const l1 = await record(s, (await oneOff(s, -9 * DAY)).id);
  await confirm(s, l1);
  const l2 = await record(s, (await oneOff(s, -8 * DAY)).id);
  const l3 = await record(s, (await oneOff(s, -7 * DAY)).id, 'absent_notified');
  await confirm(s, l3);
  const l4 = await record(s, (await oneOff(s, -6 * DAY)).id);
  const disputed = await api(s.parent).post(
    `/lessons/${l4.id}/attendances/${l4.attendances[0]!.id}/dispute`,
    { reason: 'Con nghỉ hôm đó', claimedStatus: 'absent_notified' },
  );
  expect(disputed.status).toBe(200);

  // L5: buổi bắt đầu sau 1 giờ, phụ huynh báo hủy: hủy muộn (C5).
  const l5 = await oneOff(s, HOUR);
  const cancelled = await api(s.parent).post(`/lessons/${l5.id}/cancel`, { reason: 'Con ốm' });
  expect(LessonDetail.parse(cancelled.body)).toMatchObject({
    status: 'cancelled',
    isLateCancellation: true,
  });

  // Học phí tăng từ đây (D17): chỉ các buổi điểm danh sau đó dùng giá mới.
  const proposed = ClassDetail.parse(
    (
      await api(s.tutor).post(`/classes/${s.classId}/enrollments/${s.enrollmentId}/fee-rates`, {
        sessionPriceVnd: 300_000,
        sessionMinutes: 90,
      })
    ).body,
  );
  const rateId = proposed.enrollments[0]!.feeRates.find((r) => r.status === 'proposed')!.id;
  const accepted = await api(s.parent).post(
    `/classes/${s.classId}/enrollments/${s.enrollmentId}/fee-rates/${rateId}/accept`,
  );
  expect(accepted.status).toBe(200);

  const makeup = await api(s.tutor).post(`/classes/${s.classId}/lessons`, {
    startsAt: new Date(Date.now() - 4 * DAY).toISOString(),
    durationMinutes: 90,
    teachingMode: 'online',
    makeupForLessonId: l5.id,
  });
  expect(makeup.status).toBe(201);
  const l6 = await record(s, LessonDetail.parse(makeup.body).id);
  await confirm(s, l6);

  const l7res = await api(s.tutor).put(`/lessons/${(await oneOff(s, -3 * DAY)).id}/attendance`, {
    outcome: 'tutor_absent',
    attendances: [],
  });
  expect(l7res.status).toBe(200);
  const l7 = LessonDetail.parse(l7res.body);
  await confirm(s, l7);

  // L2: hết 48 giờ thì tự chốt theo điểm danh của gia sư.
  await db.query(
    `UPDATE lesson_attendances SET confirm_due_at = now() - interval '1 minute' WHERE id = $1`,
    [l2.attendances[0]!.id],
  );
  await createLessonsMaintenance({ dataSource: db }).run();

  const lessons = { l1, l2, l3, l4, l5, l6, l7 };
  let day = 2;
  for (const lesson of Object.values(lessons)) {
    await moveToPreviousMonth(lesson.id, day);
    day += 2;
  }
  return lessons;
}

// ---- Lập bảng học phí tháng (C6, D23, D40) -------------------------------------------------------

describe('monthly statements', () => {
  it('bills only settled, billable sessions at their recorded price', async () => {
    const s = await setup();
    const { l1, l2, l3, l4, l5, l6, l7 } = await previousMonthHistory(s);
    const month = await previousMonth();

    // Trước khi lập bảng: tạm tính theo các buổi đã chốt.
    const before = await monthDetail(s.parent, s, month);
    expect(before.statement).toBeNull();
    expect(before.sessions).toMatchObject({
      billable: 3,
      billableAmountVnd: 800_000,
      disputed: 1,
      notBillable: 2,
      cancelled: 1,
    });

    expect(await runJob()).toBeGreaterThanOrEqual(1);
    const detail = await monthDetail(s.parent, s, month);
    expect(detail.statement).toMatchObject({
      month,
      status: 'issued',
      billableSessions: 3,
      totalAmountVnd: 800_000,
      paidAmountVnd: 0,
      balanceVnd: 800_000,
    });
    // Hạn ngày 5 tháng kế tiếp, hoặc hôm nay nếu đã qua ngày 5 (D24).
    const [due] = await db.query<{ due: string }[]>(
      `SELECT GREATEST((${VN_MONTH_START} + interval '4 days')::date,
                       (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS due`,
    );
    expect(detail.statement!.dueDate).toBe(due!.due);

    const byLesson = new Map(detail.lines.map((line) => [line.lessonId, line]));
    expect(byLesson.get(l1.id)).toMatchObject({
      state: 'billed',
      amountVnd: 250_000,
      billedIn: month,
    });
    expect(byLesson.get(l2.id)).toMatchObject({
      state: 'billed',
      confirmationStatus: 'auto_confirmed',
      amountVnd: 250_000,
    });
    expect(byLesson.get(l3.id)).toMatchObject({
      state: 'not_billable',
      attendanceStatus: 'absent_notified',
      amountVnd: 0,
    });
    expect(byLesson.get(l4.id)).toMatchObject({ state: 'disputed', billedIn: null });
    expect(byLesson.get(l5.id)).toMatchObject({ state: 'cancelled', isLateCancellation: true });
    expect(byLesson.get(l6.id)).toMatchObject({
      state: 'billed',
      sessionPriceVnd: 300_000,
      amountVnd: 300_000,
    });
    expect(byLesson.get(l7.id)).toMatchObject({
      state: 'not_billable',
      lessonStatus: 'tutor_absent',
    });

    // Báo phụ huynh; chạy lại không lập trùng.
    expect(await notificationsOf(s.parent.id, 'fee_statement')).toEqual([
      { data: expect.objectContaining({ event: 'issued', month, enrollmentId: s.enrollmentId }) },
    ]);
    await runJob();
    const [count] = await db.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM fee_statements WHERE enrollment_id = $1`,
      [s.enrollmentId],
    );
    expect(count!.n).toBe(1);

    // Tổng hợp tháng của gia sư.
    const overview = FeeOverview.parse(
      (await api(s.tutor).get(`/fees/overview?month=${month}`)).body,
    );
    expect(overview.rows).toHaveLength(1);
    expect(overview.rows[0]).toMatchObject({ myRole: 'tutor', enrollmentId: s.enrollmentId });
    expect(overview.totals).toEqual({
      totalVnd: 800_000,
      paidVnd: 0,
      outstandingVnd: 800_000,
      provisionalVnd: 0,
      disputedSessions: 1,
    });
  });

  it('a dispute settled later goes into the reissued statement, never twice', async () => {
    const s = await setup();
    const { l4 } = await previousMonthHistory(s);
    const month = await previousMonth();
    await runJob();
    const first = (await monthDetail(s.tutor, s, month)).statement!;

    // Phụ huynh rút khiếu nại: buổi được chốt, chưa thuộc bảng nào.
    const withdrawn = await api(s.parent).post(
      `/lessons/${l4.id}/attendances/${l4.attendances[0]!.id}/dispute/withdraw`,
    );
    expect(withdrawn.status).toBe(200);
    await runJob();
    const after = await monthDetail(s.tutor, s, month);
    expect(after.statement!.id).toBe(first.id);
    expect(after.lines.find((l) => l.lessonId === l4.id)).toMatchObject({
      state: 'billable',
      billedIn: null,
    });

    // Chỉ gia sư hủy bảng, bắt buộc lý do; bảng mới gồm cả buổi vừa chốt.
    const voidPath = `/fees/statements/${first.id}/void`;
    expect((await api(s.parent).post(voidPath, { reason: 'Lập lại' })).status).toBe(403);
    expect((await api(s.tutor).post(voidPath, {})).status).toBe(422);
    const reissued = FeeMonthDetail.parse(
      (await api(s.tutor).post(voidPath, { reason: 'Thêm buổi đã thống nhất khiếu nại' })).body,
    );
    expect(reissued.statement).toMatchObject({
      status: 'issued',
      billableSessions: 4,
      totalAmountVnd: 1_050_000,
    });
    expect(reissued.statement!.id).not.toBe(first.id);
    expect(reissued.voidedStatements).toEqual([
      expect.objectContaining({ id: first.id, status: 'void', voidReason: expect.any(String) }),
    ]);
    expect(reissued.lines.filter((l) => l.state === 'billed')).toHaveLength(4);
    // Bảng đã hủy: không thao tác được nữa; xem theo id bảng cũ thì ra bảng hiện hành.
    expect((await api(s.tutor).post(voidPath, { reason: 'x' })).status).toBe(409);
    const viaOld = FeeMonthDetail.parse(
      (await api(s.parent).get(`/fees/statements/${first.id}`)).body,
    );
    expect(viaOld.statement!.id).toBe(reissued.statement!.id);
    expect(await notificationsOf(s.parent.id, 'fee_statement')).toEqual([
      { data: expect.objectContaining({ event: 'issued' }) },
      { data: expect.objectContaining({ event: 'voided', counterpartName: 'Thầy Bảo' }) },
    ]);
  });

  it('reminds the parent once when the statement is due', async () => {
    const s = await setup();
    await previousMonthHistory(s);
    await runJob();
    await db.query(
      `UPDATE fee_statements SET due_date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, due_reminded_at = NULL
        WHERE enrollment_id = $1`,
      [s.enrollmentId],
    );
    await runJob();
    await runJob();
    const events = (await notificationsOf(s.parent.id, 'fee_statement')).map((n) => n.data.event);
    expect(events).toEqual(['issued', 'due']);
    const detail = await monthDetail(s.parent, s, await previousMonth());
    expect(detail.statement).toMatchObject({ overdue: true });
  });
});

// ---- Thanh toán (D6, D41) ------------------------------------------------------------------------

describe('payments', () => {
  it('counts a payment only once the other party confirms it', async () => {
    const s = await setup();
    await previousMonthHistory(s);
    await runJob();
    const month = await previousMonth();
    const statementId = (await monthDetail(s.parent, s, month)).statement!.id;
    const pay = (user: TestUser, body: object) =>
      api(user).post(`/fees/statements/${statementId}/payments`, body);
    const [todayRow] = await db.query<{ today: string }[]>(
      `SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS today`,
    );
    const today = todayRow!.today;

    // Kiểm tra số tiền, ngày trả, hình thức.
    const tooMuch = await pay(s.parent, { amountVnd: 900_000, method: 'cash', paidOn: today });
    expect(tooMuch.status).toBe(422);
    expect(fieldCodes(tooMuch)).toEqual(['amountVnd:payment_exceeds_balance']);
    const future = await pay(s.parent, { amountVnd: 1, method: 'cash', paidOn: '2099-01-01' });
    expect(fieldCodes(future)).toEqual(['paidOn:paid_on_in_future']);
    expect(
      (await pay(s.parent, { amountVnd: 1, method: 'online_gateway', paidOn: today })).status,
    ).toBe(422);

    // Phụ huynh ghi nhận 500.000đ: chờ gia sư xác nhận, chưa tính là đã trả.
    const recordedRes = await pay(s.parent, {
      amountVnd: 500_000,
      method: 'bank_transfer',
      paidOn: today,
      reference: 'CK 123',
    });
    expect(recordedRes.status).toBe(201);
    const recorded = FeeMonthDetail.parse(recordedRes.body);
    expect(recorded.statement).toMatchObject({
      status: 'issued',
      paidAmountVnd: 0,
      pendingAmountVnd: 500_000,
      awaitingMe: false,
    });
    const paymentId = recorded.payments[0]!.id;
    expect(recorded.payments[0]).toMatchObject({
      status: 'recorded',
      recordedBy: 'client',
      reference: 'CK 123',
      mine: true,
      awaitingMe: false,
    });
    expect(await notificationsOf(s.tutor.id, 'fee_statement')).toEqual([
      { data: expect.objectContaining({ event: 'payment_recorded', counterpartName: 'Chị Lan' }) },
    ]);
    // Khoản đang chờ cũng tính vào giới hạn số tiền.
    expect(
      (await pay(s.parent, { amountVnd: 300_001, method: 'cash', paidOn: today })).status,
    ).toBe(422);

    // Gia sư thấy khoản chờ mình ở tổng hợp tháng hiện tại; phụ huynh không tự xác nhận được.
    const current = today.slice(0, 7);
    const overview = FeeOverview.parse(
      (await api(s.tutor).get(`/fees/overview?month=${current}`)).body,
    );
    expect(overview.awaitingMe).toEqual([
      expect.objectContaining({
        statementId,
        month,
        payment: expect.objectContaining({ id: paymentId, awaitingMe: true }),
      }),
    ]);
    expect(overview.unpaidOtherMonths).toEqual({ count: 1, balanceVnd: 800_000 });
    const path = `/fees/statements/${statementId}/payments/${paymentId}`;
    expect((await api(s.parent).post(`${path}/acknowledge`)).status).toBe(403);
    expect((await api(s.tutor).post(`${path}/void`)).status).toBe(403);

    const acked = FeeMonthDetail.parse((await api(s.tutor).post(`${path}/acknowledge`)).body);
    expect(acked.statement).toMatchObject({
      status: 'partially_paid',
      paidAmountVnd: 500_000,
      balanceVnd: 300_000,
    });
    expect((await api(s.tutor).post(`${path}/acknowledge`)).status).toBe(409);
    // Đã có khoản được xác nhận: không hủy bảng được nữa.
    expect(
      (await api(s.tutor).post(`/fees/statements/${statementId}/void`, { reason: 'x' })).status,
    ).toBe(409);

    // Gia sư báo chưa nhận được; phụ huynh tự hủy một khoản khác.
    const second = FeeMonthDetail.parse(
      (await pay(s.parent, { amountVnd: 300_000, method: 'cash', paidOn: today })).body,
    );
    const secondId = second.payments.find((p) => p.status === 'recorded')!.id;
    const declined = FeeMonthDetail.parse(
      (
        await api(s.tutor).post(`/fees/statements/${statementId}/payments/${secondId}/decline`, {
          note: 'Chưa thấy tiền',
        })
      ).body,
    );
    expect(declined.payments.find((p) => p.id === secondId)).toMatchObject({
      status: 'declined',
      note: 'Chưa thấy tiền',
    });
    const third = FeeMonthDetail.parse(
      (await pay(s.parent, { amountVnd: 300_000, method: 'cash', paidOn: today })).body,
    );
    const thirdId = third.payments.find((p) => p.status === 'recorded')!.id;
    const voided = await api(s.parent).post(
      `/fees/statements/${statementId}/payments/${thirdId}/void`,
    );
    expect(voided.status).toBe(200);

    // Gia sư ghi nhận đã nhận tiền mặt; phụ huynh xác nhận: đã trả đủ.
    const byTutor = FeeMonthDetail.parse(
      (await pay(s.tutor, { amountVnd: 300_000, method: 'cash', paidOn: today })).body,
    );
    const tutorPayment = byTutor.payments.find((p) => p.status === 'recorded')!;
    expect(tutorPayment).toMatchObject({ recordedBy: 'tutor', mine: true });
    const paid = FeeMonthDetail.parse(
      (
        await api(s.parent).post(
          `/fees/statements/${statementId}/payments/${tutorPayment.id}/acknowledge`,
        )
      ).body,
    );
    expect(paid.statement).toMatchObject({
      status: 'paid',
      paidAmountVnd: 800_000,
      balanceVnd: 0,
      overdue: false,
    });
    expect(paid.payments.map((p) => p.status).sort()).toEqual([
      'acknowledged',
      'acknowledged',
      'declined',
      'voided',
    ]);
    expect((await pay(s.parent, { amountVnd: 1, method: 'cash', paidOn: today })).status).toBe(422);
    const parentEvents = (await notificationsOf(s.parent.id, 'fee_statement')).map(
      (n) => n.data.event,
    );
    expect(parentEvents).toEqual([
      'issued',
      'payment_acknowledged',
      'payment_declined',
      'payment_recorded',
    ]);
  });
});

// ---- Quyền ---------------------------------------------------------------------------------------

describe('fee access', () => {
  it('students and outsiders do not see tuition', async () => {
    const s = await setup();
    await previousMonthHistory(s);
    await runJob();
    const month = await previousMonth();
    const statementId = (await monthDetail(s.tutor, s, month)).statement!.id;
    const enrollmentPath = `/fees/enrollments/${s.enrollmentId}?month=${month}`;

    expect((await api(s.student).get(enrollmentPath)).status).toBe(403);
    expect((await api(s.student).get(`/fees/statements/${statementId}`)).status).toBe(403);
    const studentOverview = await api(s.student).get(`/fees/overview?month=${month}`);
    expect(FeeOverview.parse(studentOverview.body).rows).toEqual([]);

    const outsider = await createUser(['parent']);
    expect((await api(outsider).get(enrollmentPath)).status).toBe(404);
    expect((await api(outsider).get(`/fees/statements/${statementId}`)).status).toBe(404);
    const payment = await api(outsider).post(`/fees/statements/${statementId}/payments`, {
      amountVnd: 1,
      method: 'cash',
      paidOn: '2026-01-01',
    });
    expect(payment.status).toBe(404);
    const outsiderOverview = await api(outsider).get(`/fees/overview?month=${month}`);
    expect(FeeOverview.parse(outsiderOverview.body).rows).toEqual([]);
    expect((await api(null).get(`/fees/overview?month=${month}`)).status).toBe(401);
    expect((await api(s.parent).get(`/fees/overview?month=2026-13`)).status).toBe(422);
  });
});
