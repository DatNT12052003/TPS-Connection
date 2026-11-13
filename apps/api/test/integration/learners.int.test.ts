// Hồ sơ phụ huynh, hồ sơ con, lời mời học sinh và phân quyền theo quan hệ (G2 phần 4), qua HTTP (Supertest)
// với PostgreSQL thật (Testcontainers). Người dùng được tạo thẳng trong database và đăng nhập bằng access
// token ký sẵn (luồng đăng ký, OTP đã có test riêng ở auth.int.test.ts), nên không cần Redis.
//
// Điều kiện hoàn thành G2: phụ huynh A KHÔNG đọc được hồ sơ con của phụ huynh B (describe "isolation").
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  AuthSessionResponse,
  Learner,
  LearnerList,
  ParentProfile,
  PendingStudentInvitation,
  type Role,
  StudentInvitationPreview,
} from '@tps/shared';
import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApp } from '../../src/app.js';
import { createDataSource } from '../../src/db/data-source.js';
import type { EmailMessage } from '../../src/lib/email/email-sender.js';
import { createMemoryRateLimiter } from '../../src/lib/rate-limiter.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import type { OtpStore } from '../../src/modules/auth/otp-store.js';
import { createArgon2Hasher } from '../../src/modules/auth/password-hasher.js';
import { createTokenService } from '../../src/modules/auth/tokens.js';
import { createLearnerAccess } from '../../src/modules/learners/learner-access.js';
import { createLearnersService } from '../../src/modules/learners/learners.service.js';
import { createStudentInvitationsService } from '../../src/modules/learners/student-invitations.service.js';
import { createParentsService } from '../../src/modules/parents/parents.service.js';
import type { CatalogService } from '../../src/modules/catalog/catalog.service.js';
import type { TutorsService } from '../../src/modules/tutors/tutors.service.js';
import type { AccountService } from '../../src/modules/users/account.service.js';
import { silentLogger, TEST_JWT_SECRET, TEST_ORIGIN, testEnv } from '../helpers.js';

jest.setTimeout(180_000);

const WEB_URL = 'http://localhost:5173';
const PASSWORD = 'matkhau123';

let postgres: StartedPostgreSqlContainer;
let db: DataSource;
let app: Express;
const tokens = createTokenService({ secret: TEST_JWT_SECRET });
const sentEmails: EmailMessage[] = [];
/** Đồng hồ của service lời mời, để thử lời mời quá hạn. */
let clockOffsetMs = 0;

/** Tỉnh/xã mẫu: Hà Nội (Ba Đình), TP Hồ Chí Minh (Bến Thành). */
const areas = { hanoi: 0, baDinh: 0, hcm: 0, benThanh: 0 };
let gradeId = 0;

