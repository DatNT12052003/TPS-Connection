// Thông báo, chặn và báo cáo (G5 đợt 3) qua HTTP (Supertest) với PostgreSQL thật (Testcontainers): thông báo cho
// từng sự kiện của yêu cầu kết nối và tin nhắn (§12), gộp thông báo tin nhắn, tùy chọn theo loại, email không có
// thông tin của trẻ, nhắc sắp hết hạn từ job, chặn (hủy yêu cầu đang mở, không gửi được nữa) và báo cáo vi phạm.
// Email và sự kiện realtime được ghi lại thay vì gửi đi.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  BlockList,
  ConnectionRequestDetail,
  Learner,
  Message,
  NotificationList,
  NotificationPreferences,
  REALTIME_EVENTS,
  type Role,
} from '@tps/shared';
import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApp } from '../../src/app.js';
import { createDataSource } from '../../src/db/data-source.js';
import type { EmailMessage } from '../../src/lib/email/email-sender.js';
import { createMemoryRateLimiter } from '../../src/lib/rate-limiter.js';
import type { Storage } from '../../src/lib/storage.js';
import type { AdminAccountsService } from '../../src/modules/admin/admin-accounts.service.js';
import type { AdminCatalogService } from '../../src/modules/admin/admin-catalog.service.js';
import type { AuthService } from '../../src/modules/auth/auth.service.js';
import { createTokenService } from '../../src/modules/auth/tokens.js';
import type { CatalogService } from '../../src/modules/catalog/catalog.service.js';
import { createConnectionsMaintenance } from '../../src/modules/connections/connections-maintenance.js';
import { createConnectionsService } from '../../src/modules/connections/connections.service.js';
import { createFilesService } from '../../src/modules/files/files.service.js';
import { createLearnersService } from '../../src/modules/learners/learners.service.js';
import type { StudentInvitationsService } from '../../src/modules/learners/student-invitations.service.js';
import { createMessagingService } from '../../src/modules/messaging/messaging.service.js';
import { createNotificationsService } from '../../src/modules/notifications/notifications.service.js';
import type { ParentsService } from '../../src/modules/parents/parents.service.js';
import { createRequestPostsService } from '../../src/modules/request-posts/request-posts.service.js';
import { createSafetyService } from '../../src/modules/safety/safety.service.js';
import type { ClassesService } from '../../src/modules/classes/classes.service.js';
import type { LessonsService } from '../../src/modules/lessons/lessons.service.js';
import type { TutorPostsService } from '../../src/modules/tutor-posts/tutor-posts.service.js';
import type { TutorsService } from '../../src/modules/tutors/tutors.service.js';
import type { AccountService } from '../../src/modules/users/account.service.js';
import { createUsersRepository } from '../../src/modules/users/users.repository.js';
import type { VerificationReviewService } from '../../src/modules/verification/verification-review.service.js';
import type { VerificationService } from '../../src/modules/verification/verification.service.js';
import type { RealtimePublisher } from '../../src/realtime/realtime.js';
import { silentLogger, TEST_JWT_SECRET, TEST_ORIGIN, testEnv } from '../helpers.js';

jest.setTimeout(180_000);

let postgres: StartedPostgreSqlContainer;
let db: DataSource;
let app: Express;
let runMaintenance: () => Promise<number>;
const tokens = createTokenService({ secret: TEST_JWT_SECRET });

const sentEmails: EmailMessage[] = [];
const emitted: { userId: string; event: string; payload: unknown }[] = [];
const realtime: RealtimePublisher = {
  emitToUser: (userId, event, payload) => emitted.push({ userId, event, payload }),
};

const ids = { math: 0, grade8: 0, hanoi: 0 };

