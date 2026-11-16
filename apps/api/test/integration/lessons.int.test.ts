// Lịch, buổi học, điểm danh, xác nhận, khiếu nại, điểm (G6 đợt 2) qua HTTP với PostgreSQL thật (Testcontainers):
// sinh buổi từ lịch lặp 8 tuần (D27) không trùng, sửa / dừng lịch, tạm nghỉ hủy và học lại khôi phục buổi (B.5.1),
// hủy muộn (C5), điểm danh chụp giá học phí (D17), sửa điểm danh (D37), xác nhận / khiếu nại 48 giờ (C5), chuyển
// Manager (D38) và Manager quyết định (B.8), job nhắc và tự chốt, điểm và nhận xét (§9), quyền theo vai trò, thông báo.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  AdminDispute,
  AdminDisputeList,
  Assessment,
  ClassDetail,
  ConnectionRequestDetail,
  Learner,
  LessonDetail,
  LessonList,
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
  return api(s.tutor).put(`/lessons/${lessonId}/attendance`, {
    outcome: 'held',
    contentTaught: 'Phương trình bậc nhất',
    actualMinutes: 90,
    attendances: [{ enrollmentId: s.enrollmentId, status, comment: 'Làm bài tốt' }],
  });
}

const calendar = async (user: TestUser, classId?: string) => {
  const from = new Date(Date.now() - DAY).toISOString();
  const to = new Date(Date.now() + 60 * DAY).toISOString();
  const res = await api(user).get(
    `/lessons?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${classId ? `&classId=${classId}` : ''}`,
  );
  expect(res.status).toBe(200);
  return LessonList.parse(res.body).items;
};

async function notificationsOf(userId: string, type: NotificationType) {
  return db.query<{ data: Record<string, unknown> }[]>(
    `SELECT data FROM notifications WHERE user_id = $1 AND type = $2 ORDER BY created_at`,
    [userId, type],
  );
}

// ---- Lịch lặp và sinh buổi (D27) ------------------------------------------------------------------