beforeAll(async () => {
  postgres = await new PostgreSqlContainer('postgres:18.6-alpine').start();
  db = createDataSource({ DATABASE_URL: postgres.getConnectionUri(), DATABASE_POOL_MAX: 4 });
  await db.initialize();
  await db.runMigrations();

  const insertArea = async (
    code: string,
    level: string,
    unitType: string,
    parentId: number | null,
    name: string,
  ) => {
    const [row] = await db.query<{ id: number }[]>(
      `INSERT INTO administrative_areas (code, level, unit_type, parent_id, name, full_name, name_ascii)
       VALUES ($1, $2, $3, $4, $5, $5, $5) RETURNING id`,
      [code, level, unitType, parentId, name],
    );
    return row!.id;
  };
  areas.hanoi = await insertArea('01', 'province', 'municipality', null, 'Ha Noi');
  areas.baDinh = await insertArea('00004', 'commune', 'ward', areas.hanoi, 'Ba Dinh');
  areas.hcm = await insertArea('79', 'province', 'municipality', null, 'Ho Chi Minh');
  areas.benThanh = await insertArea('26734', 'commune', 'ward', areas.hcm, 'Ben Thanh');
  const [grade] = await db.query<{ id: number }[]>(
    `SELECT id FROM grade_levels WHERE stage = 'lower_secondary' ORDER BY sort_order LIMIT 1`,
  );
  gradeId = grade!.id;

  const rateLimiter = createMemoryRateLimiter();
  const hasher = createArgon2Hasher({ memoryCost: 1024, timeCost: 1 });
  const sendEmail = async (message: EmailMessage) => {
    sentEmails.push(message);
  };
  const auth = createAuthService({
    dataSource: db,
    hasher,
    tokens,
    otp: {} as OtpStore, // không dùng: đăng nhập sau khi nhận lời mời không cần OTP
    rateLimiter,
    sendEmail,
    logger: silentLogger,
  });
  app = createApp({
    env: testEnv,
    logger: silentLogger,
    health: { check: async () => ({ status: 'ok', checks: {} }) },
    auth,
    tokens,
    rateLimiter,
    parents: createParentsService({ dataSource: db, logger: silentLogger }),
    learners: createLearnersService({ dataSource: db, logger: silentLogger }),
    studentInvitations: createStudentInvitationsService({
      dataSource: db,
      hasher,
      rateLimiter,
      sendEmail,
      webUrl: WEB_URL,
      logger: silentLogger,
      now: () => new Date(Date.now() + clockOffsetMs),
    }),
    // Hồ sơ gia sư, tài khoản, danh mục: test riêng ở tutors.int.test.ts.
    tutors: {} as TutorsService,
    account: {} as AccountService,
    catalog: {} as CatalogService,
  });
});

afterAll(async () => {
  await db?.destroy();
  await postgres?.stop();
});

beforeEach(() => {
  sentEmails.length = 0;
  clockOffsetMs = 0;
});

// ---- Tiện ích ---------------------------------------------------------------------------------

let counter = 0;
const uniqueEmail = (prefix = 'user') => `${prefix}${Date.now()}${(counter += 1)}@example.com`;

interface TestUser {
  id: string;
  email: string;
  /** Header Authorization. */
  auth: string;
}

/** Tài khoản đã xác thực email, có vai trò cho sẵn, kèm access token. */
async function createUser(role: Role, name = 'Nguyễn Thị Mai'): Promise<TestUser> {
  const email = uniqueEmail(role);
  const [row] = await db.query<{ id: string }[]>(
    `INSERT INTO users (email, email_verified_at, display_name, full_name)
     VALUES ($1, now(), $2, $2) RETURNING id`,
    [email, name],
  );
  const id = row!.id;
  await db.query(`INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2)`, [id, role]);
  const { token } = tokens.signAccessToken({ userId: id, sessionFamilyId: randomUUID() });
  return { id, email, auth: `Bearer ${token}` };
}

const api = (user: TestUser | null) => {
  const withAuth = (req: request.Test) => {
    req.set('Origin', TEST_ORIGIN);
    return user ? req.set('Authorization', user.auth) : req;
  };
  return {
    get: (path: string) => withAuth(request(app).get(`/api/v1${path}`)),
    post: (path: string, body?: object) => withAuth(request(app).post(`/api/v1${path}`)).send(body),
    put: (path: string, body?: object) => withAuth(request(app).put(`/api/v1${path}`)).send(body),
    patch: (path: string, body?: object) =>
      withAuth(request(app).patch(`/api/v1${path}`)).send(body),
    delete: (path: string) => withAuth(request(app).delete(`/api/v1${path}`)),
  };
};

const childInput = (overrides: object = {}) => ({
  fullName: 'Trần Minh Khang',
  nickname: 'Bin',
  dateOfBirth: '2013-05-20',
  gradeLevelId: gradeId,
  schoolName: 'THCS Nguyễn Du',
  provinceId: areas.hanoi,
  communeId: areas.baDinh,
  addressLine: '12 Phố Huế',
  notes: 'Con hơi rụt rè, cần kiên nhẫn.',
  relationship: 'mother',
  acceptChildDataProcessing: true,
  ...overrides,
});

