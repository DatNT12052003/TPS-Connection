// Luồng xác thực đầy đủ qua HTTP (Supertest) với PostgreSQL và Redis thật (Testcontainers).
// Email không gửi thật: bắt lại để đọc mã OTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { ActiveSession, AuthSessionResponse, AuthUser, CodeSentResponse } from '@tps/shared';
import type { Express } from 'express';
import type { Redis } from 'ioredis';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApp } from '../../src/app.js';
import { createDataSource } from '../../src/db/data-source.js';
import type { EmailMessage } from '../../src/lib/email/email-sender.js';
import { createRedisRateLimiter } from '../../src/lib/rate-limiter.js';
import { createRedis } from '../../src/lib/redis.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createRedisOtpStore } from '../../src/modules/auth/otp-store.js';
import { createArgon2Hasher } from '../../src/modules/auth/password-hasher.js';
import { createTokenService } from '../../src/modules/auth/tokens.js';
import type { LearnersService } from '../../src/modules/learners/learners.service.js';
import type { StudentInvitationsService } from '../../src/modules/learners/student-invitations.service.js';
import type { ParentsService } from '../../src/modules/parents/parents.service.js';
import { grantStaffRole, revokeStaffRole } from '../../src/modules/users/staff-roles.js';
import type { CatalogService } from '../../src/modules/catalog/catalog.service.js';
import type { TutorsService } from '../../src/modules/tutors/tutors.service.js';
import type { AccountService } from '../../src/modules/users/account.service.js';
import { silentLogger, TEST_JWT_SECRET, TEST_ORIGIN, testEnv } from '../helpers.js';
import type { VerificationService } from '../../src/modules/verification/verification.service.js';

jest.setTimeout(180_000);

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let db: DataSource;
let redis: Redis;
let app: Express;
const sentEmails: EmailMessage[] = [];
/** Đồng hồ của service, để thử token cũ dùng lại sau thời gian ân hạn. */
let clockOffsetMs = 0;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:18.6-alpine').start(),
    new RedisContainer('redis:8.10.3-alpine').start(),
  ]);
  db = createDataSource({ DATABASE_URL: postgres.getConnectionUri(), DATABASE_POOL_MAX: 4 });
  await db.initialize();
  await db.runMigrations();
  redis = createRedis(redisContainer.getConnectionUrl(), silentLogger);
  // Client tắt hàng đợi offline: chờ kết nối xong rồi mới gửi lệnh.
  if (redis.status !== 'ready') await new Promise((resolve) => redis.once('ready', resolve));

  const rateLimiter = createRedisRateLimiter(redis);
  const tokens = createTokenService({ secret: TEST_JWT_SECRET });
  const auth = createAuthService({
    dataSource: db,
    // argon2 nhẹ hơn để test nhanh; tham số thật kiểm tra ở unit test của hasher.
    hasher: createArgon2Hasher({ memoryCost: 1024, timeCost: 1 }),
    tokens,
    otp: createRedisOtpStore({ redis, secret: 'test-otp-secret-at-least-32-characters' }),
    rateLimiter,
    sendEmail: async (message) => {
      sentEmails.push(message);
    },
    logger: silentLogger,
    now: () => new Date(Date.now() + clockOffsetMs),
  });
  app = createApp({
    env: testEnv,
    logger: silentLogger,
    health: { check: async () => ({ status: 'ok', checks: {} }) },
    auth,
    tokens,
    rateLimiter,
    // Hồ sơ phụ huynh và con: test riêng ở learners.int.test.ts.
    parents: {} as ParentsService,
    learners: {} as LearnersService,
    studentInvitations: {} as StudentInvitationsService,
    tutors: {} as TutorsService,
    verification: {} as VerificationService,
    account: {} as AccountService,
    catalog: {} as CatalogService,
  });
});

afterAll(async () => {
  await Promise.allSettled([db?.destroy(), redis?.quit()]);
  await Promise.allSettled([postgres?.stop(), redisContainer?.stop()]);
});

// Mỗi test độc lập: xóa mã OTP, bộ đếm rate limit; email riêng cho từng test.
beforeEach(async () => {
  await redis.flushdb();
  sentEmails.length = 0;
  clockOffsetMs = 0;
});