describe('weekly schedules', () => {
  it('generates 8 weeks of lessons at the local time, without duplicates', async () => {
    const s = await setup();
    const res = await api(s.tutor).post(`/classes/${s.classId}/schedules`, {
      weekdays: [1, 3, 5],
      startTime: '18:00',
      durationMinutes: 90,
      startDate: '2026-01-01',
      teachingMode: 'online',
      onlineUrl: 'https://meet.example.com/abc',
    });
    expect(res.status).toBe(201);
    const cls = ClassDetail.parse(res.body);
    expect(cls.schedules).toEqual([
      expect.objectContaining({ weekdays: [1, 3, 5], startTime: '18:00', status: 'active' }),
    ]);
    const lessons = await calendar(s.tutor, s.classId);
    // 8 tuần × 3 buổi, ±1 tùy hôm nay là thứ mấy và đã qua 18:00 chưa.
    expect(lessons.length).toBeGreaterThanOrEqual(23);
    expect(lessons.length).toBeLessThanOrEqual(25);
    for (const lesson of lessons) {
      // 18:00 giờ Việt Nam = 11:00 UTC; buổi dài 90 phút.
      expect(lesson.startsAt).toMatch(/T11:00:00\.000Z$/);
      expect(Date.parse(lesson.endsAt) - Date.parse(lesson.startsAt)).toBe(90 * 60_000);
      expect([1, 3, 5]).toContain(((new Date(lesson.startsAt).getUTCDay() + 6) % 7) + 1);
      expect(lesson).toMatchObject({ status: 'scheduled', myRole: 'tutor', awaitingMe: false });
    }
    // Job chạy lại không sinh trùng.
    await createLessonsMaintenance({ dataSource: db }).generate();
    await db.query(`UPDATE class_schedules SET generated_until = NULL`);
    await createLessonsMaintenance({ dataSource: db }).generate();
    expect(await calendar(s.tutor, s.classId)).toHaveLength(lessons.length);

    // Phụ huynh và học sinh cùng thấy lịch; người ngoài không thấy gì.
    expect(await calendar(s.parent, s.classId)).toHaveLength(lessons.length);
    expect((await calendar(s.student)).map((l) => l.myRole)).toContain('student');
    const outsider = await createUser(['parent']);
    expect(await calendar(outsider)).toEqual([]);
    expect((await api(outsider).get(`/lessons/${lessons[0]!.id}`)).status).toBe(404);
    expect((await api(s.parent).post(`/classes/${s.classId}/schedules`, {})).status).toBe(422);
  });

  it('replacing a schedule regenerates future lessons; ending it removes them', async () => {
    const s = await setup();
    const created = ClassDetail.parse(
      (
        await api(s.tutor).post(`/classes/${s.classId}/schedules`, {
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          startTime: '07:00',
          durationMinutes: 60,
          startDate: '2026-01-01',
          teachingMode: 'in_person',
          locationNote: 'Nhà học sinh',
        })
      ).body,
    );
    const scheduleId = created.schedules[0]!.id;
    expect((await calendar(s.tutor, s.classId)).length).toBeGreaterThanOrEqual(55);

    const replaced = await api(s.tutor).put(`/classes/${s.classId}/schedules/${scheduleId}`, {
      weekdays: [6],
      startTime: '09:30',
      durationMinutes: 120,
      startDate: '2026-01-01',
      teachingMode: 'online',
    });
    expect(replaced.status).toBe(200);
    const after = await calendar(s.tutor, s.classId);
    expect(after.length).toBeGreaterThanOrEqual(8);
    expect(after.length).toBeLessThanOrEqual(9);
    expect(after.every((l) => l.startsAt.endsWith('T02:30:00.000Z'))).toBe(true);

    const ended = await api(s.tutor).post(`/classes/${s.classId}/schedules/${scheduleId}/end`);
    expect(ClassDetail.parse(ended.body).schedules[0]!.status).toBe('ended');
    expect(await calendar(s.tutor, s.classId)).toEqual([]);
    expect(
      (await api(s.tutor).post(`/classes/${s.classId}/schedules/${scheduleId}/end`)).status,
    ).toBe(409);
  });

  it('rejects a calendar range longer than two months', async () => {
    const s = await setup();
    const res = await api(s.tutor).get(
      `/lessons?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z`,
    );
    expect(res.status).toBe(422);
    expect(fieldCodes(res)).toContain('to:range_too_long');
  });
});

// ---- Trạng thái lớp và buổi học (B.5.1) ------------------------------------------------------------