async function createChild(parent: TestUser, overrides: object = {}): Promise<Learner> {
  const res = await api(parent).post('/learners', childInput(overrides));
  expect(res.status).toBe(201);
  return Learner.parse(res.body);
}

/** Token trong liên kết của email mời gần nhất gửi tới `to`. */
function invitationToken(to: string): string {
  const email = sentEmails.filter((m) => m.to === to).at(-1);
  const token = email?.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
  if (!token) throw new Error(`No invitation emailed to ${to}`);
  return token;
}

async function invite(parent: TestUser, learnerId: string, email = uniqueEmail('kid')) {
  const res = await api(parent).post(`/learners/${learnerId}/invitation`, { email });
  expect(res.status).toBe(201);
  return {
    email,
    token: invitationToken(email),
    invitation: PendingStudentInvitation.parse(res.body),
  };
}

const accept = (token: string, body: object = {}) =>
  api(null).post('/student-invitations/accept', {
    token,
    password: PASSWORD,
    acceptTerms: true,
    ...body,
  });

// ---- Hồ sơ phụ huynh --------------------------------------------------------------------------

describe('parent profile', () => {
  it('starts empty, then saves province, commune and address', async () => {
    const parent = await createUser('parent');
    const empty = await api(parent).get('/me/parent-profile');
    expect(empty.status).toBe(200);
    expect(ParentProfile.parse(empty.body)).toEqual({
      provinceId: null,
      communeId: null,
      addressLine: null,
      updatedAt: null,
    });

    const saved = await api(parent).put('/me/parent-profile', {
      provinceId: areas.hanoi,
      communeId: areas.baDinh,
      addressLine: ' 12 Phố Huế ',
    });
    expect(saved.status).toBe(200);
    expect(ParentProfile.parse(saved.body)).toMatchObject({
      provinceId: areas.hanoi,
      communeId: areas.baDinh,
      addressLine: '12 Phố Huế',
    });

    // PUT thay toàn bộ: trường không gửi thành trống.
    const replaced = await api(parent).put('/me/parent-profile', { provinceId: areas.hcm });
    expect(replaced.body).toMatchObject({
      provinceId: areas.hcm,
      communeId: null,
      addressLine: null,
    });
  });

  it('rejects a commune that is not in the chosen province', async () => {
    const parent = await createUser('parent');
    const res = await api(parent).put('/me/parent-profile', {
      provinceId: areas.hanoi,
      communeId: areas.benThanh,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ path: 'communeId', code: 'commune_not_in_province' }),
    ]);
  });

  it('is only for parents', async () => {
    const tutor = await createUser('tutor');
    expect((await api(tutor).get('/me/parent-profile')).status).toBe(403);
    expect((await api(null).get('/me/parent-profile')).status).toBe(401);
  });
});

// ---- Hồ sơ con và đồng ý xử lý dữ liệu ---------------------------------------------------------