let counter = 0;
const uniqueEmail = () => `user${Date.now()}${(counter += 1)}@example.com`;
const PASSWORD = 'matkhau123';

const post = (path: string, body?: object) =>
  request(app).post(`/api/v1/auth${path}`).set('Origin', TEST_ORIGIN).send(body);

/** Mã OTP trong email cuối cùng gửi tới `to`. */
function lastCode(to: string): string {
  const email = sentEmails.filter((m) => m.to === to).at(-1);
  const code = email?.text.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error(`No code emailed to ${to}`);
  return code;
}

function cookiesOf(res: request.Response): Record<string, string> {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  return Object.fromEntries(
    (header ?? []).map((line) => {
      const [pair = ''] = line.split(';');
      const index = pair.indexOf('=');
      return [pair.slice(0, index), line];
    }),
  );
}
const cookieValue = (line: string | undefined) =>
  line?.split(';')[0]?.split('=').slice(1).join('=');

async function register(email = uniqueEmail(), role: 'parent' | 'tutor' = 'parent') {
  const res = await post('/register', {
    role,
    fullName: 'Nguyễn Thị Mai',
    email,
    password: PASSWORD,
    acceptTerms: true,
  });
  expect(res.status).toBe(201);
  return email;
}

/** Đăng ký, xác thực email; trả email và cookie header để gọi tiếp. */
async function signedInUser(role: 'parent' | 'tutor' = 'parent') {
  const email = await register(uniqueEmail(), role);
  const res = await post('/email-verification/confirm', { email, code: lastCode(email) });
  expect(res.status).toBe(200);
  const cookies = cookiesOf(res);
  return {
    email,
    access: cookieValue(cookies.tps_at)!,
    refresh: cookieValue(cookies.tps_rt)!,
    user: AuthUser.parse(res.body.user),
  };
}