describe('class status and lessons', () => {
  it('pausing cancels future lessons, resuming restores them, ending cancels them', async () => {
    const s = await setup();
    await api(s.tutor).post(`/classes/${s.classId}/schedules`, {
      weekdays: [2, 4],
      startTime: '19:00',
      durationMinutes: 90,
      startDate: '2026-01-01',
      teachingMode: 'online',
    });
    const before = await calendar(s.tutor, s.classId);

    expect((await api(s.tutor).post(`/classes/${s.classId}/pause`)).status).toBe(200);
    const paused = await calendar(s.tutor, s.classId);
    expect(paused.every((l) => l.status === 'cancelled' && l.cancelKind === 'class_paused')).toBe(
      true,
    );
    expect(paused.every((l) => l.cancelledBy === 'system' && !l.isLateCancellation)).toBe(true);
    expect(await notificationsOf(s.parent.id, 'class_status')).toEqual([
      { data: expect.objectContaining({ status: 'paused', counterpartName: 'Thầy Bảo' }) },
    ]);
    expect(await notificationsOf(s.student.id, 'class_status')).toHaveLength(1);
    // Lớp tạm nghỉ: không tạo buổi lẻ.
    expect(
      (
        await api(s.tutor).post(`/classes/${s.classId}/lessons`, {
          startsAt: new Date(Date.now() + DAY).toISOString(),
          durationMinutes: 60,
          teachingMode: 'online',
        })
      ).status,
    ).toBe(409);

    await api(s.tutor).post(`/classes/${s.classId}/resume`);
    const resumed = await calendar(s.tutor, s.classId);
    expect(resumed).toHaveLength(before.length);
    expect(resumed.every((l) => l.status === 'scheduled')).toBe(true);

    await api(s.tutor).post(`/classes/${s.classId}/end`, { reason: 'Hết khóa' });
    const ended = await calendar(s.tutor, s.classId);
    expect(ended.every((l) => l.cancelKind === 'class_ended')).toBe(true);
    const cls = ClassDetail.parse((await api(s.tutor).get(`/classes/${s.classId}`)).body);
    expect(cls.schedules[0]!.status).toBe('ended');
  });

  it('reschedules, cancels late, and creates make-up lessons', async () => {
    const s = await setup();
    const soon = await oneOff(s, HOUR);
    // Học sinh chỉ xem; phụ huynh không dời buổi.
    expect((await api(s.student).post(`/lessons/${soon.id}/cancel`, { reason: 'x' })).status).toBe(
      403,
    );
    expect((await api(s.parent).patch(`/lessons/${soon.id}`, { durationMinutes: 60 })).status).toBe(
      403,
    );

    const moved = await api(s.tutor).patch(`/lessons/${soon.id}`, {
      startsAt: new Date(Date.now() + 90 * 60_000).toISOString(),
    });
    expect(moved.status).toBe(200);
    expect(await notificationsOf(s.parent.id, 'lesson_changed')).toEqual([
      { data: expect.objectContaining({ change: 'rescheduled', lessonId: soon.id }) },
    ]);
    const past = await api(s.tutor).patch(`/lessons/${soon.id}`, {
      startsAt: new Date(Date.now() - HOUR).toISOString(),
    });
    expect(fieldCodes(past)).toContain('startsAt:lesson_time_out_of_range');

    // Phụ huynh báo hủy dưới 2 giờ trước giờ học: hủy muộn (C5); gia sư nhận thông báo.
    const cancelled = LessonDetail.parse(
      (await api(s.parent).post(`/lessons/${soon.id}/cancel`, { reason: 'Con bị ốm' })).body,
    );
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'client',
      cancelKind: 'party',
      isLateCancellation: true,
      cancelReason: 'Con bị ốm',
    });
    expect(await notificationsOf(s.tutor.id, 'lesson_changed')).toEqual([
      { data: expect.objectContaining({ change: 'cancelled', counterpartName: 'Chị Lan' }) },
    ]);
    expect((await api(s.tutor).post(`/lessons/${soon.id}/cancel`, { reason: 'x' })).status).toBe(
      409,
    );

    // Hủy sớm hơn 2 giờ: không phải hủy muộn.
    const later = await oneOff(s, 3 * DAY);
    const early = LessonDetail.parse(
      (await api(s.tutor).post(`/lessons/${later.id}/cancel`, { reason: 'Bận' })).body,
    );
    expect(early).toMatchObject({ cancelledBy: 'tutor', isLateCancellation: false });

    // Học bù chỉ cho buổi đã hủy / gia sư vắng.
    const upcoming = await oneOff(s, 4 * DAY);
    const invalid = await api(s.tutor).post(`/classes/${s.classId}/lessons`, {
      startsAt: new Date(Date.now() + 5 * DAY).toISOString(),
      durationMinutes: 90,
      teachingMode: 'online',
      makeupForLessonId: upcoming.id,
    });
    expect(fieldCodes(invalid)).toContain('makeupForLessonId:makeup_invalid');
    const makeup = await api(s.tutor).post(`/classes/${s.classId}/lessons`, {
      startsAt: new Date(Date.now() + 5 * DAY).toISOString(),
      durationMinutes: 90,
      teachingMode: 'online',
      makeupForLessonId: soon.id,
    });
    expect(LessonDetail.parse(makeup.body).makeupForLessonId).toBe(soon.id);
  });
});