beforeAll(async () => {
  postgres = await new PostgreSqlContainer('postgres:18.6-alpine').start();
  db = createDataSource({ DATABASE_URL: postgres.getConnectionUri(), DATABASE_POOL_MAX: 4 });
  await db.initialize();
  await db.runMigrations();

  const one = async (sql: string, params: unknown[] = []) =>
    (await db.query<{ id: number }[]>(sql, params))[0]!.id;
  ids.math = await one(`SELECT id FROM subjects WHERE code = 'math'`);
  ids.grade8 = await one(`SELECT id FROM grade_levels WHERE code = 'grade_8'`);
  ids.hanoi = await one(
    `INSERT INTO administrative_areas (code, level, unit_type, name, full_name, name_ascii)
     VALUES ('01', 'province', 'municipality', 'Ha Noi', 'Ha Noi', 'Ha Noi') RETURNING id`,
  );

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
  const notifications = createNotificationsService({
    dataSource: db,
    realtime,
    sendEmail: async (message) => {
      sentEmails.push(message);
    },
    webUrl: 'https://tps.test/',
    logger: silentLogger,
  });
  const { notifier } = notifications;
  runMaintenance = () => createConnectionsMaintenance({ dataSource: db, notifier }).run();
  const storage = {} as Storage;
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
    requestPosts: createRequestPostsService({ dataSource: db, logger: silentLogger }),
    connections: createConnectionsService({
      dataSource: db,
      logger: silentLogger,
      publicFileUrl,
      realtime,
      notifier,
    }),
    messaging: createMessagingService({
      dataSource: db,
      files: createFilesService({ storage, logger: silentLogger }),
      storage,
      realtime,
      notifier,
      logger: silentLogger,
      publicFileUrl,
    }),
    notifications,
    safety: createSafetyService({ dataSource: db, logger: silentLogger, publicFileUrl }),
    classes: {} as ClassesService,
    lessons: {} as LessonsService,
  });
});

afterAll(async () => {
  await db?.destroy();
  await postgres?.stop();
});

beforeEach(() => {
  sentEmails.length = 0;
  emitted.length = 0;
});

// ---- Tiện ích ---------------------------------------------------------------------------------

let counter = 0;

interface TestUser {
  id: string;
  email: string;
  displayName: string;
  auth: string;
}

async function createUser(roles: Role[]): Promise<TestUser> {
  counter += 1;
  const email = `${roles[0]}${Date.now()}${counter}@example.com`;
  const displayName = `Người dùng ${counter}`;
  const [row] = await db.query<{ id: string }[]>(
    `INSERT INTO users (email, email_verified_at, display_name, full_name, phone)
     VALUES ($1, now(), $2, 'Họ Tên Thật', '0912345678') RETURNING id`,
    [email, displayName],
  );
  const id = row!.id;
  for (const role of roles) {
    await db.query(`INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2)`, [id, role]);
  }
  const { token } = tokens.signAccessToken({ userId: id, sessionFamilyId: randomUUID() });
  return { id, email, displayName, auth: `Bearer ${token}` };
}

async function createTutor(): Promise<TestUser> {
  const tutor = await createUser(['tutor']);
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
    delete: (path: string) => prepare(request(app).delete(`/api/v1${path}`)),
  };
};

const CHILD = { fullName: 'Trần Minh Khang', nickname: 'Bin', schoolName: 'THCS Nguyễn Du' };

async function createChild(parent: TestUser): Promise<Learner> {
  const res = await api(parent).post('/learners', {
    ...CHILD,
    dateOfBirth: '2012-05-20',
    gradeLevelId: ids.grade8,
    provinceId: ids.hanoi,
    relationship: 'mother',
    acceptChildDataProcessing: true,
  });
  expect(res.status).toBe(201);
  return Learner.parse(res.body);
}

async function sendRequest(parent: TestUser, tutor: TestUser, child: Learner) {
  const res = await api(parent).post('/connection-requests', {
    direction: 'client_to_tutor',
    tutorId: tutor.id,
    learnerId: child.id,
    subjectId: ids.math,
    gradeLevelId: ids.grade8,
    goal: 'exam_prep',
    teachingMode: 'online',
    provinceId: ids.hanoi,
    message: 'Chào thầy, con tôi cần ôn thi.',
  });
  expect(res.status).toBe(201);
  return ConnectionRequestDetail.parse(res.body);
}