describe('learner profiles', () => {
  it('creates a child profile, makes the parent its only guardian and records consent', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);
    expect(child).toMatchObject({
      viewer: 'guardian',
      fullName: 'Trần Minh Khang',
      nickname: 'Bin',
      dateOfBirth: '2013-05-20',
      gradeLevelId: gradeId,
      relationship: 'mother',
      notes: 'Con hơi rụt rè, cần kiên nhẫn.',
      hasStudentAccount: false,
      pendingInvitation: null,
    });

    const guardians = await db.query<{ guardian_user_id: string; ended_at: Date | null }[]>(
      `SELECT guardian_user_id, ended_at FROM learner_guardians WHERE learner_id = $1`,
      [child.id],
    );
    expect(guardians).toEqual([{ guardian_user_id: parent.id, ended_at: null }]);

    const consents = await db.query<{ user_id: string; version: string; withdrawn: boolean }[]>(
      `SELECT user_id, version, withdrawn_at IS NOT NULL AS withdrawn FROM user_consents
        WHERE learner_id = $1 AND consent_type = 'child_data_processing'`,
      [child.id],
    );
    expect(consents).toEqual([{ user_id: parent.id, version: '2026-11-13', withdrawn: false }]);
  });

  it('requires consent and valid catalog values', async () => {
    const parent = await createUser('parent');
    const noConsent = await api(parent).post(
      '/learners',
      childInput({ acceptChildDataProcessing: false }),
    );
    expect(noConsent.status).toBe(422);
    expect(noConsent.body.error.details).toEqual([
      expect.objectContaining({ path: 'acceptChildDataProcessing' }),
    ]);

    const badGrade = await api(parent).post('/learners', childInput({ gradeLevelId: 99_999 }));
    expect(badGrade.status).toBe(422);
    expect(badGrade.body.error.details).toEqual([
      expect.objectContaining({ path: 'gradeLevelId', code: 'unknown_option' }),
    ]);
    const count = await db.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM learners WHERE created_by = $1`,
      [parent.id],
    );
    expect(count[0]!.n).toBe(0);
  });

  it('lists only the parent own children, oldest first', async () => {
    const parent = await createUser('parent');
    const first = await createChild(parent, { fullName: 'Con thứ nhất' });
    const second = await createChild(parent, { fullName: 'Con thứ hai' });
    const res = await api(parent).get('/learners');
    expect(res.status).toBe(200);
    expect(LearnerList.parse(res.body).items.map((l) => l.id)).toEqual([first.id, second.id]);
  });

  it('updates fields, clears a field with null and drops the commune when the province changes', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);
    const res = await api(parent).patch(`/learners/${child.id}`, {
      schoolName: null,
      provinceId: areas.hcm,
      relationship: 'father',
    });
    expect(res.status).toBe(200);
    expect(Learner.parse(res.body)).toMatchObject({
      schoolName: null,
      provinceId: areas.hcm,
      communeId: null,
      relationship: 'father',
      fullName: 'Trần Minh Khang',
    });
  });

  it('soft-deletes a profile, withdraws consent and cancels the open invitation', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);
    const { token } = await invite(parent, child.id);

    expect((await api(parent).delete(`/learners/${child.id}`)).status).toBe(204);
    expect((await api(parent).get(`/learners/${child.id}`)).status).toBe(404);
    const [row] = await db.query<{ deleted: boolean; withdrawn: boolean }[]>(
      `SELECT l.deleted_at IS NOT NULL AS deleted,
              (SELECT bool_and(withdrawn_at IS NOT NULL) FROM user_consents WHERE learner_id = l.id) AS withdrawn
         FROM learners l WHERE l.id = $1`,
      [child.id],
    );
    expect(row).toEqual({ deleted: true, withdrawn: true });
    expect((await accept(token)).body.error.code).toBe('invitation_invalid');
  });

  it('allows only one active guardian per learner (C9, database constraint)', async () => {
    const parent = await createUser('parent');
    const other = await createUser('parent');
    const child = await createChild(parent);
    await expect(
      db.query(
        `INSERT INTO learner_guardians (learner_id, guardian_user_id, relationship) VALUES ($1, $2, 'father')`,
        [child.id, other.id],
      ),
    ).rejects.toThrow(/learner_guardians_one_active_uq/);
  });
});

// ---- Phân quyền theo quan hệ: phụ huynh A không xem được con của phụ huynh B ---------------------

describe('isolation between parents', () => {
  let parentA: TestUser;
  let parentB: TestUser;
  let childOfB: Learner;

  beforeAll(async () => {
    parentA = await createUser('parent', 'Phụ huynh A');
    parentB = await createUser('parent', 'Phụ huynh B');
    childOfB = await createChild(parentB, { fullName: 'Con của B' });
    await createChild(parentA, { fullName: 'Con của A' });
  });

  it('parent A cannot read the child profile of parent B (404, existence not revealed)', async () => {
    const res = await api(parentA).get(`/learners/${childOfB.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
    expect(JSON.stringify(res.body)).not.toContain('Con của B');

    // Cùng phản hồi với một id không tồn tại.
    const missing = await api(parentA).get(`/learners/${randomUUID()}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe(res.body.error.code);
  });

  it('parent A does not see the child of parent B in the list', async () => {
    const res = await api(parentA).get('/learners');
    const names = LearnerList.parse(res.body).items.map((l) => l.fullName);
    expect(names).toEqual(['Con của A']);
  });

  it('parent A cannot change, delete or invite for the child of parent B', async () => {
    const path = `/learners/${childOfB.id}`;
    expect((await api(parentA).patch(path, { fullName: 'Đổi tên' })).status).toBe(404);
    expect((await api(parentA).delete(path)).status).toBe(404);
    expect(
      (await api(parentA).post(`${path}/invitation`, { email: uniqueEmail('kid') })).status,
    ).toBe(404);
    expect((await api(parentA).delete(`${path}/invitation`)).status).toBe(404);
    expect(sentEmails).toHaveLength(0);

    // Hồ sơ của B không đổi.
    const own = await api(parentB).get(path);
    expect(own.status).toBe(200);
    expect(Learner.parse(own.body)).toMatchObject({
      fullName: 'Con của B',
      relationship: 'mother',
    });
  });

  it('a tutor or a signed-out user cannot read child profiles', async () => {
    const tutor = await createUser('tutor');
    expect((await api(tutor).get(`/learners/${childOfB.id}`)).status).toBe(403);
    expect((await api(tutor).get('/learners')).status).toBe(403);
    expect((await api(null).get(`/learners/${childOfB.id}`)).status).toBe(401);
  });

  it('isParentOf and isStudentSelf answer by relationship', async () => {
    const access = createLearnerAccess(db.manager);
    expect(await access.isParentOf(parentB.id, childOfB.id)).toBe(true);
    expect(await access.isParentOf(parentA.id, childOfB.id)).toBe(false);
    expect(await access.isStudentSelf(parentB.id, childOfB.id)).toBe(false);
    expect(await access.viewerOf(parentA.id, childOfB.id)).toBeNull();
  });
});

// ---- Lời mời học sinh (D4, D50) ---------------------------------------------------------------

describe('student invitations', () => {
  it('sends a one-time link that creates a view-only student account linked to the profile', async () => {
    const parent = await createUser('parent', 'Phạm Thu Hà');
    const child = await createChild(parent);
    const { email, token, invitation } = await invite(parent, child.id);

    expect(invitation.email).toBe(email);
    const expiresInDays =
      (new Date(invitation.expiresAt).getTime() - new Date(invitation.createdAt).getTime()) /
      86_400_000;
    expect(Math.round(expiresInDays)).toBe(7);
    const mail = sentEmails.at(-1)!;
    expect(mail.subject).toBe('Phạm Thu Hà mời bạn tham gia TPS-Connection');
    expect(mail.text).toContain(`${WEB_URL}/student-invitation#token=${token}`);
    // Token không nằm trong database, chỉ có hash.
    const [stored] = await db.query<{ token_hash: string }[]>(
      `SELECT token_hash FROM student_invitations WHERE id = $1`,
      [invitation.id],
    );
    expect(stored!.token_hash).not.toContain(token);

    // Phụ huynh thấy lời mời đang chờ.
    const pending = Learner.parse((await api(parent).get(`/learners/${child.id}`)).body);
    expect(pending.pendingInvitation?.id).toBe(invitation.id);

    const preview = await api(null).post('/student-invitations/lookup', { token });
    expect(preview.status).toBe(200);
    expect(StudentInvitationPreview.parse(preview.body)).toMatchObject({
      email,
      inviterName: 'Phạm Thu Hà',
      learnerName: 'Bin',
    });

    const accepted = await accept(token, { locale: 'en' });
    expect(accepted.status).toBe(201);
    const session = AuthSessionResponse.parse(accepted.body);
    expect(session.user).toMatchObject({
      email,
      displayName: 'Bin',
      fullName: 'Trần Minh Khang',
      roles: ['student'],
      emailVerified: true,
      locale: 'en',
    });
    const cookies = (accepted.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookies).toContain('tps_at=');
    expect(cookies).toContain('tps_rt=');

    const [linked] = await db.query<{ account_user_id: string; granted_by: string }[]>(
      `SELECT l.account_user_id, r.granted_by FROM learners l
         JOIN user_roles r ON r.user_id = l.account_user_id AND r.role_code = 'student'
        WHERE l.id = $1`,
      [child.id],
    );
    expect(linked).toEqual({ account_user_id: session.user.id, granted_by: parent.id });

    // Dùng một lần.
    const reused = await accept(token);
    expect(reused.status).toBe(404);
    expect(reused.body.error.code).toBe('invitation_invalid');

    // Đã có tài khoản: không mời lại được.
    const again = await api(parent).post(`/learners/${child.id}/invitation`, {
      email: uniqueEmail('kid'),
    });
    expect(again.status).toBe(409);
  });

  it('the student sees only their own profile, without the parent notes, and cannot edit it', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);
    const sibling = await createChild(parent, { fullName: 'Anh trai' });
    const { token } = await invite(parent, child.id);
    const accepted = await accept(token);
    const studentId = AuthSessionResponse.parse(accepted.body).user.id;
    const student: TestUser = {
      id: studentId,
      email: '',
      auth: `Bearer ${tokens.signAccessToken({ userId: studentId, sessionFamilyId: randomUUID() }).token}`,
    };

    const list = LearnerList.parse((await api(student).get('/learners')).body);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id: child.id,
      viewer: 'student',
      fullName: 'Trần Minh Khang',
      notes: null,
      relationship: null,
      pendingInvitation: null,
      hasStudentAccount: true,
    });
    expect((await api(student).get(`/learners/${child.id}`)).status).toBe(200);
    // Hồ sơ anh/chị em cùng phụ huynh: không được xem.
    expect((await api(student).get(`/learners/${sibling.id}`)).status).toBe(404);
    // Chỉ xem (D4).
    expect((await api(student).patch(`/learners/${child.id}`, { nickname: 'X' })).status).toBe(403);

    const access = createLearnerAccess(db.manager);
    expect(await access.isStudentSelf(studentId, child.id)).toBe(true);
    expect(await access.isStudentSelf(studentId, sibling.id)).toBe(false);
    expect(await access.isParentOf(studentId, child.id)).toBe(false);
  });

  it('a new invitation replaces the previous link, and the parent can cancel it', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);
    const first = await invite(parent, child.id);
    const second = await invite(parent, child.id);

    expect((await accept(first.token)).body.error.code).toBe('invitation_invalid');
    expect((await api(parent).delete(`/learners/${child.id}/invitation`)).status).toBe(204);
    expect((await accept(second.token)).body.error.code).toBe('invitation_invalid');
    expect((await api(parent).delete(`/learners/${child.id}/invitation`)).status).toBe(404);
  });

  it('expires after 7 days', async () => {
    const parent = await createUser('parent');
    const child = await createChild(parent);
    const { token } = await invite(parent, child.id);

    clockOffsetMs = 7 * 24 * 60 * 60 * 1000 + 1000;
    const lookup = await api(null).post('/student-invitations/lookup', { token });
    expect(lookup.status).toBe(410);
    expect(lookup.body.error.code).toBe('invitation_expired');
    expect((await accept(token)).status).toBe(410);
  });

  it('refuses an email that already has a verified account', async () => {
    const parent = await createUser('parent');
    const existing = await createUser('tutor');
    const child = await createChild(parent);
    const { token } = await invite(parent, child.id, existing.email);

    const res = await accept(token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
    // Không gì thay đổi: lời mời vẫn dùng được, hồ sơ chưa gắn tài khoản.
    const [row] = await db.query<{ account_user_id: string | null }[]>(
      `SELECT account_user_id FROM learners WHERE id = $1`,
      [child.id],
    );
    expect(row!.account_user_id).toBeNull();
  });

  it('rejects an unknown or malformed token', async () => {
    const unknown = await accept('a'.repeat(43));
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('invitation_invalid');
    expect((await accept('not-a-token')).status).toBe(422);
  });
});
