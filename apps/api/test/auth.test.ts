import { Writable } from 'node:stream';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { sessionActorResolver } from '../src/auth/session-actor.js';
import { signAccessToken } from '../src/auth/tokens.js';
import { renderEmail } from '../src/email/templates.js';
import type { OutgoingEmail } from '../src/email/mailer.js';
import { createApp } from '../src/http/app.js';
import { drainOutbox, MAX_ATTEMPTS, processNextEvent } from '../src/outbox/process-outbox.js';
import { buildRoutes } from '../src/routes.js';
import { authConfig, connect, ownerDatabaseUrl } from './helpers.js';

const PASSWORD = 'correct horse battery';
const silent = pino({ level: 'silent' });

describe('accounts and sessions', () => {
  let db: DataSource;
  let owner: DataSource;
  let sent: OutgoingEmail[];
  let failSending: boolean;
  let logOutput: string;

  const buildApp = () =>
    createApp({
      routes: buildRoutes(db, authConfig),
      resolveActor: sessionActorResolver(db, authConfig),
      logger: pino(
        { level: 'info' },
        new Writable({
          write(chunk, _encoding, done) {
            logOutput += String(chunk);
            done();
          },
        }),
      ),
      webOrigins: [],
    });

  const deps = () => ({
    db,
    logger: silent,
    webBaseUrl: 'http://web.test',
    mailer: {
      send: async (email: OutgoingEmail) => {
        if (failSending) throw new Error(`rejected ${email.to}`);
        sent.push(email);
      },
    },
  });

  const signUp = (overrides: Record<string, unknown> = {}) =>
    request(buildApp())
      .post('/api/v1/auth/register')
      .send({
        role: 'parent',
        email: 'an@example.com',
        password: PASSWORD,
        displayName: 'An',
        locale: 'vi',
        acceptedTerms: true,
        ...overrides,
      });

  const tokenIn = (email: OutgoingEmail | undefined) => {
    const match = email?.text.match(/#token=([\w-]+)/);
    if (!match?.[1]) throw new Error('No token in email');
    return match[1];
  };

  const lastEmail = async () => {
    await drainOutbox(deps());
    return sent.at(-1);
  };

  const confirm = (token: string) =>
    request(buildApp()).post('/api/v1/auth/email-verification/confirm').send({ token });

  const login = (email = 'an@example.com', password = PASSWORD) =>
    request(buildApp()).post('/api/v1/auth/login').send({ email, password });

  const setCookies = (res: { headers: Record<string, unknown> }) =>
    (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

  const cookiePair = (res: { headers: Record<string, unknown> }, name: string) => {
    const line = setCookies(res).find((cookie) => cookie.startsWith(`${name}=`));
    if (!line) throw new Error(`No ${name} cookie`);
    return line.split(';')[0] as string;
  };

  const me = (accessCookie: string) =>
    request(buildApp()).get('/api/v1/me').set('Cookie', accessCookie);

  const refresh = (refreshCookie: string) =>
    request(buildApp()).post('/api/v1/auth/refresh').set('Cookie', refreshCookie);

  const signUpAndVerify = async () => {
    await signUp();
    await confirm(tokenIn(await lastEmail()));
  };

  beforeAll(async () => {
    db = await connect();
    owner = await connect(ownerDatabaseUrl());
  });

  afterAll(async () => {
    await db.destroy();
    await owner.destroy();
  });

  beforeEach(async () => {
    sent = [];
    failSending = false;
    logOutput = '';
    await owner.query(`
      TRUNCATE outbox_events, rate_limit_events, consents, one_time_tokens,
               user_sessions, user_roles, users
    `);
  });

  describe('sign-up', () => {
    it.each(['manager', 'admin', 'student'])('refuses the %s role (AC-ACC-01.1)', async (role) => {
      const res = await signUp({ role });
      expect(res.status).toBe(400);
      expect(await db.query('SELECT id FROM users')).toEqual([]);
    });

    it('refuses sign-up without accepting the terms (AC-ACC-01.2)', async () => {
      expect((await signUp({ acceptedTerms: false })).status).toBe(400);
      expect((await signUp({ acceptedTerms: undefined })).status).toBe(400);
    });

    it('records the accepted version and time of both documents (AC-ACC-01.2)', async () => {
      await signUp();
      const rows = await db.query(
        'SELECT document, version, accepted_at FROM consents ORDER BY document',
      );
      expect(rows.map((row: { document: string }) => row.document)).toEqual([
        'privacy_policy',
        'terms_of_service',
      ]);
      expect(rows[0].version).toBeTruthy();
      expect(rows[0].accepted_at).toBeInstanceOf(Date);
    });

    it('stores the password as Argon2id, and never logs or returns it (AC-ACC-01.3)', async () => {
      const res = await signUp();
      const [user] = await db.query('SELECT password_hash FROM users');
      expect(user.password_hash).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
      expect(logOutput).not.toContain(PASSWORD);
    });

    it('answers the same for a new and a taken email (AC-ACC-01.4)', async () => {
      const fresh = await signUp();
      const taken = await signUp();
      expect(taken.status).toBe(fresh.status);
      expect(taken.body).toEqual(fresh.body);
      expect(await db.query('SELECT id FROM users')).toHaveLength(1);
    });

    it('tells the real owner when their email is signed up again', async () => {
      await signUp({ locale: 'en' });
      await drainOutbox(deps());
      await signUp({ password: 'another long password', locale: 'vi' });
      const email = await lastEmail();
      expect(email?.subject).toBe(
        renderEmail('en', { template: 'already_registered', link: '' }).subject,
      );
      expect(sent).toHaveLength(2);
    });

    it('treats email as case-insensitive', async () => {
      await signUp();
      await signUp({ email: 'AN@Example.COM' });
      expect(await db.query('SELECT id FROM users')).toHaveLength(1);
    });

    it('refuses short and common passwords at the password field', async () => {
      const short = await signUp({ password: 'short' });
      expect(short.status).toBe(400);
      expect(short.body.fields[0].path).toBe('body.password');
      const common = await signUp({ password: 'Password123' });
      expect(common.status).toBe(400);
      expect(common.body.fields).toEqual([{ path: 'body.password', code: 'PASSWORD_TOO_COMMON' }]);
    });

    it('sends the verification email in the chosen language (AC-ACC-01.5)', async () => {
      await signUp({ locale: 'en' });
      const email = await lastEmail();
      expect(email?.to).toBe('an@example.com');
      expect(email?.subject).toBe('Verify your email on TPS-Connection');
      expect(email?.text).toContain('http://web.test/en/verify-email#token=');
    });

    it('does not put what a stranger typed into the email', async () => {
      await signUp({ displayName: 'Visit evil.example now' });
      expect((await lastEmail())?.text).not.toContain('evil.example');
    });
  });

  describe('email verification', () => {
    it('verifies once, and the link then stops working (AC-ACC-02.1)', async () => {
      await signUp();
      const token = tokenIn(await lastEmail());
      expect((await confirm(token)).status).toBe(200);
      const [user] = await db.query('SELECT email_verified_at FROM users');
      expect(user.email_verified_at).toBeInstanceOf(Date);

      const again = await confirm(token);
      expect(again.status).toBe(422);
      expect(again.body.code).toBe('TOKEN_INVALID_OR_EXPIRED');
    });

    it('stores only a hash of the token', async () => {
      await signUp();
      const token = tokenIn(await lastEmail());
      const [row] = await db.query('SELECT token_hash FROM one_time_tokens');
      expect(row.token_hash).not.toContain(token);
      const [event] = await db.query('SELECT payload FROM outbox_events');
      expect(JSON.stringify(event.payload)).not.toContain(token);
    });

    it('expires the link after 24 hours (AC-ACC-02.1)', async () => {
      await signUp();
      const token = tokenIn(await lastEmail());
      const [row] = await db.query(
        `SELECT expires_at - created_at AS lifetime FROM one_time_tokens`,
      );
      expect(row.lifetime.hours ?? row.lifetime.days * 24).toBe(24);

      await owner.query(`UPDATE one_time_tokens SET expires_at = now() - interval '1 second'`);
      expect((await confirm(token)).status).toBe(422);
    });

    it('signs in unverified, can read own account, but nothing else (AC-ACC-02.2)', async () => {
      await signUp();
      const res = await login();
      expect(res.status).toBe(200);
      expect(res.body.emailVerified).toBe(false);
      const account = await me(cookiePair(res, 'tps_access'));
      expect(account.status).toBe(200);
      expect(account.body.emailVerified).toBe(false);
    });

    it('a new link replaces the old one (AC-ACC-02.3)', async () => {
      await signUp();
      const first = tokenIn(await lastEmail());
      const res = await request(buildApp())
        .post('/api/v1/auth/email-verification/resend')
        .send({ email: 'an@example.com' });
      expect(res.status).toBe(202);
      const second = tokenIn(await lastEmail());
      expect((await confirm(first)).status).toBe(422);
      expect((await confirm(second)).status).toBe(200);
    });

    it('limits resending, with the same answer for unknown emails (AC-ACC-02.3)', async () => {
      const resend = (email: string) =>
        request(buildApp()).post('/api/v1/auth/email-verification/resend').send({ email });
      await signUp();
      for (const email of ['an@example.com', 'nobody@example.com']) {
        for (let i = 0; i < 3; i += 1) expect((await resend(email)).status).toBe(202);
        const blocked = await resend(email);
        expect(blocked.status).toBe(429);
        expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      }
    });
  });

  describe('sign-in', () => {
    beforeEach(signUpAndVerify);

    it('gives the same answer for a wrong email and a wrong password (AC-ACC-03.1)', async () => {
      const wrongPassword = await login('an@example.com', 'wrong password here');
      const wrongEmail = await login('nobody@example.com', PASSWORD);
      expect(wrongPassword.status).toBe(401);
      expect(wrongEmail.status).toBe(401);
      expect(wrongEmail.body.code).toBe('INVALID_CREDENTIALS');
      expect(wrongEmail.body.code).toBe(wrongPassword.body.code);
      expect(wrongEmail.body.title).toBe(wrongPassword.body.title);
    });

    it('blocks the sixth attempt even with the right password (AC-ACC-03.2)', async () => {
      for (let i = 0; i < 5; i += 1) {
        expect((await login('an@example.com', 'wrong password here')).status).toBe(401);
      }
      const sixth = await login();
      expect(sixth.status).toBe(429);
      expect(sixth.body.code).toBe('LOGIN_TEMPORARILY_BLOCKED');
      expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);
      expect(setCookies(sixth)).toEqual([]);
    });

    it('allows at most five parallel attempts through the limit', async () => {
      const results = await Promise.all(
        Array.from({ length: 12 }, () => login('an@example.com', 'wrong password here')),
      );
      // Racing requests may be refused a little early, but never let through a sixth.
      const tried = results.filter((res) => res.status === 401).length;
      expect(tried).toBeGreaterThan(0);
      expect(tried).toBeLessThanOrEqual(5);
      expect(results.filter((res) => res.status === 429)).toHaveLength(12 - tried);
    });

    it('blocks unknown emails the same way, so a block reveals nothing', async () => {
      for (let i = 0; i < 5; i += 1) await login('nobody@example.com', 'wrong password here');
      expect((await login('nobody@example.com', 'wrong password here')).status).toBe(429);
    });

    it('allows signing in again once the window has passed', async () => {
      for (let i = 0; i < 5; i += 1) await login('an@example.com', 'wrong password here');
      await owner.query(`UPDATE rate_limit_events SET occurred_at = now() - interval '16 minutes'`);
      expect((await login()).status).toBe(200);
    });

    it('forgets earlier failures after a successful sign-in', async () => {
      for (let i = 0; i < 4; i += 1) await login('an@example.com', 'wrong password here');
      expect((await login()).status).toBe(200);
      for (let i = 0; i < 5; i += 1) {
        expect((await login('an@example.com', 'wrong password here')).status).toBe(401);
      }
    });

    it('keeps every token in an httpOnly, Secure, SameSite cookie (AC-ACC-03.3)', async () => {
      const res = await login();
      expect(setCookies(res)).toHaveLength(3);
      for (const cookie of setCookies(res)) {
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Lax');
      }
      expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    });

    it('sends the refresh cookie only to the auth endpoints', async () => {
      const line = setCookies(await login()).find((c) => c.startsWith('tps_refresh='));
      expect(line).toContain('Path=/api/v1/auth');
    });

    it('stores only a hash of the refresh token', async () => {
      const value = cookiePair(await login(), 'tps_refresh').split('=')[1] as string;
      const [row] = await db.query('SELECT refresh_token_hash FROM user_sessions');
      expect(row.refresh_token_hash).not.toBe(value);
    });

    it('records sign-ins in the audit log without the email or password', async () => {
      const res = await login();
      const rows = await db.query(
        `SELECT action, metadata::text FROM audit_logs WHERE target_id = $1
          ORDER BY occurred_at DESC`,
        [res.body.id],
      );
      expect(rows[0].action).toBe('auth.login.succeeded');
      expect(rows[0].metadata).toBe('{}');
    });

    it('refuses a locked account and says so (UC-ACC-03)', async () => {
      await owner.query(`UPDATE users SET status = 'locked'`);
      const res = await login();
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_LOCKED');
      expect((await login('an@example.com', 'wrong password here')).body.code).toBe(
        'INVALID_CREDENTIALS',
      );
    });

    it('ends REST access at once when an account is locked (AC-ACC-03.6)', async () => {
      const cookie = cookiePair(await login(), 'tps_access');
      expect((await me(cookie)).status).toBe(200);
      await owner.query(`UPDATE users SET status = 'locked'`);
      expect((await me(cookie)).status).toBe(401);
    });

    it('refuses a deleted account (AC-ACC-08.1)', async () => {
      const cookie = cookiePair(await login(), 'tps_access');
      await owner.query(`UPDATE users SET deleted_at = now()`);
      expect((await me(cookie)).status).toBe(401);
      expect((await login()).status).toBe(401);
    });

    it('rejects a forged or expired access token', async () => {
      const res = await login();
      const session = await db.query('SELECT id, family_id FROM user_sessions');
      const forged = await signAccessToken(
        { userId: res.body.id, sessionId: session[0].id, familyId: session[0].family_id },
        { ...authConfig, secret: 'another-secret-another-secret-another' },
      );
      expect((await me(`tps_access=${forged}`)).status).toBe(401);
      expect((await me('tps_access=garbage')).status).toBe(401);
    });

    it('treats a bad cookie as a guest on public routes', async () => {
      const res = await request(buildApp())
        .get('/api/v1/health')
        .set('Cookie', 'tps_access=garbage');
      expect(res.status).toBe(200);
    });
  });

  describe('refresh tokens', () => {
    beforeEach(signUpAndVerify);

    it('rotates: a new token works and gives new cookies (AC-ACC-03.4)', async () => {
      const first = await login();
      const res = await refresh(cookiePair(first, 'tps_refresh'));
      expect(res.status).toBe(200);
      expect(cookiePair(res, 'tps_refresh')).not.toBe(cookiePair(first, 'tps_refresh'));
      expect((await me(cookiePair(res, 'tps_access'))).status).toBe(200);
    });

    it('keeps the CSRF token through rotation', async () => {
      const first = await login();
      const res = await refresh(cookiePair(first, 'tps_refresh'));
      expect(cookiePair(res, 'tps_csrf')).toBe(cookiePair(first, 'tps_csrf'));
    });

    it('revokes the whole family when an old token is reused (AC-ACC-03.4)', async () => {
      const first = await login();
      const oldToken = cookiePair(first, 'tps_refresh');
      const second = await refresh(oldToken);
      const newAccess = cookiePair(second, 'tps_access');
      const newToken = cookiePair(second, 'tps_refresh');

      const reuse = await refresh(oldToken);
      expect(reuse.status).toBe(401);
      expect(setCookies(reuse).join()).toContain('tps_access=;');

      expect((await refresh(newToken)).status).toBe(401);
      expect((await me(newAccess)).status).toBe(401);
      const [audit] = await db.query(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'auth.session.reuse_detected'
          AND target_id = $1`,
        [first.body.id],
      );
      expect(audit.n).toBe(1);
    });

    it('does not touch other sign-ins when one family is revoked', async () => {
      const phone = await login();
      const laptop = await login();
      const oldToken = cookiePair(phone, 'tps_refresh');
      await refresh(oldToken);
      await refresh(oldToken);
      expect((await refresh(cookiePair(laptop, 'tps_refresh'))).status).toBe(200);
    });

    it('allows only one of two simultaneous uses of a token', async () => {
      const token = cookiePair(await login(), 'tps_refresh');
      const results = await Promise.all([refresh(token), refresh(token)]);
      expect(results.map((res) => res.status).sort()).toEqual([200, 401]);
    });

    it('refuses an expired token and a locked account', async () => {
      const first = await login();
      await owner.query(`UPDATE user_sessions SET expires_at = now() - interval '1 second'`);
      expect((await refresh(cookiePair(first, 'tps_refresh'))).status).toBe(401);

      const second = await login();
      await owner.query(`UPDATE users SET status = 'locked'`);
      expect((await refresh(cookiePair(second, 'tps_refresh'))).status).toBe(401);
    });

    it('refuses a missing or unknown token', async () => {
      expect((await request(buildApp()).post('/api/v1/auth/refresh')).status).toBe(401);
      expect((await refresh('tps_refresh=unknown')).status).toBe(401);
    });

    it('ends the session on sign-out (AC-ACC-03.5)', async () => {
      const res = await login();
      const token = cookiePair(res, 'tps_refresh');
      const out = await request(buildApp()).post('/api/v1/auth/logout').set('Cookie', token);
      expect(out.status).toBe(200);
      expect(setCookies(out).join()).toContain('tps_refresh=;');
      expect((await refresh(token)).status).toBe(401);
      expect((await me(cookiePair(res, 'tps_access'))).status).toBe(401);
    });
  });

  describe('password reset', () => {
    const forgot = (email = 'an@example.com') =>
      request(buildApp()).post('/api/v1/auth/password/forgot').send({ email });
    const reset = (token: string, newPassword = 'a brand new password') =>
      request(buildApp()).post('/api/v1/auth/password/reset').send({ token, newPassword });

    beforeEach(signUpAndVerify);

    it('answers the same whether or not the email exists (AC-ACC-04.1)', async () => {
      const known = await forgot();
      const unknown = await forgot('nobody@example.com');
      expect(unknown.status).toBe(known.status);
      expect(unknown.body).toEqual(known.body);
      await drainOutbox(deps());
      expect(sent.filter((email) => email.to === 'nobody@example.com')).toEqual([]);
    });

    it('sets the new password and works only once (AC-ACC-04.2)', async () => {
      await forgot();
      const token = tokenIn(await lastEmail());
      expect((await reset(token)).status).toBe(200);
      expect((await login('an@example.com', 'a brand new password')).status).toBe(200);
      expect((await login()).status).toBe(401);
      expect((await reset(token, 'yet another password')).status).toBe(422);
    });

    it('expires the link after 30 minutes (AC-ACC-04.2)', async () => {
      await forgot();
      const token = tokenIn(await lastEmail());
      const [row] = await db.query(
        `SELECT expires_at - created_at AS lifetime FROM one_time_tokens
          WHERE purpose = 'reset_password'`,
      );
      expect(row.lifetime.minutes).toBe(30);
      await owner.query(`UPDATE one_time_tokens SET expires_at = now() - interval '1 second'`);
      expect((await reset(token)).status).toBe(422);
    });

    it('allows three requests an hour, for known and unknown emails (AC-ACC-04.2)', async () => {
      for (const email of ['an@example.com', 'nobody@example.com']) {
        for (let i = 0; i < 3; i += 1) expect((await forgot(email)).status).toBe(202);
        expect((await forgot(email)).status).toBe(429);
      }
    });

    it('ends every session and tells the owner (AC-ACC-04.3)', async () => {
      const session = await login();
      await forgot();
      const token = tokenIn(await lastEmail());
      await reset(token);
      expect((await me(cookiePair(session, 'tps_access'))).status).toBe(401);
      expect((await refresh(cookiePair(session, 'tps_refresh'))).status).toBe(401);
      expect((await lastEmail())?.subject).toBe(
        renderEmail('vi', { template: 'password_changed', link: '' }).subject,
      );
    });

    it('does not use up the link when the new password is refused', async () => {
      await forgot();
      const token = tokenIn(await lastEmail());
      expect((await reset(token, 'password123')).status).toBe(400);
      expect((await reset(token)).status).toBe(200);
    });

    it('lifts a sign-in block after a reset', async () => {
      for (let i = 0; i < 5; i += 1) await login('an@example.com', 'wrong password here');
      await forgot();
      await reset(tokenIn(await lastEmail()));
      expect((await login('an@example.com', 'a brand new password')).status).toBe(200);
    });

    it('never logs the token or the new password', async () => {
      await forgot();
      const token = tokenIn(await lastEmail());
      await reset(token);
      expect(logOutput).not.toContain(token);
      expect(logOutput).not.toContain('a brand new password');
    });
  });

  describe('outbox', () => {
    it('does not create the event when the change fails (AC-NOT-01.2)', async () => {
      await expect(
        db.transaction(async (tx) => {
          await tx.query(
            `INSERT INTO outbox_events (id, type, aggregate_id)
             VALUES (gen_random_uuid(), 'email.verify_email', gen_random_uuid())`,
          );
          throw new Error('business failure');
        }),
      ).rejects.toThrow('business failure');
      expect(await db.query('SELECT id FROM outbox_events')).toEqual([]);
    });

    it('does not send an event twice when run again (AC-NOT-01.3)', async () => {
      await signUp();
      await drainOutbox(deps());
      await drainOutbox(deps());
      expect(sent).toHaveLength(1);
    });

    it('undoes the token when sending fails, then retries later (NFR-R06)', async () => {
      await signUp();
      failSending = true;
      await processNextEvent(deps());
      expect(await db.query('SELECT id FROM one_time_tokens')).toEqual([]);
      const [event] = await db.query(
        'SELECT attempts, processed_at, failed_at, next_attempt_at > now() AS later FROM outbox_events',
      );
      expect(event).toMatchObject({
        attempts: 1,
        processed_at: null,
        failed_at: null,
        later: true,
      });

      // Not due yet, so the Worker leaves it alone.
      expect(await processNextEvent(deps())).toBe(false);

      failSending = false;
      await owner.query(`UPDATE outbox_events SET next_attempt_at = now()`);
      await drainOutbox(deps());
      expect((await confirm(tokenIn(sent[0]))).status).toBe(200);
    });

    it('gives up after five attempts and raises an error (NFR-R06)', async () => {
      await signUp();
      failSending = true;
      const errors: unknown[] = [];
      const logger = pino(
        { level: 'error' },
        new Writable({
          write(chunk, _encoding, done) {
            errors.push(JSON.parse(String(chunk)));
            done();
          },
        }),
      );
      for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
        await owner.query(`UPDATE outbox_events SET next_attempt_at = now()`);
        await processNextEvent({ ...deps(), logger });
      }
      const [event] = await db.query('SELECT attempts, failed_at FROM outbox_events');
      expect(event.attempts).toBe(MAX_ATTEMPTS);
      expect(event.failed_at).toBeInstanceOf(Date);
      expect(errors).toHaveLength(1);
      expect(JSON.stringify(errors)).not.toContain('an@example.com');

      await owner.query(`UPDATE outbox_events SET next_attempt_at = now()`);
      expect(await processNextEvent(deps())).toBe(false);
    });

    it('sends nothing to deleted or locked accounts (AC-NOT-02.4)', async () => {
      await signUp();
      await owner.query(`UPDATE users SET status = 'locked'`);
      await drainOutbox(deps());
      expect(sent).toEqual([]);
    });

    it('does not resend verification to an account that verified meanwhile', async () => {
      await signUp();
      await owner.query(`UPDATE users SET email_verified_at = now()`);
      await drainOutbox(deps());
      expect(sent).toEqual([]);
    });
  });

  describe('account endpoint', () => {
    beforeEach(signUpAndVerify);

    it('answers 401 to guests', async () => {
      expect((await request(buildApp()).get('/api/v1/me')).status).toBe(401);
    });

    it('returns only the allowed fields', async () => {
      const res = await me(cookiePair(await login(), 'tps_access'));
      expect(Object.keys(res.body).sort()).toEqual([
        'displayName',
        'email',
        'emailVerified',
        'id',
        'locale',
        'role',
      ]);
    });
  });

  it('sets aside a deleted account so its email can sign up again (BR-1307)', async () => {
    await signUp();
    await owner.query(`UPDATE users SET deleted_at = now()`);
    await signUp();
    expect(await db.query('SELECT id FROM users')).toHaveLength(2);
  });
});