async function pair() {
  const tutor = await createTutor();
  const parent = await createUser(['parent']);
  const child = await createChild(parent);
  const sent = await sendRequest(parent, tutor, child);
  return { tutor, parent, child, requestId: sent.id };
}

async function accepted() {
  const ctx = await pair();
  const res = await api(ctx.tutor).post(`/connection-requests/${ctx.requestId}/accept`);
  expect(res.status).toBe(200);
  return { ...ctx, conversationId: ConnectionRequestDetail.parse(res.body).conversationId! };
}

async function notificationsOf(user: TestUser, query = '') {
  const res = await api(user).get(`/notifications${query}`);
  expect(res.status).toBe(200);
  return NotificationList.parse(res.body);
}

const unreadCount = async (user: TestUser) =>
  (await api(user).get('/notifications/unread')).body.count as number;

async function sendText(user: TestUser, conversationId: string, body: string) {
  const res = await api(user).post(`/conversations/${conversationId}/messages`, { body });
  expect(res.status).toBe(201);
  return Message.parse(res.body);
}

/** Không có thông tin nhận dạng của trẻ trong bất kỳ thông báo hay email nào (§12). */
async function expectNoChildData() {
  const rows = await db.query<{ data: unknown }[]>(`SELECT data FROM notifications`);
  const text = JSON.stringify([rows, sentEmails]);
  for (const secret of Object.values(CHILD)) expect(text).not.toContain(secret);
}

// ---- Thông báo theo sự kiện ----------------------------------------------------------------------

describe('connection notifications', () => {
  it('tells the tutor about a new request without revealing the parent or the child', async () => {
    const { tutor, requestId } = await pair();
    const list = await notificationsOf(tutor);
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({
      type: 'connection_received',
      readAt: null,
      data: { requestId, direction: 'client_to_tutor', subjectId: ids.math, counterpartName: null },
    });
    expect(await unreadCount(tutor)).toBe(1);

    expect(emitted).toEqual([
      expect.objectContaining({ userId: tutor.id, event: REALTIME_EVENTS.notificationNew }),
    ]);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({ to: tutor.email, subject: 'Bạn có yêu cầu kết nối mới' });
    expect(sentEmails[0]!.text).toContain(`https://tps.test/app/connections/${requestId}`);
    await expectNoChildData();
  });

  it('tells the sender when the request is accepted or rejected', async () => {
    const first = await pair();
    await api(first.tutor).post(`/connection-requests/${first.requestId}/accept`);
    const [acceptedNotice] = (await notificationsOf(first.parent)).items;
    expect(acceptedNotice).toMatchObject({
      type: 'connection_accepted',
      data: { requestId: first.requestId, counterpartName: first.tutor.displayName },
    });
    expect(sentEmails.find((m) => m.to === first.parent.email)?.subject).toBe(
      `${first.tutor.displayName} đã chấp nhận yêu cầu kết nối`,
    );

    const second = await pair();
    await api(second.tutor).post(`/connection-requests/${second.requestId}/reject`, {
      note: 'Lịch kín',
    });
    expect((await notificationsOf(second.parent)).items[0]).toMatchObject({
      type: 'connection_rejected',
      data: { requestId: second.requestId },
    });
    await expectNoChildData();
  });

  it('tells the other party when collaboration is confirmed', async () => {
    const { tutor, parent, requestId } = await accepted();
    await api(tutor).post(`/connection-requests/${requestId}/terms`, {
      gradeLevelId: ids.grade8,
      goal: 'exam_prep',
      teachingMode: 'online',
      provinceId: ids.hanoi,
      sessionPriceVnd: 200_000,
      sessionMinutes: 90,
    });
    await api(parent).post(`/connection-requests/${requestId}/confirm`, { version: 1 });
    await api(tutor).post(`/connection-requests/${requestId}/confirm`, { version: 1 });

    expect((await notificationsOf(parent)).items[0]).toMatchObject({
      type: 'connection_confirmed',
      data: { requestId, counterpartName: tutor.displayName },
    });
    // Gia sư bấm sau cùng: không nhận thông báo xác nhận của chính mình.
    expect((await notificationsOf(tutor)).items.map((n) => n.type)).not.toContain(
      'connection_confirmed',
    );
  });

  it('reminds the right people before a request expires (D30)', async () => {
    const pending = await pair();
    await db.query(
      `UPDATE connection_requests SET expires_at = now() + interval '12 hours' WHERE id = $1`,
      [pending.requestId],
    );
    const negotiating = await accepted();
    await db.query(
      `UPDATE connection_requests SET expires_at = now() + interval '2 days' WHERE id = $1`,
      [negotiating.requestId],
    );
    await runMaintenance();

    const expiring = async (user: TestUser) =>
      (await notificationsOf(user)).items.filter((n) => n.type === 'connection_expiring');
    // Đang chờ: chỉ bên phải trả lời (gia sư). Đang trao đổi: cả hai.
    expect(await expiring(pending.tutor)).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) }),
    ]);
    expect(await expiring(pending.parent)).toEqual([]);
    expect(await expiring(negotiating.tutor)).toHaveLength(1);
    expect(await expiring(negotiating.parent)).toHaveLength(1);

    // Chạy lại không nhắc lần hai.
    await runMaintenance();
    expect(await expiring(negotiating.parent)).toHaveLength(1);
  });
});

