// Nhắn tin (G5 đợt 2) qua HTTP (Supertest) với PostgreSQL thật (Testcontainers) và Socket.IO thật (adapter trong bộ
// nhớ): chat chỉ mở khi bên nhận chấp nhận (D14), chỉ hai bên thấy hội thoại, hủy thì chỉ còn xem (D32), tài khoản bị
// hạn chế và người bị chặn không gửi được, tệp đính kèm, đã đọc, xóa tin, phân trang theo khóa, sự kiện realtime và
// tạo hội thoại cho yêu cầu đã chấp nhận trước migration. Người dùng được tạo thẳng trong database và đăng nhập
// bằng access token ký sẵn.
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  AttachmentUrl,
  ConnectionRequestDetail,
  ConversationList,
  ConversationSummary,
  Learner,
  Message,
  MessagePage,
  REALTIME_EVENTS,
  type Role,
  UnreadSummary,
} from '@tps/shared';
import type { Express } from 'express';
import { io as connectSocket, type Socket } from 'socket.io-client';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApp } from '../../src/app.js';
import { createDataSource } from '../../src/db/data-source.js';
import { createMemoryRateLimiter } from '../../src/lib/rate-limiter.js';
import type { Storage } from '../../src/lib/storage.js';
import type { AdminAccountsService } from '../../src/modules/admin/admin-accounts.service.js';
import type { AdminCatalogService } from '../../src/modules/admin/admin-catalog.service.js';
import type { AuthService } from '../../src/modules/auth/auth.service.js';
import { createTokenService } from '../../src/modules/auth/tokens.js';
import type { CatalogService } from '../../src/modules/catalog/catalog.service.js';
import { createConnectionsService } from '../../src/modules/connections/connections.service.js';
import { createFilesService } from '../../src/modules/files/files.service.js';
import { createLearnersService } from '../../src/modules/learners/learners.service.js';
import type { StudentInvitationsService } from '../../src/modules/learners/student-invitations.service.js';
import { createMessagingService } from '../../src/modules/messaging/messaging.service.js';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service.js';
import type { SafetyService } from '../../src/modules/safety/safety.service.js';
import type { ParentsService } from '../../src/modules/parents/parents.service.js';
import type { RequestPostsService } from '../../src/modules/request-posts/request-posts.service.js';
import type { TutorPostsService } from '../../src/modules/tutor-posts/tutor-posts.service.js';
import type { TutorsService } from '../../src/modules/tutors/tutors.service.js';
import type { AccountService } from '../../src/modules/users/account.service.js';
import { createUsersRepository } from '../../src/modules/users/users.repository.js';
import type { VerificationReviewService } from '../../src/modules/verification/verification-review.service.js';
import type { VerificationService } from '../../src/modules/verification/verification.service.js';
import {
  createRealtimeServer,
  type RealtimePublisher,
  type RealtimeServer,
} from '../../src/realtime/realtime.js';
import { silentLogger, TEST_JWT_SECRET, TEST_ORIGIN, testEnv } from '../helpers.js';

jest.setTimeout(180_000);

let postgres: StartedPostgreSqlContainer;
let db: DataSource;
let app: Express;
const tokens = createTokenService({ secret: TEST_JWT_SECRET });

/** Kho lưu tệp giả: tệp "đã tải lên" là khóa có trong `uploaded`. */
const uploaded = new Map<string, { sizeBytes: number; contentType: string }>();
const fakeStorage: Pick<Storage, 'headObject' | 'createDownloadUrl'> = {
  async headObject(_bucket, storageKey) {
    return uploaded.get(storageKey) ?? null;
  },
  async createDownloadUrl(bucket, storageKey, options) {
    return `http://storage.test/${bucket}/${storageKey}?expires=${options?.expiresInSeconds}`;
  },
};

/** Sự kiện realtime đã đẩy; chuyển tiếp cho Socket.IO thật khi test realtime đang chạy. */
const emitted: { userId: string; event: string; payload: unknown }[] = [];
let realtimeServer: RealtimeServer | null = null;
const realtime: RealtimePublisher = {
  emitToUser(userId, event, payload) {
    emitted.push({ userId, event, payload });
    realtimeServer?.publisher.emitToUser(userId, event, payload);
  },
};