// ---- Điểm danh và xác nhận (B.6, B.7, C5, D17, D37) -------------------------------------------------

describe('attendance and confirmation', () => {
  it('records attendance with the fee in force, edits it, and the parent confirms', async () => {
    const s = await setup();
    const future = await oneOff(s, DAY);
    expect((await record(s, future.id)).status).toBe(409);

    const lesson = await oneOff(s, -3 * HOUR);
    const todo = LessonList.parse((await api(s.tutor).get('/lessons/todo')).body);
    expect(todo.items.map((l) => l.id)).toContain(lesson.id);
    expect(todo.items.find((l) => l.id === lesson.id)!.awaitingMe).toBe(true);
    expect(
      fieldCodes(
        await api(s.tutor).put(`/lessons/${lesson.id}/attendance`, {
          outcome: 'held',
          attendances: [],
        }),
      ),
    ).toContain('attendances:attendance_incomplete');
    expect(
      (await api(s.parent).put(`/lessons/${lesson.id}/attendance`, { outcome: 'tutor_absent' }))
        .status,
    ).toBe(403);

    const recorded = LessonDetail.parse((await record(s, lesson.id)).body);
    expect(recorded).toMatchObject({ status: 'held', contentTaught: 'Phương trình bậc nhất' });
    expect(recorded.attendances[0]).toMatchObject({
      status: 'present',
      sessionPriceVnd: 250_000,
      sessionMinutes: 90,
      isBillable: true,
      billableAmountVnd: 250_000,
      confirmationStatus: 'pending',
    });
    const due = Date.parse(recorded.attendances[0]!.confirmDueAt);
    expect(Math.abs(due - (Date.now() + 48 * HOUR))).toBeLessThan(60_000);
    expect(await notificationsOf(s.parent.id, 'lesson_to_confirm')).toHaveLength(1);

    // Học sinh không thấy học phí.
    const forStudent = LessonDetail.parse((await api(s.student).get(`/lessons/${lesson.id}`)).body);
    expect(forStudent.attendances[0]).toMatchObject({
      sessionPriceVnd: null,
      isBillable: null,
      comment: 'Làm bài tốt',
    });

    // Phụ huynh thấy việc cần xác nhận.
    const parentTodo = LessonList.parse((await api(s.parent).get('/lessons/todo')).body);
    expect(parentTodo.items.find((l) => l.id === lesson.id)?.awaitingMe).toBe(true);

    // Sửa khi phụ huynh chưa xác nhận: vắng có báo, không tính tiền, hạn tính lại (D37).
    await db.query(
      `UPDATE lesson_attendances SET confirm_due_at = now() + interval '1 hour' WHERE lesson_id = $1`,
      [lesson.id],
    );
    const edited = LessonDetail.parse((await record(s, lesson.id, 'absent_notified')).body);
    expect(edited.attendances[0]).toMatchObject({
      status: 'absent_notified',
      isBillable: false,
      billableAmountVnd: 0,
    });
    expect(Date.parse(edited.attendances[0]!.confirmDueAt)).toBeGreaterThan(Date.now() + 47 * HOUR);
    expect(await notificationsOf(s.parent.id, 'lesson_to_confirm')).toHaveLength(2);

    const attendanceId = edited.attendances[0]!.id;
    expect(
      (await api(s.tutor).post(`/lessons/${lesson.id}/attendances/${attendanceId}/confirm`)).status,
    ).toBe(403);
    const confirmed = LessonDetail.parse(
      (await api(s.parent).post(`/lessons/${lesson.id}/attendances/${attendanceId}/confirm`)).body,
    );
    expect(confirmed.attendances[0]!.confirmationStatus).toBe('confirmed');
    // Đã xác nhận: khóa (B.7).
    expect((await record(s, lesson.id)).status).toBe(409);
    expect(
      (await api(s.parent).post(`/lessons/${lesson.id}/attendances/${attendanceId}/confirm`))
        .status,
    ).toBe(409);
  });

  it('snapshots the fee: a new fee applies only to lessons recorded after it', async () => {
    const s = await setup();
    const first = await oneOff(s, -2 * DAY);
    await record(s, first.id);
    const proposal = ClassDetail.parse(
      (
        await api(s.tutor).post(`/classes/${s.classId}/enrollments/${s.enrollmentId}/fee-rates`, {
          sessionPriceVnd: 300_000,
          sessionMinutes: 120,
        })
      ).body,
    ).enrollments[0]!.feeRates[0]!;
    expect(await notificationsOf(s.parent.id, 'fee_change')).toEqual([
      { data: expect.objectContaining({ event: 'proposed' }) },
    ]);
    await api(s.parent).post(
      `/classes/${s.classId}/enrollments/${s.enrollmentId}/fee-rates/${proposal.id}/accept`,
    );
    expect(await notificationsOf(s.tutor.id, 'fee_change')).toEqual([
      { data: expect.objectContaining({ event: 'accepted', counterpartName: 'Chị Lan' }) },
    ]);
    const second = await oneOff(s, -HOUR * 3);
    const recorded = LessonDetail.parse((await record(s, second.id)).body);
    expect(recorded.attendances[0]).toMatchObject({
      sessionPriceVnd: 300_000,
      sessionMinutes: 120,
    });
    const old = LessonDetail.parse((await api(s.parent).get(`/lessons/${first.id}`)).body);
    expect(old.attendances[0]).toMatchObject({ sessionPriceVnd: 250_000 });
  });

  it('tutor absence is never billable', async () => {
    const s = await setup();
    const lesson = await oneOff(s, -HOUR * 2);
    const res = await api(s.tutor).put(`/lessons/${lesson.id}/attendance`, {
      outcome: 'tutor_absent',
    });
    expect(LessonDetail.parse(res.body)).toMatchObject({
      status: 'tutor_absent',
      attendances: [{ status: 'not_applicable', isBillable: false, billableAmountVnd: 0 }],
    });
  });
});

