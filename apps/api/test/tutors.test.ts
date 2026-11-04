import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { hashPassword } from '../src/auth/password.js';
import { sessionActorResolver } from '../src/auth/session-actor.js';
import { createApp } from '../src/http/app.js';
import { importRegions } from '../src/modules/catalog/import-regions.js';
import { buildRoutes } from '../src/routes.js';
import { authConfig, connect, ownerDatabaseUrl, realFileStore } from './helpers.js';

const PASSWORD = 'correct horse battery';
const store = realFileStore();

type Session = { cookie: string; csrf: string; userId: string };
type Role = 'tutor' | 'parent' | 'manager' | 'admin';

describe('catalog, tutor profiles and public pages', () => {
  let db: DataSource;
  let owner: DataSource;
  let passwordHash: string;
  let subjectId: string;
  let gradeId: string;
  let provinceId: string;
  let communeId: string;

  const app = () =>
    createApp({
      routes: buildRoutes(db, authConfig, store),
      resolveActor: sessionActorResolver(db, authConfig),
      logger: pino({ level: 'silent' }),
      webOrigins: [],
    });

  async function signInAs(role: Role, { verified = true } = {}): Promise<Session> {
    const email = `${role}-${uuidv7()}@example.com`;
    const id = uuidv7();
    await owner.query(
      `INSERT INTO users (id, email, password_hash, display_name, email_verified_at)
       VALUES ($1, $2, $3, 'Cô Lan', $4)`,
      [id, email, passwordHash, verified ? new Date() : null],
    );
    await owner.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`, [id, role]);
    const res = await request(app()).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const pair = (name: string) =>
      cookies.find((c) => c.startsWith(`${name}=`))?.split(';')[0] as string;
    return {
      cookie: pair('tps_access'),
      csrf: pair('tps_csrf').split('=')[1] as string,
      userId: id,
    };
  }

  const send = (method: 'post' | 'put' | 'patch', session: Session, path: string, body: object) => {
    const client = request(app());
    return client[method](`/api/v1${path}`)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf)
      .send(body);
  };
  const get = (session: Session, path: string) =>
    request(app()).get(`/api/v1${path}`).set('Cookie', session.cookie);

  const profile = (overrides: object = {}) => ({
    legalName: 'Nguyễn Thị Lan',
    tutorType: 'teacher',
    organization: 'Trường THPT Chu Văn An',
    introduction: 'Dạy Toán 10 năm.',
    experience: 'Luyện thi đại học.',
    teachingMethod: 'Học qua bài tập.',
    pricePerLessonVnd: 300000,
    lessonMinutes: 90,
    teachingModes: ['online'],
    acceptingStudents: true,
    subjectIds: [subjectId],
    gradeIds: [gradeId],
    regionIds: [communeId],
    availability: [{ weekday: 1, startTime: '18:00', endTime: '20:00' }],
    ...overrides,
  });

  const save = (session: Session, overrides: object = {}) =>
    send('put', session, '/me/tutor-profile', profile(overrides));

  const setStatus = (userId: string, status: string) =>
    owner.query(`UPDATE tutor_profiles SET verification_status = $2 WHERE user_id = $1`, [
      userId,
      status,
    ]);

  const publicPage = (id: string) => request(app()).get(`/api/v1/public/tutors/${id}`);

  beforeAll(async () => {
    db = await connect();
    owner = await connect(ownerDatabaseUrl());
    passwordHash = await hashPassword(PASSWORD);
  });

  afterAll(async () => {
    await owner.query(`TRUNCATE users, regions, grades, subjects CASCADE`);
    await db.destroy();
    await owner.destroy();
  });

  beforeEach(async () => {
    await owner.query(
      `TRUNCATE outbox_events, rate_limit_events, users, regions, grades, subjects CASCADE`,
    );
    subjectId = uuidv7();
    gradeId = uuidv7();
    await owner.query(`INSERT INTO subjects (id, name_vi, name_en) VALUES ($1, 'Toán', 'Maths')`, [
      subjectId,
    ]);
    await owner.query(
      `INSERT INTO grades (id, name_vi, name_en, sort_order) VALUES ($1, 'Lớp 5', 'Grade 5', 5)`,
      [gradeId],
    );
    await importRegions(owner, [
      { code: 'P1', level: 'province', nameVi: 'Hà Nội', nameEn: 'Hanoi' },
      { code: 'C1', level: 'commune', nameVi: 'Ba Đình', nameEn: 'Ba Dinh', parentCode: 'P1' },
    ]);
    const regions: { id: string; code: string }[] = await owner.query(
      `SELECT id, code FROM regions`,
    );
    provinceId = regions.find((r) => r.code === 'P1')?.id as string;
    communeId = regions.find((r) => r.code === 'C1')?.id as string;
  });

  describe('own tutor profile', () => {
    it('starts empty, then saves and reads back the same', async () => {
      const tutor = await signInAs('tutor');
      const empty = await get(tutor, '/me/tutor-profile');
      expect(empty.body).toEqual({ verificationStatus: 'incomplete', profile: null });

      const res = await save(tutor);
      expect(res.status).toBe(200);
      expect(res.body.verificationStatus).toBe('incomplete');
      expect(res.body.profile).toEqual(profile());
    });

    it('replaces lists instead of adding to them', async () => {
      const tutor = await signInAs('tutor');
      await save(tutor);
      const res = await save(tutor, { regionIds: [provinceId], availability: [] });
      expect(res.body.profile.regionIds).toEqual([provinceId]);
      expect(res.body.profile.availability).toEqual([]);
    });

    it('accepts only catalog entries, not free text (AC-MKT-01.2)', async () => {
      const tutor = await signInAs('tutor');
      expect((await save(tutor, { subjectIds: ['Toán'] })).status).toBe(400);
      const unknown = await save(tutor, { subjectIds: [uuidv7()] });
      expect(unknown.status).toBe(422);
      expect(unknown.body.fields).toEqual([{ path: 'body.subjectIds', code: 'NOT_SELECTABLE' }]);
    });

    it('keeps a switched-off entry but refuses it as a new choice (AC-MOD-05.2)', async () => {
      const tutor = await signInAs('tutor');
      await save(tutor);
      await owner.query(`UPDATE subjects SET is_active = false WHERE id = $1`, [subjectId]);
      expect((await save(tutor, { introduction: 'Đổi giới thiệu.' })).status).toBe(200);

      const other = await signInAs('tutor');
      expect((await save(other)).status).toBe(422);
    });

    it('takes a whole VND price per lesson, with no hourly price (AC-MKT-01.3)', async () => {
      const tutor = await signInAs('tutor');
      expect((await save(tutor, { pricePerLessonVnd: 100.5 })).status).toBe(400);
      expect((await save(tutor, { pricePerLessonVnd: 0 })).status).toBe(400);
      expect((await save(tutor, { pricePerHourVnd: 100000 })).status).toBe(400);
      expect((await save(tutor, { lessonMinutes: undefined })).status).toBe(400);
    });

    it('refuses a time slot that ends before it starts', async () => {
      const tutor = await signInAs('tutor');
      const res = await save(tutor, {
        availability: [{ weekday: 1, startTime: '20:00', endTime: '18:00' }],
      });
      expect(res.status).toBe(400);
    });

    it('cannot set its own verification status', async () => {
      const tutor = await signInAs('tutor');
      const res = await save(tutor, { verificationStatus: 'verified' });
      expect(res.status).toBe(400);
      expect((await get(tutor, '/me/tutor-profile')).body.verificationStatus).toBe('incomplete');
    });

    it('only ever touches the caller, so tutor A cannot edit B (AC-MKT-01.5)', async () => {
      const a = await signInAs('tutor');
      const b = await signInAs('tutor');
      await save(b, { introduction: 'Của B.' });
      const hijack = await save(a, { userId: b.userId, tutorId: b.userId });
      expect(hijack.status).toBe(400);
      await save(a, { introduction: 'Của A.' });
      expect((await get(b, '/me/tutor-profile')).body.profile.introduction).toBe('Của B.');
    });

    it('allows unverified tutors to save (BR-206)', async () => {
      const tutor = await signInAs('tutor');
      await setStatus(tutor.userId, 'incomplete');
      expect((await save(tutor)).status).toBe(200);
    });

    it('refuses other roles and unverified emails', async () => {
      expect((await save(await signInAs('parent'))).status).toBe(403);
      expect((await get(await signInAs('manager'), '/me/tutor-profile')).status).toBe(403);
      const res = await save(await signInAs('tutor', { verified: false }));
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
      expect((await request(app()).get('/api/v1/me/tutor-profile')).status).toBe(401);
    });

    it('requires the CSRF token', async () => {
      const tutor = await signInAs('tutor');
      const res = await request(app())
        .put('/api/v1/me/tutor-profile')
        .set('Cookie', tutor.cookie)
        .send(profile());
      expect(res.body.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('does not let a verified tutor quietly change the checked name (BR-209)', async () => {
      const tutor = await signInAs('tutor');
      await save(tutor);
      await setStatus(tutor.userId, 'verified');
      const renamed = await save(tutor, { legalName: 'Tên Khác' });
      expect(renamed.status).toBe(409);
      expect(renamed.body.code).toBe('REVERIFICATION_REQUIRED');
      // Other fields do not trigger it (AC-VER-05.1).
      expect((await save(tutor, { pricePerLessonVnd: 350000 })).status).toBe(200);
      expect((await get(tutor, '/me/tutor-profile')).body.verificationStatus).toBe('verified');
    });
  });

  describe('verified status on the actor', () => {
    it('reads it from the database on each request', async () => {
      const { sessionActorResolver: resolve } = await import('../src/auth/session-actor.js');
      const tutor = await signInAs('tutor');
      await save(tutor);
      const actor = () => resolve(db, authConfig)({ cookie: tutor.cookie });
      expect(await actor()).toMatchObject({ tutorVerified: false });
      await setStatus(tutor.userId, 'verified');
      expect(await actor()).toMatchObject({ tutorVerified: true });
      await setStatus(tutor.userId, 'revoked');
      expect(await actor()).toMatchObject({ tutorVerified: false });
    });
  });

  describe('public tutor page', () => {
    let tutor: Session;
    beforeEach(async () => {
      tutor = await signInAs('tutor');
      await save(tutor);
    });

    it.each(['incomplete', 'pending_review', 'rejected', 'revoked'])(
      'hides a tutor who is %s (AC-MKT-01.1, AC-MKT-05.3)',
      async (status) => {
        await setStatus(tutor.userId, status);
        expect((await publicPage(tutor.userId)).status).toBe(404);
      },
    );

    it('shows a verified tutor to guests', async () => {
      await setStatus(tutor.userId, 'verified');
      const res = await publicPage(tutor.userId);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        displayName: 'Cô Lan',
        pricePerLessonVnd: 300000,
        lessonMinutes: 90,
        introduction: 'Dạy Toán 10 năm.',
        subjects: [{ id: subjectId, nameVi: 'Toán', nameEn: 'Maths' }],
        grades: [{ id: gradeId, nameVi: 'Lớp 5', nameEn: 'Grade 5' }],
      });
    });

    it('never holds private fields (AC-MKT-05.2)', async () => {
      await send('patch', tutor, '/me', { phone: '0900000000' });
      await setStatus(tutor.userId, 'verified');
      const res = await publicPage(tutor.userId);
      expect(Object.keys(res.body).sort()).toEqual([
        'acceptingStudents',
        'avatarUrl',
        'displayName',
        'experience',
        'grades',
        'id',
        'introduction',
        'lessonMinutes',
        'pricePerLessonVnd',
        'provinces',
        'subjects',
        'teachingMethod',
        'teachingModes',
      ]);
      const text = JSON.stringify(res.body);
      for (const secret of ['Nguyễn Thị Lan', 'Chu Văn An', '0900000000', '@example.com']) {
        expect(text).not.toContain(secret);
      }
    });

    it('shows the province, never the commune (BR-301)', async () => {
      await setStatus(tutor.userId, 'verified');
      const res = await publicPage(tutor.userId);
      expect(res.body.provinces).toEqual([{ id: provinceId, nameVi: 'Hà Nội', nameEn: 'Hanoi' }]);
      expect(JSON.stringify(res.body)).not.toContain('Ba Đình');
    });

    it('stays visible with a label when not taking students (BR-309)', async () => {
      await save(tutor, { acceptingStudents: false });
      await setStatus(tutor.userId, 'verified');
      const res = await publicPage(tutor.userId);
      expect(res.status).toBe(200);
      expect(res.body.acceptingStudents).toBe(false);
    });

    it('still shows a catalog name switched off later (AC-MOD-05.2)', async () => {
      await setStatus(tutor.userId, 'verified');
      await owner.query(`UPDATE subjects SET is_active = false`);
      expect((await publicPage(tutor.userId)).body.subjects[0].nameVi).toBe('Toán');
    });

    it('hides deleted and locked accounts (AC-MKT-05.3)', async () => {
      await setStatus(tutor.userId, 'verified');
      await owner.query(`UPDATE users SET status = 'locked' WHERE id = $1`, [tutor.userId]);
      expect((await publicPage(tutor.userId)).status).toBe(404);
      await owner.query(`UPDATE users SET status = 'active', deleted_at = now() WHERE id = $1`, [
        tutor.userId,
      ]);
      expect((await publicPage(tutor.userId)).status).toBe(404);
    });

    it('answers 404 for an unknown ID and for a parent ID', async () => {
      expect((await publicPage(uuidv7())).status).toBe(404);
      const parent = await signInAs('parent');
      expect((await publicPage(parent.userId)).status).toBe(404);
    });
  });

  describe('public regions', () => {
    it('lists active provinces, then the communes of one', async () => {
      const provinces = await request(app()).get('/api/v1/catalog/regions');
      expect(provinces.body.data.map((r: { code: string }) => r.code)).toEqual(['P1']);
      const communes = await request(app()).get(`/api/v1/catalog/regions?parentId=${provinceId}`);
      expect(communes.body.data.map((r: { code: string }) => r.code)).toEqual(['C1']);
      expect(communes.body.page).toEqual({ number: 1, limit: 50, total: 1 });
    });

    it('leaves out switched-off regions', async () => {
      await owner.query(`UPDATE regions SET is_active = false WHERE code = 'P1'`);
      expect((await request(app()).get('/api/v1/catalog/regions')).body.data).toEqual([]);
    });
  });

  describe('importing regions (AC-MOD-05.3)', () => {
    it('can run again, updating by code and removing nothing', async () => {
      await importRegions(owner, [
        { code: 'P1', level: 'province', nameVi: 'TP Hà Nội', nameEn: 'Hanoi City' },
      ]);
      const rows = await owner.query(`SELECT name_vi FROM regions WHERE code = 'P1'`);
      expect(rows[0].name_vi).toBe('TP Hà Nội');
      expect(await owner.query(`SELECT id FROM regions`)).toHaveLength(2);
    });

    it('takes communes listed before their province', async () => {
      await importRegions(owner, [
        { code: 'C2', level: 'commune', nameVi: 'X', nameEn: 'X', parentCode: 'P2' },
        { code: 'P2', level: 'province', nameVi: 'Y', nameEn: 'Y' },
      ]);
      expect(await owner.query(`SELECT id FROM regions WHERE code = 'C2'`)).toHaveLength(1);
    });

    it('refuses a commune whose province does not exist', async () => {
      await expect(
        importRegions(owner, [
          { code: 'C3', level: 'commune', nameVi: 'X', nameEn: 'X', parentCode: 'NOPE' },
        ]),
      ).rejects.toThrow(/no province/);
    });
  });

  describe('managing the catalog (UC-MOD-05)', () => {
    let admin: Session;
    beforeEach(async () => {
      admin = await signInAs('admin');
    });

    it.each(['tutor', 'parent', 'manager'] as const)('refuses a %s', async (role) => {
      const other = await signInAs(role);
      expect((await get(other, '/admin/catalog/subjects')).status).toBe(403);
      const res = await send('post', other, '/admin/catalog/subjects', {
        nameVi: 'Sinh học',
        nameEn: 'Biology',
      });
      expect(res.status).toBe(403);
      expect(
        (
          await send('patch', other, `/admin/catalog/subjects/${subjectId}`, {
            isActive: false,
          })
        ).status,
      ).toBe(403);
    });

    it('refuses guests', async () => {
      expect((await request(app()).get('/api/v1/admin/catalog/subjects')).status).toBe(401);
    });

    it.each([
      ['subjects', {}],
      ['grades', { sortOrder: 9 }],
      ['regions', { code: 'P9' }],
    ])('needs both names for %s (AC-MOD-05.1)', async (kind, extra) => {
      const path = `/admin/catalog/${kind}`;
      expect((await send('post', admin, path, { nameVi: 'Chỉ Việt', ...extra })).status).toBe(400);
      expect((await send('post', admin, path, { nameEn: 'Only En', ...extra })).status).toBe(400);
      expect((await send('post', admin, path, { nameVi: ' ', nameEn: 'X', ...extra })).status).toBe(
        400,
      );
      const ok = await send('post', admin, path, { nameVi: 'Mới', nameEn: 'New', ...extra });
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ nameVi: 'Mới', nameEn: 'New', isActive: true });
    });

    it('has no way to delete an entry (AC-MOD-05.2)', async () => {
      const res = await request(app())
        .delete(`/api/v1/admin/catalog/subjects/${subjectId}`)
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrf);
      expect(res.status).toBe(404);
    });

    it('switches off: gone from new choices, kept in the admin list', async () => {
      const res = await send('patch', admin, `/admin/catalog/subjects/${subjectId}`, {
        isActive: false,
      });
      expect(res.body.isActive).toBe(false);
      expect((await request(app()).get('/api/v1/catalog/subjects')).body.data).toEqual([]);
      const listed = await get(admin, '/admin/catalog/subjects');
      expect(listed.body.data).toHaveLength(1);
      expect(listed.body.page.total).toBe(1);
    });

    it('renames, leaving the other name alone', async () => {
      const res = await send('patch', admin, `/admin/catalog/grades/${gradeId}`, {
        nameEn: 'Fifth grade',
      });
      expect(res.body).toMatchObject({ nameVi: 'Lớp 5', nameEn: 'Fifth grade', sortOrder: 5 });
    });

    it('answers 409 for a duplicate name or code', async () => {
      const dup = await send('post', admin, '/admin/catalog/subjects', {
        nameVi: 'Toán',
        nameEn: 'Different',
      });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('CATALOG_DUPLICATE');
      const code = await send('post', admin, '/admin/catalog/regions', {
        code: 'P1',
        nameVi: 'A',
        nameEn: 'B',
      });
      expect(code.status).toBe(409);
    });

    it('nests a commune under a province only', async () => {
      const ok = await send('post', admin, '/admin/catalog/regions', {
        code: 'C9',
        nameVi: 'Xã',
        nameEn: 'Commune',
        parentId: provinceId,
      });
      expect(ok.body).toMatchObject({ level: 'commune', parentId: provinceId });
      const bad = await send('post', admin, '/admin/catalog/regions', {
        code: 'C10',
        nameVi: 'Xã',
        nameEn: 'Commune',
        parentId: communeId,
      });
      expect(bad.status).toBe(422);
      const listed = await get(admin, `/admin/catalog/regions?parentId=${provinceId}`);
      expect(listed.body.page.total).toBe(2);
    });

    it('answers 404 for an unknown entry', async () => {
      const res = await send('patch', admin, `/admin/catalog/subjects/${uuidv7()}`, {
        isActive: false,
      });
      expect(res.status).toBe(404);
    });

    it('records who changed what in the audit log', async () => {
      await send('patch', admin, `/admin/catalog/subjects/${subjectId}`, { isActive: false });
      const rows = await db.query(
        `SELECT actor_user_id, action FROM audit_logs WHERE target_id = $1`,
        [subjectId],
      );
      expect(rows).toEqual([{ actor_user_id: admin.userId, action: 'catalog.subject.updated' }]);
    });

    it('does not write the audit record when the change fails', async () => {
      const before = await db.query(`SELECT count(*)::int AS n FROM audit_logs`);
      await send('post', admin, '/admin/catalog/subjects', { nameVi: 'Toán', nameEn: 'Other' });
      const after = await db.query(`SELECT count(*)::int AS n FROM audit_logs`);
      expect(after[0].n).toBe(before[0].n);
    });
  });
});