const ids = { math: 0, grade8: 0, hanoi: 0, baDinh: 0 };

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
    connections: createConnectionsService({
      dataSource: db,
      logger: silentLogger,
      publicFileUrl,
      realtime,
    }),
    messaging: createMessagingService({
      dataSource: db,
      files: createFilesService({
        storage: { ...fakeStorage } as unknown as Storage,
        logger: silentLogger,
      }),
      storage: fakeStorage,
      realtime,
      logger: silentLogger,
      publicFileUrl,
    }),
    notifications: {} as NotificationsService,
    safety: {} as SafetyService,
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
  token: string;
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
  return { id, email, fullName, phone, token, auth: `Bearer ${token}` };
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

/** Phụ huynh gửi gia sư một yêu cầu (còn `pending`). */
async function pendingRequest() {
  const tutor = await createTutor();
  const parent = await createUser(['parent'], 'Nguyễn Thị Lan');
  const child = await createChild(parent);
  const res = await api(parent).post('/connection-requests', {
    direction: 'client_to_tutor',
    tutorId: tutor.id,
    learnerId: child.id,
    subjectId: ids.math,
    gradeLevelId: ids.grade8,
    goal: 'exam_prep',
    teachingMode: 'online',
    provinceId: ids.hanoi,
    message: 'Chào thầy, con tôi cần ôn thi vào lớp 10.',
  });
  expect(res.status).toBe(201);
  const sent = ConnectionRequestDetail.parse(res.body);
  return { tutor, parent, child, requestId: sent.id, sent };
}

/** Yêu cầu đã được gia sư chấp nhận: hội thoại đã mở. */
async function openConversation() {
  const ctx = await pendingRequest();
  const accepted = await api(ctx.tutor).post(`/connection-requests/${ctx.requestId}/accept`);
  expect(accepted.status).toBe(200);
  const conversationId = ConnectionRequestDetail.parse(accepted.body).conversationId;
  expect(conversationId).not.toBeNull();
  return { ...ctx, conversationId: conversationId! };
}

async function sendMessage(user: TestUser, conversationId: string, body: object) {
  return api(user).post(`/conversations/${conversationId}/messages`, body);
}

async function sendText(user: TestUser, conversationId: string, text: string): Promise<Message> {
  const res = await sendMessage(user, conversationId, { body: text });
  expect(res.status).toBe(201);
  return Message.parse(res.body);
}

async function summary(user: TestUser, conversationId: string): Promise<ConversationSummary> {
  const res = await api(user).get(`/conversations/${conversationId}`);
  expect(res.status).toBe(200);
  return ConversationSummary.parse(res.body);
}

async function page(user: TestUser, conversationId: string, query = ''): Promise<MessagePage> {
  const res = await api(user).get(`/conversations/${conversationId}/messages${query}`);
  expect(res.status).toBe(200);
  return MessagePage.parse(res.body);
}

/** Một tệp đính kèm "đã tải lên" của U (bản ghi `files` chờ xác nhận + đối tượng có trong kho giả). */
async function uploadedFile(owner: TestUser, name = 'bai-tap.pdf'): Promise<string> {
  const storageKey = `message_attachment/${owner.id}/${randomUUID()}.pdf`;
  const [row] = await db.query<{ id: string }[]>(
    `INSERT INTO files (owner_user_id, bucket, storage_key, purpose, original_name, mime_type, size_bytes)
     VALUES ($1, 'private', $2, 'message_attachment', $3, 'application/pdf', 2048) RETURNING id`,
    [owner.id, storageKey, name],
  );
  uploaded.set(storageKey, { sizeBytes: 2048, contentType: 'application/pdf' });
  return row!.id;
}

// ---- Mở hội thoại (D14) -----------------------------------------------------------------------