describe('register', () => {
  it('creates an unverified account with the chosen role and consents, and emails a code', async () => {
    const email = uniqueEmail();
    const res = await post('/register', {
      role: 'tutor',
      fullName: 'Trần Văn Bình',
      email: email.toUpperCase(),
      phone: '0912 345 678',
      password: PASSWORD,
      locale: 'en',
      acceptTerms: true,
    });
    expect(res.status).toBe(201);
    expect(CodeSentResponse.parse(res.body)).toEqual({
      resendAfterSeconds: 45,
      expiresInSeconds: 600,
    });
    expect(res.headers['set-cookie']).toBeUndefined(); // chưa đăng nhập

    const [row] = await db.query<
      {
        email: string;
        phone: string;
        locale: string;
        verified: boolean;
        roles: string[];
        consents: number;
      }[]
    >(
      `SELECT u.email, u.phone, u.locale, u.email_verified_at IS NOT NULL AS verified,
              array(SELECT role_code FROM user_roles WHERE user_id = u.id AND revoked_at IS NULL) AS roles,
              (SELECT count(*) FROM user_consents WHERE user_id = u.id)::int AS consents
         FROM users u WHERE u.email = $1`,
      [email],
    );
    expect(row).toEqual({
      email,
      phone: '0912345678',
      locale: 'en',
      verified: false,
      roles: ['tutor'],
      consents: 2,
    });
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.subject).toBe('Your TPS-Connection email verification code');
    expect(lastCode(email)).toMatch(/^\d{6}$/);
  });

  it('rejects invalid input with field errors', async () => {
    const res = await post('/register', {
      role: 'admin',
      fullName: '',
      email: 'not-an-email',
      password: 'short',
      acceptTerms: false,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation_failed');
    const details = res.body.error.details as { path: string; code: string }[];
    // `code` là khóa validation.* trong i18n; web hiển thị t('validation.<code>'), lỗi đầu tiên của mỗi ô
    // (một ô có thể sai nhiều quy tắc: "short" vừa ngắn vừa thiếu chữ số).
    const firstByPath = new Map<string, string>();
    for (const d of details) if (!firstByPath.has(d.path)) firstByPath.set(d.path, d.code);
    expect(Object.fromEntries(firstByPath)).toEqual({
      role: 'invalid',
      fullName: 'required',
      email: 'invalid_email',
      password: 'password_too_short',
      acceptTerms: 'must_accept_terms',
    });
  });

  it('lets an unverified sign-up be redone (e.g. another role), without resending within 45 s', async () => {
    const email = await register(uniqueEmail(), 'parent');
    await register(email, 'tutor');
    const [row] = await db.query<{ roles: string[] }[]>(
      `SELECT array(SELECT role_code FROM user_roles r WHERE r.user_id = u.id AND revoked_at IS NULL) AS roles
         FROM users u WHERE email = $1`,
      [email],
    );
    expect(row?.roles).toEqual(['tutor']);
    expect(sentEmails.filter((m) => m.to === email)).toHaveLength(1);
  });

  it('refuses an email that already belongs to a verified account', async () => {
    const { email } = await signedInUser();
    const res = await post('/register', {
      role: 'parent',
      fullName: 'Ai đó',
      email,
      password: 'matkhaukhac9',
      acceptTerms: true,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
  });
});

describe('email verification', () => {
  it('signs the user in with httpOnly cookies when the code is right', async () => {
    const email = await register();
    const wrong = lastCode(email) === '000000' ? '111111' : '000000';
    const bad = await post('/email-verification/confirm', { email, code: wrong });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: 'invalid_code', meta: { attemptsLeft: 4 } });

    const res = await post('/email-verification/confirm', { email, code: lastCode(email) });
    expect(res.status).toBe(200);
    const body = AuthSessionResponse.parse(res.body);
    expect(body.user).toMatchObject({ email, emailVerified: true, roles: ['parent'] });
    const cookies = cookiesOf(res);
    // Body chỉ có người dùng và hạn access token: không token, không hash mật khẩu.
    expect(Object.keys(res.body).sort()).toEqual(['accessTokenExpiresAt', 'user']);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/\$argon2|passwordHash/);
    expect(raw).not.toContain(cookieValue(cookies.tps_at));
    expect(raw).not.toContain(cookieValue(cookies.tps_rt));

    for (const name of ['tps_at', 'tps_rt']) {
      expect(cookies[name]).toMatch(/HttpOnly/);
      expect(cookies[name]).toMatch(/SameSite=Lax/);
      expect(cookies[name]).toMatch(/Path=\//);
    }
    // Không "ghi nhớ đăng nhập": refresh cookie là cookie phiên.
    expect(cookies.tps_rt).not.toMatch(/Expires=/);

    // Mã chỉ dùng một lần.
    const again = await post('/email-verification/confirm', { email, code: lastCode(email) });
    expect(again.body.error.code).toBe('code_expired');
  });

  it('cancels the code after 5 wrong attempts', async () => {
    const email = await register();
    const right = lastCode(email);
    const wrong = right === '000000' ? '111111' : '000000';
    const codes: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await post('/email-verification/confirm', { email, code: wrong });
      codes.push(res.body.error.code as string);
    }
    expect(codes).toEqual([
      'invalid_code',
      'invalid_code',
      'invalid_code',
      'invalid_code',
      'code_attempts_exceeded',
    ]);
    const res = await post('/email-verification/confirm', { email, code: right });
    expect(res.body.error.code).toBe('code_expired');
  });

  it('answers the same for unknown emails and enforces the 45 s resend cooldown', async () => {
    const unknown = await post('/email-verification/resend', { email: uniqueEmail() });
    expect(unknown.status).toBe(202);
    expect(sentEmails).toHaveLength(0);

    const email = await register(); // gửi mã lần 1
    const tooSoon = await post('/email-verification/resend', { email });
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error.code).toBe('rate_limited');
    expect(Number(tooSoon.headers['retry-after'])).toBeGreaterThan(0);

    const noAccount = await post('/email-verification/confirm', {
      email: uniqueEmail(),
      code: '123456',
    });
    expect(noAccount.body.error.code).toBe('code_expired');
  });
});

