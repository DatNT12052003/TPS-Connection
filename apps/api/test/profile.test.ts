import { pino } from 'pino';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { sessionActorResolver } from '../src/auth/session-actor.js';
import { hashPassword } from '../src/auth/password.js';
import type { OutgoingEmail } from '../src/email/mailer.js';
import { BUCKETS } from '../src/files/file-store.js';
import { purgeFiles } from '../src/files/purge-files.js';
import { createApp } from '../src/http/app.js';
import { AVATAR_MAX_BYTES } from '../src/modules/files/files.service.js';
import { drainOutbox } from '../src/outbox/process-outbox.js';
import { buildRoutes } from '../src/routes.js';
import { authConfig, connect, ownerDatabaseUrl, realFileStore } from './helpers.js';

const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'a brand new password';
const silent = pino({ level: 'silent' });
const store = realFileStore();

type Session = { cookie: string; csrf: string; userId: string };

describe('profile, files and students', () => {
  let db: DataSource;
  let owner: DataSource;
  let sent: OutgoingEmail[];
  let gradeId: string;
  let inactiveGradeId: string;
  let passwordHash: string;

  const app = () =>
    createApp({
      routes: buildRoutes(db, authConfig, store),
      resolveActor: sessionActorResolver(db, authConfig),
      logger: silent,
      webOrigins: [],
    });

  // The clock of a database in a VM can step back by seconds, which would make a
  // new event look not yet due. Tests must not depend on that.
  const drain = async () => {
    await owner.query(`UPDATE outbox_events SET next_attempt_at = now() - interval '1 minute'`);
    return drainOutbox({
      db,
      logger: silent,
      webBaseUrl: 'http://web.test',
      mailer: {
        send: async (email) => {
          sent.push(email);
        },
      },
    });
  };

  async function createUser(
    email: string,
    role: 'parent' | 'tutor',
    { verified = true } = {},
  ): Promise<string> {
    const id = uuidv7();
    await owner.query(
      `INSERT INTO users (id, email, password_hash, display_name, email_verified_at)
       VALUES ($1, $2, $3, 'User', $4)`,
      [id, email, passwordHash, verified ? new Date() : null],
    );
    await owner.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`, [id, role]);
    return id;
  }

  async function signIn(email: string, password = PASSWORD): Promise<Session> {
    const res = await request(app()).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const pair = (name: string) =>
      cookies.find((c) => c.startsWith(`${name}=`))?.split(';')[0] as string;
    return {
      cookie: [pair('tps_access'), pair('tps_refresh')].join('; '),
      csrf: pair('tps_csrf').split('=')[1] as string,
      userId: res.body.id,
    };
  }

  const as = (session: Session) => ({
    get: (path: string) => request(app()).get(`/api/v1${path}`).set('Cookie', session.cookie),
    post: (path: string, body?: object) =>
      request(app())
        .post(`/api/v1${path}`)
        .set('Cookie', session.cookie)
        .set('X-CSRF-Token', session.csrf)
        .send(body),
    patch: (path: string, body: object) =>
      request(app())
        .patch(`/api/v1${path}`)
        .set('Cookie', session.cookie)
        .set('X-CSRF-Token', session.csrf)
        .send(body),
    delete: (path: string) =>
      request(app())
        .delete(`/api/v1${path}`)
        .set('Cookie', session.cookie)
        .set('X-CSRF-Token', session.csrf),
  });

  const tokenIn = (email: OutgoingEmail | undefined) => {
    const match = email?.text.match(/#token=([\w-]+)/);
    if (!match?.[1]) throw new Error('No token in email');
    return match[1];
  };

  const png = () =>
    sharp({ create: { width: 900, height: 700, channels: 3, background: '#336699' } })
      .png()
      .toBuffer();

  async function upload(session: Session, content: Buffer, mimeType = 'image/png') {
    const started = await as(session).post('/files', {
      purpose: 'avatar',
      mimeType,
      sizeBytes: content.length,
    });
    expect(started.status).toBe(201);
    const put = await fetch(started.body.uploadUrl, {
      method: 'PUT',
      headers: started.body.uploadHeaders,
      body: new Uint8Array(content),
    });
    expect(put.status).toBe(200);
    return started.body.id as string;
  }

  beforeAll(async () => {
    db = await connect();
    owner = await connect(ownerDatabaseUrl());
    passwordHash = await hashPassword(PASSWORD);
  });

  afterAll(async () => {
    await db.destroy();
    await owner.destroy();
  });

  beforeEach(async () => {
    sent = [];
    await owner.query(`
      TRUNCATE outbox_events, rate_limit_events, consents, one_time_tokens, user_sessions,
               user_roles, students, files, users, grades CASCADE
    `);
    gradeId = uuidv7();
    inactiveGradeId = uuidv7();
    await owner.query(
      `INSERT INTO grades (id, name_vi, name_en, sort_order, is_active) VALUES
       ($1, 'Lớp 5', 'Grade 5', 5, true), ($2, 'Lớp cũ', 'Old grade', 99, false)`,
      [gradeId, inactiveGradeId],
    );
  });

  describe('personal information', () => {
    let session: Session;
    beforeEach(async () => {
      await createUser('an@example.com', 'parent');
      session = await signIn('an@example.com');
    });

    it('changes name, phone and language, effective at once', async () => {
      const res = await as(session).patch('/me', {
        displayName: 'An Mới',
        phone: '0900 000 000',
        locale: 'en',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        displayName: 'An Mới',
        phone: '0900 000 000',
        locale: 'en',
      });
      expect((await as(session).get('/me')).body.displayName).toBe('An Mới');
    });

    it('clears the phone with null and leaves unnamed fields alone', async () => {
      await as(session).patch('/me', { phone: '0900000000', displayName: 'Giữ' });
      const res = await as(session).patch('/me', { phone: null });
      expect(res.body).toMatchObject({ phone: null, displayName: 'Giữ' });
    });

    it('refuses a role or email sent to this endpoint (AC-ACC-05.1)', async () => {
      for (const body of [{ role: 'admin' }, { email: 'x@example.com' }, { status: 'active' }]) {
        expect((await as(session).patch('/me', body)).status).toBe(400);
      }
      expect((await as(session).get('/me')).body.role).toBe('parent');
    });

    it('refuses a badly formed phone number', async () => {
      const res = await as(session).patch('/me', { phone: 'call me maybe' });
      expect(res.status).toBe(400);
      expect(res.body.fields[0].path).toBe('body.phone');
    });

    it('requires the CSRF token', async () => {
      const res = await request(app())
        .patch('/api/v1/me')
        .set('Cookie', session.cookie)
        .send({ displayName: 'Bị giả mạo' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('sends later email in the newly chosen language (AC-ACC-05.5)', async () => {
      await as(session).patch('/me', { locale: 'en' });
      await as(session).post('/me/email-change', {
        newEmail: 'new@example.com',
        currentPassword: PASSWORD,
      });
      await drain();
      expect(sent.length).toBeGreaterThan(0);
      for (const email of sent) expect(email.text).toMatch(/^Hello,/);
    });
  });

  describe('changing the password', () => {
    let session: Session;
    beforeEach(async () => {
      await createUser('an@example.com', 'parent');
      session = await signIn('an@example.com');
    });

    const change = (currentPassword: string, newPassword = NEW_PASSWORD) =>
      as(session).post('/me/password', { currentPassword, newPassword });

    it('needs the current password', async () => {
      const res = await change('wrong password here');
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ path: 'body.currentPassword', code: 'WRONG_PASSWORD' }]);
      expect((await signIn('an@example.com')).userId).toBe(session.userId);
    });

    it('limits guessing the current password', async () => {
      for (let i = 0; i < 5; i += 1) expect((await change('wrong password here')).status).toBe(400);
      expect((await change(PASSWORD)).status).toBe(429);
    });

    it('refuses a common new password', async () => {
      const res = await change(PASSWORD, 'password123');
      expect(res.body.fields[0].code).toBe('PASSWORD_TOO_COMMON');
    });

    it('signs out other sessions but keeps this one', async () => {
      const other = await signIn('an@example.com');
      expect((await change(PASSWORD)).status).toBe(200);
      expect((await as(other).get('/me')).status).toBe(401);
      expect((await as(session).get('/me')).status).toBe(200);
      expect((await signIn('an@example.com', NEW_PASSWORD)).userId).toBe(session.userId);
    });

    it('tells the owner by email', async () => {
      await change(PASSWORD);
      await drain();
      expect(sent.map((email) => email.to)).toEqual(['an@example.com']);
    });
  });

  describe('changing the email', () => {
    let session: Session;
    beforeEach(async () => {
      await createUser('an@example.com', 'parent');
      session = await signIn('an@example.com');
    });

    const requestChange = (newEmail = 'new@example.com', currentPassword = PASSWORD) =>
      as(session).post('/me/email-change', { newEmail, currentPassword });
    const confirm = (token: string) =>
      request(app()).post('/api/v1/auth/email-change/confirm').send({ token });

    it('needs the password', async () => {
      expect((await requestChange('new@example.com', 'wrong password here')).status).toBe(400);
      await drain();
      expect(sent).toEqual([]);
    });

    it('keeps the old email working until the new one confirms (AC-ACC-05.2)', async () => {
      expect((await requestChange()).status).toBe(202);
      await drain();
      expect((await signIn('an@example.com')).userId).toBe(session.userId);
      const link = sent.find((email) => email.to === 'new@example.com');

      expect((await confirm(tokenIn(link))).status).toBe(200);
      expect((await as(session).get('/me')).body.email).toBe('new@example.com');
      expect((await signIn('new@example.com')).userId).toBe(session.userId);
      const old = await request(app())
        .post('/api/v1/auth/login')
        .send({ email: 'an@example.com', password: PASSWORD });
      expect(old.status).toBe(401);
    });

    it('tells the old address, without a usable link', async () => {
      await requestChange();
      await drain();
      const notice = sent.find((email) => email.to === 'an@example.com');
      expect(notice?.text).not.toContain('#token=');
    });

    it('works once only', async () => {
      await requestChange();
      await drain();
      const token = tokenIn(sent.find((email) => email.to === 'new@example.com'));
      expect((await confirm(token)).status).toBe(200);
      expect((await confirm(token)).status).toBe(422);
    });

    it('answers the same when the new address is taken, and sends it no link', async () => {
      await createUser('taken@example.com', 'tutor');
      const taken = await requestChange('taken@example.com');
      const free = await requestChange('free@example.com');
      expect(taken.status).toBe(free.status);
      expect(taken.body).toEqual(free.body);
      await drain();
      const toTaken = sent.filter((email) => email.to === 'taken@example.com');
      expect(toTaken).toHaveLength(1);
      expect(toTaken[0]?.text).not.toContain('#token=');
    });

    it('refuses the link if the address was taken in the meantime', async () => {
      await requestChange();
      await drain();
      const token = tokenIn(sent.find((email) => email.to === 'new@example.com'));
      await createUser('new@example.com', 'tutor');
      expect((await confirm(token)).status).toBe(422);
      expect((await as(session).get('/me')).body.email).toBe('an@example.com');
    });

    it('verifies the account, so a mistyped sign-up email can be corrected', async () => {
      await createUser('typo@example.com', 'parent', { verified: false });
      session = await signIn('typo@example.com');
      expect((await requestChange('right@example.com')).status).toBe(202);
      await drain();
      await confirm(tokenIn(sent.find((email) => email.to === 'right@example.com')));
      expect((await as(session).get('/me')).body.emailVerified).toBe(true);
    });

    it('limits requests', async () => {
      for (let i = 0; i < 3; i += 1) {
        expect((await requestChange(`n${i}@example.com`)).status).toBe(202);
      }
      expect((await requestChange('n9@example.com')).status).toBe(429);
    });

    it('leaves no address behind in finished events', async () => {
      await requestChange();
      await drain();
      const rows = await owner.query(`SELECT payload::text AS payload FROM outbox_events`);
      expect(JSON.stringify(rows)).not.toContain('new@example.com');
    });
  });

  describe('avatars', () => {
    let session: Session;
    beforeEach(async () => {
      await createUser('an@example.com', 'parent');
      session = await signIn('an@example.com');
    });

    const complete = (id: string) => as(session).post(`/files/${id}/complete`);

    it('stores a real image and shows it through a signed URL', async () => {
      const id = await upload(session, await png());
      expect((await complete(id)).status).toBe(200);
      const res = await as(session).patch('/me', { avatarFileId: id });
      expect(res.status).toBe(200);
      expect(res.body.avatarUrl).toContain('X-Amz-Signature');

      const image = await fetch(res.body.avatarUrl);
      expect(image.status).toBe(200);
      const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(512);
    });

    it('removes location and camera data from the photo', async () => {
      const withExif = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#123456' },
      })
        .withExif({ IFD0: { Make: 'SecretCamera' }, IFD3: { GPSLatitude: '10/1 0/1 0/1' } })
        .jpeg()
        .toBuffer();
      expect((await sharp(withExif).metadata()).exif).toBeDefined();
      const id = await upload(session, withExif, 'image/jpeg');
      await complete(id);
      const [file] = await db.query(`SELECT bucket, object_key FROM files WHERE id = $1`, [id]);
      const stored = await store.read({ bucket: file.bucket, key: file.object_key });
      expect((await sharp(stored).metadata()).exif).toBeUndefined();
      expect(stored.includes('SecretCamera')).toBe(false);
    });

    it('refuses a text file renamed as an image (AC-ACC-05.3)', async () => {
      const id = await upload(session, Buffer.from('this is not an image at all'));
      const res = await complete(id);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('FILE_NOT_A_VALID_IMAGE');
      expect((await as(session).patch('/me', { avatarFileId: id })).status).toBe(400);
    });

    it('refuses a real image header on broken data', async () => {
      const good = await png();
      const id = await upload(session, good.subarray(0, 40));
      expect((await complete(id)).status).toBe(422);
    });

    it('refuses SVG, which can hold scripts', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"><script>x</script></svg>',
      );
      const id = await upload(session, svg);
      expect((await complete(id)).status).toBe(422);
    });

    it('refuses to start an upload over 5 MB or of another type (AC-ACC-05.3)', async () => {
      const big = await as(session).post('/files', {
        purpose: 'avatar',
        mimeType: 'image/png',
        sizeBytes: AVATAR_MAX_BYTES + 1,
      });
      expect(big.status).toBe(400);
      const pdf = await as(session).post('/files', {
        purpose: 'avatar',
        mimeType: 'application/pdf',
        sizeBytes: 100,
      });
      expect(pdf.status).toBe(400);
    });

    it('has the store refuse more bytes than were declared', async () => {
      const started = await as(session).post('/files', {
        purpose: 'avatar',
        mimeType: 'image/png',
        sizeBytes: 10,
      });
      const put = await fetch(started.body.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: new Uint8Array(5000),
      });
      expect(put.ok).toBe(false);
    });

    it('checks the real size, not the declared one', async () => {
      const id = uuidv7();
      const ref = { bucket: BUCKETS.files, key: `avatars/${session.userId}/${id}` };
      await db.query(
        `INSERT INTO files (id, owner_user_id, purpose, bucket, object_key, mime_type, size_bytes)
         VALUES ($1, $2, 'avatar', $3, $4, 'image/png', 10)`,
        [id, session.userId, ref.bucket, ref.key],
      );
      await store.write(ref, Buffer.alloc(AVATAR_MAX_BYTES + 1), 'image/png');
      const res = await complete(id);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('FILE_TOO_LARGE');
    });

    it('says when nothing was uploaded, and allows trying again', async () => {
      const started = await as(session).post('/files', {
        purpose: 'avatar',
        mimeType: 'image/png',
        sizeBytes: 10,
      });
      const res = await complete(started.body.id);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('FILE_NOT_UPLOADED');
    });

    it('can repeat completion safely', async () => {
      const id = await upload(session, await png());
      expect((await complete(id)).status).toBe(200);
      expect((await complete(id)).status).toBe(200);
    });

    it('keeps the bucket private: the plain URL does not open', async () => {
      const id = await upload(session, await png());
      await complete(id);
      const [file] = await db.query(`SELECT bucket, object_key FROM files WHERE id = $1`, [id]);
      const res = await fetch(`http://localhost:9000/${file.bucket}/${file.object_key}`);
      expect(res.status).toBe(403);
    });

    it("hides another person's file, and refuses it as an avatar", async () => {
      await createUser('binh@example.com', 'parent');
      const other = await signIn('binh@example.com');
      const id = await upload(other, await png());
      expect((await complete(id)).status).toBe(404);
      await as(other).post(`/files/${id}/complete`);
      const res = await as(session).patch('/me', { avatarFileId: id });
      expect(res.status).toBe(400);
      expect(res.body.fields[0].code).toBe('FILE_NOT_USABLE');
    });

    it('refuses an upload that was never completed as an avatar', async () => {
      const id = await upload(session, await png());
      expect((await as(session).patch('/me', { avatarFileId: id })).status).toBe(400);
    });

    it('removes the replaced avatar from storage', async () => {
      const first = await upload(session, await png());
      await complete(first);
      await as(session).patch('/me', { avatarFileId: first });
      const [file] = await db.query(`SELECT bucket, object_key FROM files WHERE id = $1`, [first]);
      const ref = { bucket: file.bucket, key: file.object_key };

      const second = await upload(session, await png());
      await complete(second);
      await as(session).patch('/me', { avatarFileId: second });
      expect(await store.sizeOf(ref)).toBeDefined();

      await purgeFiles(db, store);
      expect(await store.sizeOf(ref)).toBeUndefined();
      expect((await as(session).get('/me')).body.avatarUrl).toContain(second);
    });

    it('removes a refused upload, and running again is harmless', async () => {
      const id = await upload(session, Buffer.from('not an image'));
      await complete(id);
      expect(await purgeFiles(db, store)).toBe(1);
      expect(await purgeFiles(db, store)).toBe(0);
    });

    it('removes uploads abandoned for over a day, and only those', async () => {
      const recent = await upload(session, await png());
      const old = await upload(session, await png());
      await owner.query(`UPDATE files SET created_at = now() - interval '25 hours' WHERE id = $1`, [
        old,
      ]);
      expect(await purgeFiles(db, store)).toBe(1);
      const rows = await db.query(`SELECT id FROM files WHERE purged_at IS NULL`);
      expect(rows).toEqual([{ id: recent }]);
    });

    it('refuses uploads from accounts with an unverified email', async () => {
      await createUser('new@example.com', 'parent', { verified: false });
      const unverified = await signIn('new@example.com');
      const res = await as(unverified).post('/files', {
        purpose: 'avatar',
        mimeType: 'image/png',
        sizeBytes: 10,
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });
  });

  describe('student profiles', () => {
    let parentA: Session;
    let parentB: Session;

    beforeEach(async () => {
      await createUser('a@example.com', 'parent');
      await createUser('b@example.com', 'parent');
      parentA = await signIn('a@example.com');
      parentB = await signIn('b@example.com');
    });

    const create = (session: Session, body: object = {}) =>
      as(session).post('/students', {
        nickname: 'Bi',
        gradeId,
        acceptedOnBehalf: true,
        ...body,
      });

    it('needs only a nickname and a grade (AC-ACC-06.2)', async () => {
      const res = await create(parentA);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        nickname: 'Bi',
        fullName: null,
        gradeId,
        gradeNameVi: 'Lớp 5',
        gradeNameEn: 'Grade 5',
      });
      expect((await as(parentA).post('/students', { gradeId })).status).toBe(400);
      expect((await as(parentA).post('/students', { nickname: 'Bi' })).status).toBe(400);
    });

    it('has no way to store an address or birth date (AC-ACC-06.2)', async () => {
      for (const extra of [{ address: '1 Lê Lợi' }, { birthDate: '2015-01-01' }]) {
        expect((await create(parentA, extra)).status).toBe(400);
      }
      const columns = await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'students'`,
      );
      const names = columns.map((c: { column_name: string }) => c.column_name).join();
      expect(names).not.toMatch(/address|birth/);
    });

    it('records consent given on the child behalf (NFR-P04)', async () => {
      const res = await create(parentA);
      const rows = await db.query(`SELECT user_id, version FROM consents WHERE student_id = $1`, [
        res.body.id,
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(parentA.userId);
      expect((await create(parentA, { acceptedOnBehalf: false })).status).toBe(400);
    });

    it('allows several children', async () => {
      await create(parentA);
      await create(parentA, { nickname: 'Na' });
      const res = await as(parentA).get('/students');
      expect(res.body.data.map((s: { nickname: string }) => s.nickname).sort()).toEqual([
        'Bi',
        'Na',
      ]);
      expect(res.body.page).toEqual({ number: 1, limit: 20, total: 2 });
    });

    it('paginates, at most 50 a page (NFR-F07)', async () => {
      await create(parentA);
      await create(parentA, { nickname: 'Na' });
      const res = await as(parentA).get('/students?limit=1&page=2');
      expect(res.body.data).toHaveLength(1);
      expect((await as(parentA).get('/students?limit=51')).status).toBe(400);
    });

    it('refuses an inactive grade for new choices (AC-MOD-05.2)', async () => {
      const res = await create(parentA, { gradeId: inactiveGradeId });
      expect(res.status).toBe(422);
      expect(res.body.fields[0].path).toBe('body.gradeId');
    });

    it('still shows a grade switched off later (AC-MOD-05.2)', async () => {
      const student = await create(parentA);
      await owner.query(`UPDATE grades SET is_active = false WHERE id = $1`, [gradeId]);
      const res = await as(parentA).get(`/students/${student.body.id}`);
      expect(res.body.gradeNameVi).toBe('Lớp 5');
    });

    it('changes a profile, clearing the full name with null', async () => {
      const student = await create(parentA, { fullName: 'Nguyễn Bi' });
      const res = await as(parentA).patch(`/students/${student.body.id}`, {
        nickname: 'Bi Bi',
        fullName: null,
      });
      expect(res.body).toMatchObject({ nickname: 'Bi Bi', fullName: null, gradeId });
    });

    describe("another parent's child (AC-ACC-06.3, required test 1)", () => {
      let childOfA: string;
      beforeEach(async () => {
        childOfA = (await create(parentA)).body.id;
      });

      it('cannot be read', async () => {
        expect((await as(parentB).get(`/students/${childOfA}`)).status).toBe(404);
      });

      it('cannot be changed', async () => {
        const res = await as(parentB).patch(`/students/${childOfA}`, { nickname: 'Hack' });
        expect(res.status).toBe(404);
        expect((await as(parentA).get(`/students/${childOfA}`)).body.nickname).toBe('Bi');
      });

      it('cannot be deleted', async () => {
        expect((await as(parentB).delete(`/students/${childOfA}`)).status).toBe(404);
        expect((await as(parentA).get(`/students/${childOfA}`)).status).toBe(200);
      });

      it('does not appear in the list', async () => {
        expect((await as(parentB).get('/students')).body.data).toEqual([]);
        expect((await as(parentB).get('/students')).body.page.total).toBe(0);
      });
    });

    it('offers no way to add a second guardian (AC-ACC-06.4)', async () => {
      const student = await create(parentA);
      const res = await as(parentA).patch(`/students/${student.body.id}`, {
        guardianUserId: parentB.userId,
      });
      expect(res.status).toBe(400);
      const injected = await create(parentA, { guardianUserId: parentB.userId });
      expect(injected.status).toBe(400);
      const [row] = await db.query(`SELECT guardian_user_id FROM students WHERE id = $1`, [
        student.body.id,
      ]);
      expect(row.guardian_user_id).toBe(parentA.userId);
    });

    it('hides a deleted profile everywhere', async () => {
      const id = (await create(parentA)).body.id;
      expect((await as(parentA).delete(`/students/${id}`)).status).toBe(200);
      expect((await as(parentA).get(`/students/${id}`)).status).toBe(404);
      expect((await as(parentA).get('/students')).body.data).toEqual([]);
      expect((await as(parentA).delete(`/students/${id}`)).status).toBe(404);
    });

    describe('other callers (required test 3)', () => {
      let childId: string;
      let tutor: Session;
      beforeEach(async () => {
        childId = (await create(parentA)).body.id;
        await createUser('tutor@example.com', 'tutor');
        tutor = await signIn('tutor@example.com');
      });

      it('refuses tutors', async () => {
        expect((await as(tutor).get(`/students/${childId}`)).status).toBe(404);
        expect((await as(tutor).get('/students')).status).toBe(403);
        expect((await create(tutor)).status).toBe(403);
      });

      it('refuses guests', async () => {
        expect((await request(app()).get(`/api/v1/students/${childId}`)).status).toBe(401);
        expect((await request(app()).get('/api/v1/students')).status).toBe(401);
      });

      it('refuses a parent who has not verified their email', async () => {
        await createUser('new@example.com', 'parent', { verified: false });
        const unverified = await signIn('new@example.com');
        const res = await create(unverified);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
      });
    });

    it('returns only the allowed fields', async () => {
      const res = await create(parentA);
      expect(Object.keys(res.body).sort()).toEqual([
        'fullName',
        'gradeId',
        'gradeNameEn',
        'gradeNameVi',
        'id',
        'nickname',
      ]);
    });
  });

  it('lists active grades in order, for anyone', async () => {
    await owner.query(
      `INSERT INTO grades (id, name_vi, name_en, sort_order) VALUES ($1, 'Lớp 1', 'Grade 1', 1)`,
      [uuidv7()],
    );
    const res = await request(app()).get('/api/v1/catalog/grades');
    expect(res.status).toBe(200);
    expect(res.body.data.map((g: { nameVi: string }) => g.nameVi)).toEqual(['Lớp 1', 'Lớp 5']);
  });
});