describe('opening a conversation', () => {
  it('has no conversation before the recipient accepts (D14)', async () => {
    const { tutor, parent, sent } = await pendingRequest();
    expect(sent.conversationId).toBeNull();
    for (const user of [tutor, parent]) {
      const res = await api(user).get('/conversations');
      expect(res.status).toBe(200);
      expect(ConversationList.parse(res.body).total).toBe(0);
    }
  });

  it('opens one conversation for both parties when the request is accepted', async () => {
    emitted.length = 0;
    const { tutor, parent, requestId, conversationId } = await openConversation();

    const opened = emitted.filter((e) => e.event === REALTIME_EVENTS.conversationOpened);
    expect(opened.map((e) => e.userId).sort()).toEqual([tutor.id, parent.id].sort());
    expect(opened[0]!.payload).toEqual({ conversationId, connectionRequestId: requestId });

    const forParent = await api(parent).get(`/connection-requests/${requestId}`);
    expect(ConnectionRequestDetail.parse(forParent.body).conversationId).toBe(conversationId);

    const tutorView = await summary(tutor, conversationId);
    expect(tutorView).toMatchObject({
      kind: 'connection',
      connectionRequestId: requestId,
      requestStatus: 'negotiating',
      canSend: true,
      myRole: 'tutor',
      counterpart: { role: 'client', tutorSlug: null },
      subjectId: ids.math,
      learner: null,
      lastMessage: null,
      unreadCount: 0,
    });
    const parentView = await summary(parent, conversationId);
    expect(parentView).toMatchObject({
      myRole: 'client',
      counterpart: { role: 'tutor' },
      learner: { name: 'Bin' },
    });
    expect(parentView.counterpart.tutorSlug).toMatch(/-[0-9a-f]{10}$/);

    // Gia sư không thấy liên hệ của phụ huynh hay danh tính trẻ trong hội thoại (D16).
    const text = JSON.stringify(tutorView);
    for (const secret of [parent.email, parent.phone, parent.fullName, CHILD.fullName, 'Bin']) {
      expect(text).not.toContain(secret);
    }
  });

  it('is invisible to anyone outside the conversation (404)', async () => {
    const { conversationId, tutor } = await openConversation();
    const outsider = await createUser(['parent'], 'Lê Văn Tư');
    const otherTutor = await createTutor();
    const message = await sendText(tutor, conversationId, 'Chào chị');
    const fileId = await uploadedFile(tutor);
    await sendMessage(tutor, conversationId, { fileIds: [fileId] });

    for (const user of [outsider, otherTutor]) {
      const u = api(user);
      expect((await u.get(`/conversations/${conversationId}`)).status).toBe(404);
      expect((await u.get(`/conversations/${conversationId}/messages`)).status).toBe(404);
      expect((await sendMessage(user, conversationId, { body: 'xin chào' })).status).toBe(404);
      expect(
        (await u.post(`/conversations/${conversationId}/read`, { messageId: message.id })).status,
      ).toBe(404);
      expect(
        (await u.delete(`/conversations/${conversationId}/messages/${message.id}`)).status,
      ).toBe(404);
      expect((await u.get(`/conversations/${conversationId}/attachments/${fileId}`)).status).toBe(
        404,
      );
      expect(ConversationList.parse((await u.get('/conversations')).body).total).toBe(0);
    }
    expect((await api(null).get('/conversations')).status).toBe(401);
  });
});

// ---- Gửi, đọc, xóa ------------------------------------------------------------------------------