// ---- Khiếu nại (B.8) -------------------------------------------------------------------------------

describe('disputes', () => {
  async function disputed(s: Setup) {
    const lesson = await oneOff(s, -5 * HOUR);
    const attendanceId = LessonDetail.parse((await record(s, lesson.id)).body).attendances[0]!.id;
    const res = await api(s.parent).post(
      `/lessons/${lesson.id}/attendances/${attendanceId}/dispute`,
      {
        reason: 'Hôm đó con vắng có báo trước',
        claimedStatus: 'absent_notified',
      },
    );
    expect(res.status).toBe(200);
    return { lessonId: lesson.id, attendanceId, detail: LessonDetail.parse(res.body) };
  }

  it('the tutor amends and the parent settles', async () => {
    const s = await setup();
    const { lessonId, attendanceId, detail } = await disputed(s);
    expect(detail.attendances[0]).toMatchObject({
      confirmationStatus: 'disputed',
      dispute: { status: 'open', claimedStatus: 'absent_notified' },
    });
    expect(await notificationsOf(s.tutor.id, 'lesson_dispute')).toEqual([
      { data: expect.objectContaining({ event: 'opened', counterpartName: 'Chị Lan' }) },
    ]);
    const amended = LessonDetail.parse((await record(s, lessonId, 'absent_notified')).body);
    expect(amended.attendances[0]).toMatchObject({
      status: 'absent_notified',
      isBillable: false,
      confirmationStatus: 'disputed',
    });
    const settled = LessonDetail.parse(
      (await api(s.parent).post(`/lessons/${lessonId}/attendances/${attendanceId}/dispute/settle`))
        .body,
    );
    expect(settled.attendances[0]).toMatchObject({
      confirmationStatus: 'resolved',
      dispute: { status: 'settled_by_parties' },
    });
  });

  it('escalates to a manager, who decides and is audit-logged', async () => {
    const s = await setup();
    const { lessonId, attendanceId } = await disputed(s);
    expect(
      (
        await api(s.student).post(
          `/lessons/${lessonId}/attendances/${attendanceId}/dispute/escalate`,
        )
      ).status,
    ).toBe(403);
    const escalated = LessonDetail.parse(
      (await api(s.tutor).post(`/lessons/${lessonId}/attendances/${attendanceId}/dispute/escalate`))
        .body,
    );
    expect(escalated.attendances[0]!.dispute!.status).toBe('escalated');
    expect(await notificationsOf(s.parent.id, 'lesson_dispute')).toEqual([
      { data: expect.objectContaining({ event: 'escalated' }) },
    ]);

    const manager = await createUser(['manager']);
    expect((await api(s.tutor).get('/admin/attendance-disputes')).status).toBe(403);
    const queue = AdminDisputeList.parse(
      (await api(manager).get('/admin/attendance-disputes')).body,
    );
    const item = queue.items.find((d) => d.lesson.id === lessonId)!;
    expect(item).toMatchObject({
      status: 'escalated',
      tutorName: 'Thầy Bảo',
      clientName: 'Chị Lan',
    });
    expect(JSON.stringify(item)).not.toContain('Trần Minh Khang');

    const invalid = await api(manager).post(`/admin/attendance-disputes/${item.id}/resolve`, {
      lessonStatus: 'held',
      attendanceStatus: 'not_applicable',
      note: 'x',
    });
    expect(invalid.status).toBe(422);
    const resolved = AdminDispute.parse(
      (
        await api(manager).post(`/admin/attendance-disputes/${item.id}/resolve`, {
          lessonStatus: 'held',
          attendanceStatus: 'absent_notified',
          note: 'Phụ huynh có tin nhắn báo vắng trước buổi học',
        })
      ).body,
    );
    expect(resolved).toMatchObject({
      status: 'resolved_by_manager',
      attendance: { status: 'absent_notified' },
    });
    const forParent = LessonDetail.parse((await api(s.parent).get(`/lessons/${lessonId}`)).body);
    expect(forParent.attendances[0]).toMatchObject({
      status: 'absent_notified',
      isBillable: false,
      confirmationStatus: 'resolved',
    });
    const [audit] = await db.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM audit_logs
        WHERE action = 'attendance_dispute.resolved' AND entity_id = $1 AND actor_user_id = $2`,
      [item.id, manager.id],
    );
    expect(audit!.n).toBe(1);
    expect(
      (
        await api(manager).post(`/admin/attendance-disputes/${item.id}/resolve`, {
          lessonStatus: 'held',
          attendanceStatus: 'present',
          note: 'again',
        })
      ).status,
    ).toBe(409);
  });

  it('the parent withdraws a dispute', async () => {
    const s = await setup();
    const { lessonId, attendanceId } = await disputed(s);
    const res = await api(s.parent).post(
      `/lessons/${lessonId}/attendances/${attendanceId}/dispute/withdraw`,
    );
    expect(LessonDetail.parse(res.body).attendances[0]).toMatchObject({
      status: 'present',
      isBillable: true,
      confirmationStatus: 'resolved',
      dispute: { status: 'withdrawn' },
    });
  });
});

// ---- Job (C5, D36) -----------------------------------------------------------------------------------

describe('lessons maintenance job', () => {
  it('reminds, auto-confirms and escalates', async () => {
    const s = await setup();
    const upcoming = await oneOff(s, 5 * HOUR);
    const unrecorded = await oneOff(s, -2 * DAY);
    const toRemind = await oneOff(s, -10 * HOUR);
    const attendanceToRemind = LessonDetail.parse((await record(s, toRemind.id)).body)
      .attendances[0]!;
    const overdue = await oneOff(s, -9 * HOUR);
    await record(s, overdue.id);
    const disputedLesson = await oneOff(s, -8 * HOUR);
    const disputedAttendance = LessonDetail.parse((await record(s, disputedLesson.id)).body)
      .attendances[0]!;
    await api(s.parent).post(
      `/lessons/${disputedLesson.id}/attendances/${disputedAttendance.id}/dispute`,
      { reason: 'Sai giờ' },
    );

    await db.query(
      `UPDATE lesson_attendances SET confirm_due_at = now() + interval '10 hours' WHERE id = $1`,
      [attendanceToRemind.id],
    );
    await db.query(
      `UPDATE lesson_attendances SET confirm_due_at = now() - interval '1 minute' WHERE lesson_id = $1`,
      [overdue.id],
    );
    await db.query(
      `UPDATE attendance_disputes SET negotiate_until = now() - interval '1 minute'
        WHERE attendance_id = $1`,
      [disputedAttendance.id],
    );

    const maintenance = createLessonsMaintenance({ dataSource: db, notifier });
    expect(await maintenance.run()).toBeGreaterThanOrEqual(5);

    const upcomingFor = await notificationsOf(s.student.id, 'lesson_upcoming');
    expect(upcomingFor.map((n) => n.data.lessonId)).toContain(upcoming.id);
    expect(
      (await notificationsOf(s.tutor.id, 'attendance_reminder')).map((n) => n.data.lessonId),
    ).toEqual([unrecorded.id]);
    expect(
      (await notificationsOf(s.parent.id, 'lesson_to_confirm')).filter((n) => n.data.reminder),
    ).toEqual([{ data: expect.objectContaining({ lessonId: toRemind.id, reminder: true }) }]);
    const auto = LessonDetail.parse((await api(s.parent).get(`/lessons/${overdue.id}`)).body);
    expect(auto.attendances[0]!.confirmationStatus).toBe('auto_confirmed');
    const escalated = LessonDetail.parse(
      (await api(s.parent).get(`/lessons/${disputedLesson.id}`)).body,
    );
    expect(escalated.attendances[0]!.dispute!.status).toBe('escalated');

    // Chạy lại: không nhắc lần hai.
    await maintenance.run();
    expect(await notificationsOf(s.tutor.id, 'attendance_reminder')).toHaveLength(1);
  });
});

// ---- Điểm và nhận xét (§9) ---------------------------------------------------------------------------

describe('assessments', () => {
  it('the tutor records scores with comments; parent and student read them', async () => {
    const s = await setup();
    const base = `/classes/${s.classId}/enrollments/${s.enrollmentId}/assessments`;
    const body = {
      kind: 'test',
      title: 'Kiểm tra 15 phút',
      score: 8.5,
      maxScore: 10,
      comment: 'Nắm chắc kiến thức, cần trình bày gọn hơn',
      assessedOn: '2026-11-15',
    };
    expect((await api(s.parent).post(base, body)).status).toBe(403);
    const tooHigh = await api(s.tutor).post(base, { ...body, score: 11 });
    expect(fieldCodes(tooHigh)).toContain('score:score_above_max');
    expect((await api(s.tutor).post(base, { ...body, comment: '' })).status).toBe(422);
    const scheduled = await oneOff(s, DAY);
    const notHeld = await api(s.tutor).post(base, { ...body, lessonId: scheduled.id });
    expect(fieldCodes(notHeld)).toContain('lessonId:invalid');

    const created = await api(s.tutor).post(base, body);
    expect(created.status).toBe(201);
    const assessment = Assessment.parse(created.body);
    expect(assessment).toMatchObject({ score: 8.5, maxScore: 10 });
    expect(await notificationsOf(s.parent.id, 'assessment_new')).toHaveLength(1);
    expect(await notificationsOf(s.student.id, 'assessment_new')).toHaveLength(1);

    const updated = await api(s.tutor).patch(`${base}/${assessment.id}`, { score: 9 });
    expect(Assessment.parse(updated.body).score).toBe(9);
    for (const user of [s.parent, s.student]) {
      const cls = ClassDetail.parse((await api(user).get(`/classes/${s.classId}`)).body);
      expect(cls.enrollments[0]!.assessments).toEqual([
        expect.objectContaining({ id: assessment.id, score: 9, comment: body.comment }),
      ]);
    }
  });
});