describe('login', () => {
  it('requires a verified email, but only says so after the right password', async () => {
    const email = await register();
    const wrong = await post('/login', { email, password: 'saimatkhau1' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('invalid_credentials');

    const right = await post('/login', { email, password: PASSWORD });
    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe('email_not_verified');
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const res = await post('/login', { email: uniqueEmail(), password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');
  });

  it('keeps a persistent refresh cookie only with "remember me"', async () => {
    const { email } = await signedInUser();
    const res = await post('/login', { email, password: PASSWORD, rememberMe: true });
    expect(res.status).toBe(200);
    expect(cookiesOf(res).tps_rt).toMatch(/Expires=/);
  });

  it('blocks an email after 5 wrong passwords, even with the right one', async () => {
    const { email } = await signedInUser();
    for (let i = 0; i < 5; i += 1) {
      expect((await post('/login', { email, password: 'saimatkhau1' })).status).toBe(401);
    }
    const res = await post('/login', { email, password: PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body.error.meta.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('rejects a locked account, and only after the right password', async () => {
    const { email } = await signedInUser();
    await db.query(`UPDATE users SET status = 'locked' WHERE email = $1`, [email]);
    expect((await post('/login', { email, password: 'saimatkhau1' })).body.error.code).toBe(
      'invalid_credentials',
    );
    expect((await post('/login', { email, password: PASSWORD })).body.error.code).toBe(
      'account_locked',
    );
  });

  it('rejects requests from another origin (CSRF)', async () => {
    const { email } = await signedInUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe('GET /me', () => {
  it('returns the signed-in user from the cookie or a Bearer token', async () => {
    const { access, user } = await signedInUser();
    const viaCookie = await request(app).get('/api/v1/auth/me').set('Cookie', `tps_at=${access}`);
    expect(viaCookie.status).toBe(200);
    expect(AuthUser.parse(viaCookie.body)).toEqual(user);

    const viaHeader = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${access}`);
    expect(viaHeader.status).toBe(200);
  });

  it('rejects missing, forged and locked-account tokens', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/v1/auth/me').set('Cookie', 'tps_at=not.a.jwt')).status,
    ).toBe(401);

    const { access, email } = await signedInUser();
    await db.query(`UPDATE users SET status = 'locked' WHERE email = $1`, [email]);
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', `tps_at=${access}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('account_locked');
  });
});

describe('refresh and logout', () => {
  const refresh = (token: string) =>
    request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', `tps_rt=${token}`);

  it('rotates the refresh token', async () => {
    const { refresh: first } = await signedInUser();
    const res = await refresh(first);
    expect(res.status).toBe(200);
    const second = cookieValue(cookiesOf(res).tps_rt)!;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect((await refresh(second)).status).toBe(200);
  });

  it('only refuses a just-rotated token (two tabs), but revokes the session if reused later', async () => {
    const { refresh: first } = await signedInUser();
    const second = cookieValue(cookiesOf(await refresh(first)).tps_rt)!;

    const raced = await refresh(first);
    expect(raced.status).toBe(401);
    expect(raced.headers['set-cookie']?.toString()).toMatch(/tps_rt=;/); // xóa cookie
    const third = cookieValue(cookiesOf(await refresh(second)).tps_rt)!;

    clockOffsetMs = 60_000; // sau thời gian ân hạn 30 giây
    expect((await refresh(first)).status).toBe(401);
    // Cả chuỗi bị thu hồi: token mới nhất cũng hết dùng được.
    expect((await refresh(third)).status).toBe(401);
    const [revoked] = await db.query<{ reasons: string[] }[]>(
      `SELECT array_agg(DISTINCT revoke_reason) AS reasons FROM auth_sessions
         WHERE family_id = (SELECT family_id FROM auth_sessions ORDER BY created_at DESC LIMIT 1)`,
    );
    expect(revoked?.reasons).toEqual(['reuse_detected']);
  });

  it('logs out: clears cookies and the refresh token stops working', async () => {
    const { refresh: token } = await signedInUser();
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', `tps_rt=${token}`);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']?.toString()).toMatch(/tps_at=;.*Expires=Thu, 01 Jan 1970/);
    expect((await refresh(token)).status).toBe(401);
  });

  it('rejects an unknown refresh token', async () => {
    expect((await refresh('made-up-token')).status).toBe(401);
    expect(
      (await request(app).post('/api/v1/auth/refresh').set('Origin', TEST_ORIGIN)).status,
    ).toBe(401);
  });
});

describe('password reset', () => {
  it('answers the same for unknown emails', async () => {
    const res = await post('/password-reset/request', { email: uniqueEmail() });
    expect(res.status).toBe(202);
    expect(CodeSentResponse.parse(res.body).resendAfterSeconds).toBe(45);
    expect(sentEmails).toHaveLength(0);
  });

  it('sets a new password with the code and signs out every device', async () => {
    const { email, refresh: oldRefresh } = await signedInUser();
    sentEmails.length = 0;
    expect((await post('/password-reset/request', { email })).status).toBe(202);
    expect(sentEmails[0]?.subject).toBe('Mã đặt lại mật khẩu TPS-Connection');

    const weak = await post('/password-reset/confirm', {
      email,
      code: lastCode(email),
      newPassword: 'abc',
    });
    expect(weak.status).toBe(422);

    const res = await post('/password-reset/confirm', {
      email,
      code: lastCode(email),
      newPassword: 'matkhaumoi456',
    });
    expect(res.status).toBe(204);

    const oldSession = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', `tps_rt=${oldRefresh}`);
    expect(oldSession.status).toBe(401);
    expect((await post('/login', { email, password: PASSWORD })).status).toBe(401);
    expect((await post('/login', { email, password: 'matkhaumoi456' })).status).toBe(200);
  });

  it('also verifies the email of an account that never confirmed its code', async () => {
    const email = await register();
    await redis.flushdb(); // bỏ thời gian chờ gửi lại
    await post('/password-reset/request', { email });
    await post('/password-reset/confirm', {
      email,
      code: lastCode(email),
      newPassword: 'matkhaumoi456',
    });
    expect((await post('/login', { email, password: 'matkhaumoi456' })).status).toBe(200);
  });
});

describe('rate limits per IP', () => {
  it('limits sign-ups from one IP to 10 per hour', async () => {
    for (let i = 0; i < 10; i += 1) await register();
    const res = await post('/register', {
      role: 'parent',
      fullName: 'Mai',
      email: uniqueEmail(),
      password: PASSWORD,
      acceptTerms: true,
    });
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(3500);
  });
});

// ---- G2 phần 3: đổi mật khẩu, thiết bị đang đăng nhập, vai trò vận hành ----

/** Đăng nhập; trả cookie header dùng cho các request sau. */
async function loginAs(email: string, password = PASSWORD) {
  const res = await post('/login', { email, password });
  expect(res.status).toBe(200);
  const cookies = cookiesOf(res);
  const access = cookieValue(cookies.tps_at)!;
  const refresh = cookieValue(cookies.tps_rt)!;
  return { access, refresh, cookie: `tps_at=${access}; tps_rt=${refresh}` };
}

const authed = (method: 'get' | 'post', path: string, cookie: string) =>
  request(app)[method](`/api/v1/auth${path}`).set('Origin', TEST_ORIGIN).set('Cookie', cookie);

const refreshWith = (token: string) =>
  request(app)
    .post('/api/v1/auth/refresh')
    .set('Origin', TEST_ORIGIN)
    .set('Cookie', `tps_rt=${token}`);

describe('change password', () => {
  it('requires sign-in', async () => {
    const res = await post('/password/change', {
      currentPassword: PASSWORD,
      newPassword: 'moi12345',
    });
    expect(res.status).toBe(401);
  });

  it('flags a wrong current password on its field, and blocks after 5 tries', async () => {
    const { email } = await signedInUser();
    const { cookie } = await loginAs(email);
    const wrong = { currentPassword: 'saimatkhau1', newPassword: 'matkhaumoi456' };
    const res = await authed('post', '/password/change', cookie).send(wrong);
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ path: 'currentPassword', code: 'wrong_password' }),
    ]);
    for (let i = 0; i < 4; i += 1) await authed('post', '/password/change', cookie).send(wrong);
    const blocked = await authed('post', '/password/change', cookie).send({
      currentPassword: PASSWORD,
      newPassword: 'matkhaumoi456',
    });
    expect(blocked.status).toBe(429);
  });

  it('keeps this device signed in and signs out the others (D50)', async () => {
    const { email } = await signedInUser();
    const thisDevice = await loginAs(email);
    const otherDevice = await loginAs(email);

    const res = await authed('post', '/password/change', thisDevice.cookie).send({
      currentPassword: PASSWORD,
      newPassword: 'matkhaumoi456',
    });
    expect(res.status).toBe(204);
    expect((await refreshWith(thisDevice.refresh)).status).toBe(200);
    expect((await refreshWith(otherDevice.refresh)).status).toBe(401);
    expect((await post('/login', { email, password: PASSWORD })).status).toBe(401);
    expect((await post('/login', { email, password: 'matkhaumoi456' })).status).toBe(200);
  });
});

describe('active sessions', () => {
  it('lists each signed-in device, marks this one, and signs out the others', async () => {
    const { email } = await signedInUser(); // thiết bị 1 (xác thực email)
    const laptop = await loginAs(email); // thiết bị 2
    const phone = await loginAs(email); // thiết bị 3

    const list = await authed('get', '/sessions', laptop.cookie);
    expect(list.status).toBe(200);
    const items = (list.body.items as unknown[]).map((item) => ActiveSession.parse(item));
    expect(items).toHaveLength(3);
    expect(items.filter((s) => s.current)).toHaveLength(1);

    expect((await authed('post', '/sessions/revoke-others', laptop.cookie)).status).toBe(204);
    const after = await authed('get', '/sessions', laptop.cookie);
    expect(after.body.items).toHaveLength(1);
    expect(after.body.items[0].current).toBe(true);
    expect((await refreshWith(phone.refresh)).status).toBe(401);
    expect((await refreshWith(laptop.refresh)).status).toBe(200);
  });

  it("only shows the caller's own sessions", async () => {
    const a = await signedInUser();
    const b = await signedInUser();
    expect((await authed('get', '/sessions', `tps_at=${a.access}`)).body.items).toHaveLength(1);
    expect((await authed('get', '/sessions', `tps_at=${b.access}`)).body.items).toHaveLength(1);
    expect((await request(app).get('/api/v1/auth/sessions')).status).toBe(401);
  });
});

describe('staff roles (users:staff command)', () => {
  it('creates an admin without a password, who sets one with "forgot password"', async () => {
    const email = uniqueEmail();
    const result = await grantStaffRole(db, { email, fullName: 'Quản Trị Viên', role: 'admin' });
    expect(result).toMatchObject({ created: true, alreadyGranted: false });

    // Chưa có mật khẩu: không đăng nhập được bằng bất kỳ mật khẩu nào.
    expect((await post('/login', { email, password: PASSWORD })).body.error.code).toBe(
      'invalid_credentials',
    );
    await post('/password-reset/request', { email });
    await post('/password-reset/confirm', {
      email,
      code: lastCode(email),
      newPassword: 'quantri123',
    });
    const { cookie } = await loginAs(email, 'quantri123');
    const me = await authed('get', '/me', cookie);
    expect(me.body).toMatchObject({ roles: ['admin'], emailVerified: true });
  });

  it('adds a staff role to an existing account and is idempotent', async () => {
    const { email } = await signedInUser('parent');
    expect((await grantStaffRole(db, { email, role: 'manager' })).alreadyGranted).toBe(false);
    expect((await grantStaffRole(db, { email, role: 'manager' })).alreadyGranted).toBe(true);
    const { cookie } = await loginAs(email);
    expect((await authed('get', '/me', cookie)).body.roles).toEqual(['manager', 'parent']);
  });

  it('needs a name for a new account', async () => {
    await expect(grantStaffRole(db, { email: uniqueEmail(), role: 'admin' })).rejects.toThrow(
      /needs a name/,
    );
  });

  it('never removes the last admin', async () => {
    await db.query(
      `UPDATE user_roles SET revoked_at = now() WHERE role_code = 'admin' AND revoked_at IS NULL`,
    );
    const first = uniqueEmail();
    const second = uniqueEmail();
    await grantStaffRole(db, { email: first, fullName: 'A', role: 'admin' });
    await grantStaffRole(db, { email: second, fullName: 'B', role: 'admin' });

    expect(await revokeStaffRole(db, { email: first, role: 'admin' })).toEqual({ revoked: true });
    await expect(revokeStaffRole(db, { email: second, role: 'admin' })).rejects.toThrow(
      /last admin/,
    );
    expect(await revokeStaffRole(db, { email: first, role: 'admin' })).toEqual({ revoked: false });
  });
});