describe('sending and reading messages', () => {
  it('delivers messages to both sides with unread counts and read receipts', async () => {
    const { tutor, parent, conversationId } = await openConversation();
    emitted.length = 0;

    const first = await sendText(
      parent,
      conversationId,
      'Chào thầy, thầy dạy được tối thứ 3 không?',
    );
    expect(first).toMatchObject({ kind: 'text', senderRole: 'client', isMine: true });
    const second = await sendText(parent, conversationId, 'Con tôi học chương 2.');

    const pushed = emitted.filter((e) => e.event === REALTIME_EVENTS.messageNew);
    expect(pushed).toHaveLength(4);
    const toTutor = pushed.find((e) => e.userId === tutor.id)!.payload as { message: Message };
    expect(toTutor.message).toMatchObject({ id: first.id, isMine: false, senderRole: 'client' });

    const tutorView = await summary(tutor, conversationId);
    expect(tutorView.unreadCount).toBe(2);
    expect(tutorView.lastMessage).toMatchObject({
      id: second.id,
      isMine: false,
      preview: 'Con tôi học chương 2.',
    });
    expect(UnreadSummary.parse((await api(tutor).get('/conversations/unread')).body)).toEqual({
      conversations: 1,
    });
    // Người gửi đã đọc tin của mình.
    expect((await summary(parent, conversationId)).unreadCount).toBe(0);

    const messages = await page(tutor, conversationId);
    expect(messages.items.map((m) => m.body)).toEqual([
      'Chào thầy, thầy dạy được tối thứ 3 không?',
      'Con tôi học chương 2.',
    ]);
    expect(messages.items.every((m) => !m.isMine && m.senderRole === 'client')).toBe(true);

    emitted.length = 0;
    const read = await api(tutor).post(`/conversations/${conversationId}/read`, {
      messageId: second.id,
    });
    expect(read.status).toBe(204);
    expect((await summary(tutor, conversationId)).unreadCount).toBe(0);
    expect((await summary(parent, conversationId)).counterpartLastReadMessageId).toBe(second.id);
    expect(emitted.filter((e) => e.event === REALTIME_EVENTS.conversationRead)).toHaveLength(2);

    // Không lùi: đánh dấu lại tin cũ không đổi gì, không đẩy sự kiện.
    emitted.length = 0;
    await api(tutor).post(`/conversations/${conversationId}/read`, { messageId: first.id });
    expect((await summary(tutor, conversationId)).myLastReadMessageId).toBe(second.id);
    expect(emitted).toHaveLength(0);

    const reply = await sendText(tutor, conversationId, 'Dạ được ạ.');
    expect(reply.senderRole).toBe('tutor');
    const list = ConversationList.parse((await api(parent).get('/conversations')).body);
    expect(list.items[0]).toMatchObject({ id: conversationId, unreadCount: 1 });
  });

  it('pages messages by key: newest first page, then older (before) and newer (after)', async () => {
    const { tutor, conversationId } = await openConversation();
    const sent: Message[] = [];
    for (let i = 1; i <= 5; i += 1) sent.push(await sendText(tutor, conversationId, `Tin ${i}`));

    const latest = await page(tutor, conversationId, '?limit=2');
    expect(latest.items.map((m) => m.body)).toEqual(['Tin 4', 'Tin 5']);
    expect(latest.hasMore).toBe(true);

    const older = await page(tutor, conversationId, `?limit=2&before=${latest.items[0]!.id}`);
    expect(older.items.map((m) => m.body)).toEqual(['Tin 2', 'Tin 3']);
    const oldest = await page(tutor, conversationId, `?limit=2&before=${older.items[0]!.id}`);
    expect(oldest).toMatchObject({ hasMore: false });
    expect(oldest.items.map((m) => m.body)).toEqual(['Tin 1']);

    const newer = await page(tutor, conversationId, `?limit=3&after=${sent[0]!.id}`);
    expect(newer.items.map((m) => m.body)).toEqual(['Tin 2', 'Tin 3', 'Tin 4']);
    expect(newer.hasMore).toBe(true);

    const both = await api(tutor).get(
      `/conversations/${conversationId}/messages?before=${sent[1]!.id}&after=${sent[0]!.id}`,
    );
    expect(both.status).toBe(422);
  });

  it('validates the message body', async () => {
    const { tutor, conversationId } = await openConversation();
    const empty = await sendMessage(tutor, conversationId, { body: '   ' });
    expect(empty.status).toBe(422);
    expect(fieldCodes(empty)).toContain('body:required');
    const long = await sendMessage(tutor, conversationId, { body: 'a'.repeat(4001) });
    expect(fieldCodes(long)).toContain('body:too_long');
    const tooMany = await sendMessage(tutor, conversationId, {
      fileIds: Array.from({ length: 6 }, () => randomUUID()),
    });
    expect(fieldCodes(tooMany)).toContain('fileIds:too_many');
  });

  it('sends attachments that only the two parties can open', async () => {
    const { tutor, parent, conversationId } = await openConversation();
    const fileId = await uploadedFile(parent, 'de-kiem-tra.pdf');

    const res = await sendMessage(parent, conversationId, {
      body: 'Đề tuần trước',
      fileIds: [fileId],
    });
    expect(res.status).toBe(201);
    expect(Message.parse(res.body)).toMatchObject({
      kind: 'attachment',
      body: 'Đề tuần trước',
      attachments: [
        { fileId, fileName: 'de-kiem-tra.pdf', mimeType: 'application/pdf', sizeBytes: 2048 },
      ],
    });
    const [file] = await db.query<{ status: string }[]>(`SELECT status FROM files WHERE id = $1`, [
      fileId,
    ]);
    expect(file!.status).toBe('ready');

    const url = await api(tutor).get(`/conversations/${conversationId}/attachments/${fileId}`);
    expect(url.status).toBe(200);
    expect(AttachmentUrl.parse(url.body)).toMatchObject({ fileName: 'de-kiem-tra.pdf' });
    expect(url.body.url).toContain('expires=300');

    // Một tệp chỉ thuộc một tin; tệp của người khác hoặc chưa tải lên không gửi được.
    const again = await sendMessage(parent, conversationId, { fileIds: [fileId] });
    expect(again.status).toBe(422);
    expect(fieldCodes(again)).toEqual(['fileIds:file_not_uploaded']);
    const othersFile = await uploadedFile(tutor);
    expect(
      fieldCodes(await sendMessage(parent, conversationId, { fileIds: [othersFile] })),
    ).toEqual(['fileIds:file_not_uploaded']);
    const notUploaded = await uploadedFile(parent);
    uploaded.clear();
    expect(
      fieldCodes(await sendMessage(parent, conversationId, { fileIds: [notUploaded] })),
    ).toEqual(['fileIds:file_not_uploaded']);
    // Tin bị từ chối không để lại tin rỗng.
    expect((await page(parent, conversationId)).items).toHaveLength(1);
  });

  it('lets the sender delete only their own message', async () => {
    const { tutor, parent, conversationId } = await openConversation();
    const message = await sendText(parent, conversationId, 'Gửi nhầm số điện thoại');
    emitted.length = 0;

    const byOther = await api(tutor).delete(
      `/conversations/${conversationId}/messages/${message.id}`,
    );
    expect(byOther.status).toBe(404);
    const own = await api(parent).delete(`/conversations/${conversationId}/messages/${message.id}`);
    expect(own.status).toBe(204);
    expect(emitted.filter((e) => e.event === REALTIME_EVENTS.messageDeleted)).toHaveLength(2);

    const [seen] = (await page(tutor, conversationId)).items;
    expect(seen).toMatchObject({ id: message.id, body: null, attachments: [] });
    expect(seen!.deletedAt).not.toBeNull();
    expect((await summary(tutor, conversationId)).lastMessage).toMatchObject({
      deleted: true,
      preview: null,
    });
    // Tin đã xóa không tính chưa đọc.
    expect((await summary(tutor, conversationId)).unreadCount).toBe(0);
  });
});