describe('message notifications', () => {
  it('keeps one unread notification per conversation and clears it when read', async () => {
    const { tutor, parent, conversationId } = await accepted();
    await sendText(parent, conversationId, 'Chào thầy');
    const last = await sendText(parent, conversationId, 'Thầy rảnh tối nay không?');

    const messages = (await notificationsOf(tutor)).items.filter((n) => n.type === 'message_new');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      readAt: null,
      data: { conversationId, counterpartName: parent.displayName, count: 2 },
    });
    // Email tin nhắn mặc định tắt.
    expect(
      sentEmails.filter((m) => m.to === tutor.email && m.subject.includes('Tin nhắn')),
    ).toEqual([]);

    await api(tutor).post(`/conversations/${conversationId}/read`, { messageId: last.id });
    const afterRead = (await notificationsOf(tutor, '?unread=true')).items;
    expect(afterRead.filter((n) => n.type === 'message_new')).toEqual([]);

    await sendText(parent, conversationId, 'Em gửi lại lịch');
    const fresh = (await notificationsOf(tutor, '?unread=true')).items.filter(
      (n) => n.type === 'message_new',
    );
    expect(fresh).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ count: 1 }) }),
    ]);
  });

  it('emails once per unread conversation when the recipient opts in', async () => {
    const { tutor, parent, conversationId } = await accepted();
    const put = await api(tutor).put('/me/notification-preferences', {
      items: [{ type: 'message_new', email: true }],
    });
    expect(put.status).toBe(200);
    sentEmails.length = 0;
    await sendText(parent, conversationId, 'Một');
    await sendText(parent, conversationId, 'Hai');
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({
      to: tutor.email,
      subject: `Tin nhắn mới từ ${parent.displayName}`,
    });
    // Không có nội dung tin trong email.
    expect(sentEmails[0]!.text).not.toContain('Một');
  });
});

// ---- Đọc, tùy chọn ------------------------------------------------------------------------------