// ---- Khi nào không gửi được ---------------------------------------------------------------------

describe('when sending is not allowed', () => {
  it('keeps the conversation read-only after the request is cancelled (D32)', async () => {
    const { tutor, parent, requestId, conversationId } = await openConversation();
    await sendText(tutor, conversationId, 'Chào chị');
    expect((await api(parent).post(`/connection-requests/${requestId}/cancel`)).status).toBe(200);

    const res = await sendMessage(tutor, conversationId, { body: 'Còn đó không?' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conversation_closed');
    expect(await summary(parent, conversationId)).toMatchObject({
      requestStatus: 'cancelled',
      canSend: false,
    });
    expect((await page(parent, conversationId)).items).toHaveLength(1);
  });

  it('keeps chatting after collaboration is confirmed', async () => {
    const { tutor, parent, requestId, conversationId } = await openConversation();
    const terms = await api(tutor).post(`/connection-requests/${requestId}/terms`, {
      gradeLevelId: ids.grade8,
      goal: 'exam_prep',
      teachingMode: 'online',
      provinceId: ids.hanoi,
      sessionPriceVnd: 250_000,
      sessionMinutes: 90,
    });
    expect(terms.status).toBe(201);
    for (const user of [tutor, parent]) {
      const confirmed = await api(user).post(`/connection-requests/${requestId}/confirm`, {
        version: 1,
      });
      expect(confirmed.status).toBe(200);
    }
    expect((await summary(parent, conversationId)).requestStatus).toBe('confirmed');
    await sendText(parent, conversationId, 'Hẹn thầy tối thứ 3.');
  });

  it('blocks a restricted account from sending (B.9.3)', async () => {
    const { parent, conversationId } = await openConversation();
    await db.query(`UPDATE users SET status = 'restricted' WHERE id = $1`, [parent.id]);
    const res = await sendMessage(parent, conversationId, { body: 'Chào thầy' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('account_restricted');
    expect((await summary(parent, conversationId)).canSend).toBe(false);
  });

  it('stops both sides from sending once either blocks the other', async () => {
    const { tutor, parent, conversationId } = await openConversation();
    await db.query(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [
      parent.id,
      tutor.id,
    ]);
    for (const user of [tutor, parent]) {
      const res = await sendMessage(user, conversationId, { body: 'Chào' });
      expect(res.body.error.code).toBe('conversation_closed');
      expect((await summary(user, conversationId)).canSend).toBe(false);
    }
  });
});

// ---- Realtime (Socket.IO) -----------------------------------------------------------------------

describe('realtime', () => {
  let server: Server;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    realtimeServer = createRealtimeServer({
      httpServer: server,
      corsOrigins: testEnv.CORS_ORIGINS,
      tokens,
      loadUser: getAuthUser,
      logger: silentLogger,
    });
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await realtimeServer?.close();
    realtimeServer = null;
    await new Promise((resolve) => server.close(resolve));
  });

  const connect = (options: { token?: string; origin?: string; cookie?: string }) => {
    const socket = connectSocket(url, {
      transports: ['websocket'],
      reconnection: false,
      ...(options.token && { auth: { token: options.token } }),
      extraHeaders: {
        ...(options.origin && { Origin: options.origin }),
        ...(options.cookie && { Cookie: options.cookie }),
      },
    });
    sockets.push(socket);
    return new Promise<Socket>((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  };

  it('rejects connections without a valid token or from another origin', async () => {
    await expect(connect({ origin: TEST_ORIGIN })).rejects.toThrow('unauthenticated');
    await expect(connect({ token: 'not-a-token', origin: TEST_ORIGIN })).rejects.toThrow(
      'unauthenticated',
    );
    const user = await createUser(['parent'], 'Hà Thị Mai');
    await expect(connect({ token: user.token, origin: 'https://evil.example' })).rejects.toThrow();
    await db.query(`UPDATE users SET status = 'locked' WHERE id = $1`, [user.id]);
    await expect(connect({ token: user.token, origin: TEST_ORIGIN })).rejects.toThrow(
      'unauthenticated',
    );
  });

  it('pushes new messages to the other party only', async () => {
    const { tutor, parent, conversationId } = await openConversation();
    const outsider = await createUser(['parent'], 'Lê Văn Tư');
    // Web: cookie `tps_at`; mobile: `auth.token`.
    const tutorSocket = await connect({ cookie: `tps_at=${tutor.token}`, origin: TEST_ORIGIN });
    const outsiderSocket = await connect({ token: outsider.token });
    const outsiderEvents: unknown[] = [];
    outsiderSocket.onAny((...args) => outsiderEvents.push(args));

    const received = new Promise<{ conversationId: string; message: Message }>((resolve) =>
      tutorSocket.once(REALTIME_EVENTS.messageNew, resolve),
    );
    const sent = await sendText(parent, conversationId, 'Thầy ơi, mai học nhé');
    const event = await received;
    expect(event.conversationId).toBe(conversationId);
    expect(event.message).toMatchObject({ id: sent.id, isMine: false, senderRole: 'client' });
    expect(outsiderEvents).toEqual([]);
  });
});

// ---- Migration ------------------------------------------------------------------------------------

describe('CreateMessaging migration', () => {
  it('opens conversations for requests accepted before messaging existed', async () => {
    // Chạy cuối: gỡ migration làm mất dữ liệu nhắn tin của các test trên.
    const { tutor, parent, requestId } = await pendingRequest();
    // Gỡ các migration từ CreateMessaging trở về sau (mới nhất trước).
    while (
      (
        await db.query<{ name: string }[]>(
          `SELECT name FROM typeorm_migrations WHERE name LIKE 'CreateMessaging%'`,
        )
      ).length > 0
    ) {
      await db.undoLastMigration();
    }
    await db.query(
      `UPDATE connection_requests SET status = 'negotiating', accepted_at = now() - interval '1 day'
        WHERE id = $1`,
      [requestId],
    );
    await db.runMigrations();

    const rows = await db.query<{ user_id: string; participant_role: string }[]>(
      `SELECT p.user_id, p.participant_role
         FROM conversations c JOIN conversation_participants p ON p.conversation_id = c.id
        WHERE c.connection_request_id = $1 ORDER BY p.participant_role`,
      [requestId],
    );
    expect(rows).toEqual([
      { user_id: parent.id, participant_role: 'client' },
      { user_id: tutor.id, participant_role: 'tutor' },
    ]);
    const list = ConversationList.parse((await api(tutor).get('/conversations')).body);
    expect(list.items[0]).toMatchObject({ connectionRequestId: requestId, canSend: true });
  });
});