describe('notification center and preferences', () => {
  it('marks one or all notifications as read, only for the owner', async () => {
    const { tutor, parent } = await pair();
    const [notice] = (await notificationsOf(tutor)).items;
    expect((await api(parent).post(`/notifications/${notice!.id}/read`)).status).toBe(404);
    expect((await api(tutor).post(`/notifications/${notice!.id}/read`)).status).toBe(204);
    expect(await unreadCount(tutor)).toBe(0);

    const other = await createUser(['parent']);
    await sendRequest(other, tutor, await createChild(other));
    expect(await unreadCount(tutor)).toBe(1);
    expect((await api(tutor).post('/notifications/read-all')).status).toBe(204);
    expect(await unreadCount(tutor)).toBe(0);
    expect((await api(null).get('/notifications')).status).toBe(401);
  });

  it('respects per-type preferences and stores only non-default choices', async () => {
    const tutor = await createTutor();
    const defaults = NotificationPreferences.parse(
      (await api(tutor).get('/me/notification-preferences')).body,
    );
    expect(defaults.items.find((p) => p.type === 'connection_received')).toEqual({
      type: 'connection_received',
      inApp: true,
      email: true,
    });
    expect(defaults.items.find((p) => p.type === 'verification_result')!.email).toBeNull();

    const updated = await api(tutor).put('/me/notification-preferences', {
      items: [
        { type: 'connection_received', inApp: false, email: false },
        { type: 'verification_result', email: true },
      ],
    });
    expect(NotificationPreferences.parse(updated.body).items).toEqual(
      expect.arrayContaining([
        { type: 'connection_received', inApp: false, email: false },
        { type: 'verification_result', inApp: true, email: null },
      ]),
    );

    const parent = await createUser(['parent']);
    await sendRequest(parent, tutor, await createChild(parent));
    expect((await notificationsOf(tutor)).total).toBe(0);
    expect(sentEmails.filter((m) => m.to === tutor.email)).toEqual([]);

    // Trở về mặc định thì dòng bị xóa.
    await api(tutor).put('/me/notification-preferences', {
      items: [{ type: 'connection_received', inApp: true, email: true }],
    });
    const [row] = await db.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM notification_preferences WHERE user_id = $1`,
      [tutor.id],
    );
    expect(row!.n).toBe(0);
  });
});

// ---- Chặn ---------------------------------------------------------------------------------------

describe('blocking', () => {
  it('cancels open requests, stops messages and new requests, and can be undone', async () => {
    const { tutor, parent, child, requestId, conversationId } = await accepted();
    const res = await api(parent).post('/me/blocks', { conversationId });
    expect(res.status).toBe(201);
    expect(BlockList.parse(res.body).items).toEqual([
      expect.objectContaining({ userId: tutor.id, displayName: tutor.displayName }),
    ]);

    const detail = ConnectionRequestDetail.parse(
      (await api(parent).get(`/connection-requests/${requestId}`)).body,
    );
    expect(detail).toMatchObject({ status: 'cancelled', cancelReason: 'ended_by_party' });
    const blockedSend = await api(tutor).post(`/conversations/${conversationId}/messages`, {
      body: 'Chào chị',
    });
    expect(blockedSend.body.error.code).toBe('conversation_closed');
    const again = await api(parent).post('/connection-requests', {
      direction: 'client_to_tutor',
      tutorId: tutor.id,
      learnerId: child.id,
      subjectId: ids.math,
      gradeLevelId: ids.grade8,
      goal: 'exam_prep',
      teachingMode: 'online',
      provinceId: ids.hanoi,
      message: 'Gửi lại',
    });
    expect(again.status).toBe(404);

    // Chặn lại không lỗi; bỏ chặn một lần.
    expect((await api(parent).post('/me/blocks', { tutorId: tutor.id })).status).toBe(201);
    expect((await api(parent).delete(`/me/blocks/${tutor.id}`)).status).toBe(204);
    expect((await api(parent).delete(`/me/blocks/${tutor.id}`)).status).toBe(404);
    expect(BlockList.parse((await api(parent).get('/me/blocks')).body).items).toEqual([]);
  });

  it('rejects unknown or invalid targets', async () => {
    const tutor = await createTutor();
    const outsider = await createUser(['parent']);
    expect((await api(tutor).post('/me/blocks', { tutorId: tutor.id })).status).toBe(404);
    expect((await api(outsider).post('/me/blocks', { tutorId: randomUUID() })).status).toBe(404);
    expect((await api(outsider).post('/me/blocks', { conversationId: randomUUID() })).status).toBe(
      404,
    );
    const both = await api(outsider).post('/me/blocks', {
      tutorId: tutor.id,
      conversationId: randomUUID(),
    });
    expect(both.status).toBe(422);
  });
});

// ---- Báo cáo ------------------------------------------------------------------------------------

describe('reporting', () => {
  const reportCount = async (reporter: TestUser) =>
    (
      await db.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM violation_reports WHERE reporter_id = $1`,
        [reporter.id],
      )
    )[0]!.n;

  it('records one open report per target and ignores repeats', async () => {
    const { tutor, parent } = await pair();
    const body = { targetType: 'tutor', tutorId: tutor.id, reasonCode: 'fake_profile' };
    const first = await api(parent).post('/reports', body);
    expect(first.status).toBe(202);
    expect(first.body).toEqual({ status: 'received' });
    expect((await api(parent).post('/reports', body)).status).toBe(202);
    expect(await reportCount(parent)).toBe(1);

    const invalid = await api(parent).post('/reports', { ...body, reasonCode: 'boring' });
    expect(invalid.status).toBe(422);
    expect((await api(tutor).post('/reports', body)).status).toBe(404);
  });

  it('reports messages and conversation partners only from inside the conversation', async () => {
    const { tutor, parent, conversationId } = await accepted();
    const own = await sendText(parent, conversationId, 'Tin của tôi');
    const theirs = await sendText(tutor, conversationId, 'Tin không phù hợp');
    const outsider = await createUser(['parent']);

    const report = (user: TestUser, messageId: string) =>
      api(user).post('/reports', {
        targetType: 'message',
        conversationId,
        messageId,
        reasonCode: 'harassment',
        description: 'Lời lẽ khó nghe',
      });
    expect((await report(parent, theirs.id)).status).toBe(202);
    expect((await report(parent, own.id)).status).toBe(404);
    expect((await report(outsider, theirs.id)).status).toBe(404);

    const user = await api(parent).post('/reports', {
      targetType: 'conversation_user',
      conversationId,
      reasonCode: 'harassment',
    });
    expect(user.status).toBe(202);
    const rows = await db.query<{ reported_user_id: string | null; message_id: string | null }[]>(
      `SELECT reported_user_id, message_id FROM violation_reports WHERE reporter_id = $1
        ORDER BY created_at`,
      [parent.id],
    );
    expect(rows).toEqual([
      { reported_user_id: null, message_id: theirs.id },
      { reported_user_id: tutor.id, message_id: null },
    ]);
  });

  it('only lets verified tutors report request posts they can see', async () => {
    const parent = await createUser(['parent']);
    const child = await createChild(parent);
    const created = await api(parent).post('/me/request-posts', {
      learnerId: child.id,
      subjectId: ids.math,
      gradeLevelId: ids.grade8,
      goal: 'reinforce',
      teachingMode: 'online',
    });
    expect(created.status).toBe(201);
    await api(parent).post(`/me/request-posts/${created.body.id}/status`, { status: 'open' });

    const body = { targetType: 'request_post', requestPostId: created.body.id, reasonCode: 'spam' };
    const verified = await createTutor();
    expect((await api(verified).post('/reports', body)).status).toBe(202);
    const unverified = await createUser(['tutor']);
    await db.query(`INSERT INTO tutor_profiles (user_id) VALUES ($1)`, [unverified.id]);
    expect((await api(unverified).post('/reports', body)).status).toBe(404);
  });
});
