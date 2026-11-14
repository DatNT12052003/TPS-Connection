// Hồ sơ gia sư, hồ sơ công khai, thông tin cá nhân, ảnh đại diện và danh mục (G2 phần 5), qua HTTP
// (Supertest) với PostgreSQL thật (Testcontainers). Kho lưu tệp là bản giả trong bộ nhớ (luồng S3 thật có ở
// shared-services.int.test.ts). Người dùng được tạo thẳng trong database, đăng nhập bằng access token ký sẵn.
//
// Điều kiện hoàn thành G2: API công khai không lộ email hay số điện thoại (describe "public tutor profile").
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  AccountProfile,
  ApiErrorBody,
  FILE_RULES,
  OwnTutorProfile,
  PublicTutorProfile,
  type Role,
  TutorCredential,
  UploadTicketResponse,
} from '@tps/shared';
import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApp } from '../../src/app.js';
import { createDataSource } from '../../src/db/data-source.js';
import { createMemoryRateLimiter } from '../../src/lib/rate-limiter.js';
import { buildStorageKey, type Storage } from '../../src/lib/storage.js';
import type { AuthService } from '../../src/modules/auth/auth.service.js';
import { createCatalogService } from '../../src/modules/catalog/catalog.service.js';
import { createFilesService } from '../../src/modules/files/files.service.js';
import type { LearnersService } from '../../src/modules/learners/learners.service.js';
import type { StudentInvitationsService } from '../../src/modules/learners/student-invitations.service.js';
import type { ParentsService } from '../../src/modules/parents/parents.service.js';
import { createTutorsService } from '../../src/modules/tutors/tutors.service.js';
import { createAccountService } from '../../src/modules/users/account.service.js';
import { createUsersRepository } from '../../src/modules/users/users.repository.js';
import { createTokenService } from '../../src/modules/auth/tokens.js';
import { silentLogger, TEST_JWT_SECRET, TEST_ORIGIN, testEnv } from '../helpers.js';

jest.setTimeout(180_000);

const CDN = 'http://cdn.test';

let postgres: StartedPostgreSqlContainer;
let db: DataSource;
let app: Express;
const tokens = createTokenService({ secret: TEST_JWT_SECRET });

/** Kho lưu tệp giả: "tải lên" bằng `uploaded.set(key, ...)`. */
const uploaded = new Map<string, { sizeBytes: number; contentType: string }>();
const deletedKeys: string[] = [];
const fakeStorage: Pick<
  Storage,
  'createUploadTicket' | 'headObject' | 'deleteObject' | 'publicUrl'
> = {
  async createUploadTicket(input) {
    const storageKey = buildStorageKey(input.purpose, input.ownerId, input.contentType);
    return {
      bucket: FILE_RULES[input.purpose].bucket,
      storageKey,
      uploadUrl: `http://storage.test/${storageKey}?signature=fake`,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
  },
  async headObject(_bucket, storageKey) {
    return uploaded.get(storageKey) ?? null;
  },
  async deleteObject(_bucket, storageKey) {
    deletedKeys.push(storageKey);
    uploaded.delete(storageKey);
  },
  publicUrl: (storageKey) => `${CDN}/${storageKey}`,
};

const ids = { math: 0, english: 0, grade9: 0, grade10: 0, hanoi: 0, baDinh: 0 };

beforeAll(async () => {
  postgres = await new PostgreSqlContainer('postgres:18.6-alpine').start();
  db = createDataSource({ DATABASE_URL: postgres.getConnectionUri(), DATABASE_POOL_MAX: 4 });
  await db.initialize();
  await db.runMigrations();

  const one = async (sql: string, params: unknown[] = []) =>
    (await db.query<{ id: number }[]>(sql, params))[0]!.id;
  ids.math = await one(`SELECT id FROM subjects WHERE code = 'math'`);
  ids.english = await one(`SELECT id FROM subjects WHERE code = 'english'`);
  [ids.grade9, ids.grade10] = (
    await db.query<{ id: number }[]>(
      `SELECT id FROM grade_levels WHERE stage IN ('lower_secondary', 'upper_secondary')
        ORDER BY sort_order DESC LIMIT 2 OFFSET 1`,
    )
  ).map((r) => r.id) as [number, number];
  ids.hanoi = await one(
    `INSERT INTO administrative_areas (code, level, unit_type, name, full_name, name_ascii)
     VALUES ('01', 'province', 'municipality', 'Hà Nội', 'Thành phố Hà Nội', 'Ha Noi') RETURNING id`,
  );
  ids.baDinh = await one(
    `INSERT INTO administrative_areas (code, level, unit_type, parent_id, name, full_name, name_ascii)
     VALUES ('00004', 'commune', 'ward', $1, 'Ba Đình', 'Phường Ba Đình', 'Ba Dinh') RETURNING id`,
    [ids.hanoi],
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
  const publicFileUrl = fakeStorage.publicUrl;
  app = createApp({
    env: testEnv,
    logger: silentLogger,
    health: { check: async () => ({ status: 'ok', checks: {} }) },
    // authenticate chỉ cần getAuthUser; các luồng đăng nhập có test riêng.
    auth: { getAuthUser } as AuthService,
    tokens,
    rateLimiter: createMemoryRateLimiter(),
    parents: {} as ParentsService,
    learners: {} as LearnersService,
    studentInvitations: {} as StudentInvitationsService,
    tutors: createTutorsService({ dataSource: db, logger: silentLogger, publicFileUrl }),
    account: createAccountService({
      dataSource: db,
      files: createFilesService({ storage: fakeStorage, logger: silentLogger }),
      publicFileUrl,
      logger: silentLogger,
    }),
    catalog: createCatalogService({ dataSource: db }),
  });
});

afterAll(async () => {
  await db?.destroy();
  await postgres?.stop();
});

// ---- Tiện ích ---------------------------------------------------------------------------------

let counter = 0;
const uniqueEmail = (prefix: string) => `${prefix}${Date.now()}${(counter += 1)}@example.com`;

interface TestUser {
  id: string;
  email: string;
  phone: string;
  auth: string;
}

async function createUser(role: Role, name = 'Lê Hoàng Nam'): Promise<TestUser> {
  const email = uniqueEmail(role);
  const phone = `09${String(Date.now()).slice(-8)}`;
  const [row] = await db.query<{ id: string }[]>(
    `INSERT INTO users (email, email_verified_at, display_name, full_name, phone)
     VALUES ($1, now(), $2, $2, $3) RETURNING id`,
    [email, name, phone],
  );
  const id = row!.id;
  await db.query(`INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2)`, [id, role]);
  const { token } = tokens.signAccessToken({ userId: id, sessionFamilyId: randomUUID() });
  return { id, email, phone, auth: `Bearer ${token}` };
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
    delete: (path: string) => prepare(request(app).delete(`/api/v1${path}`)),
  };
};

const fullProfile = () => ({
  headline: 'Gia sư Toán THCS, 5 năm kinh nghiệm',
  bio: 'Tốt nghiệp Sư phạm Toán.',
  occupation: 'teacher',
  institution: 'THCS Giảng Võ',
  experienceYears: 5,
  teachingMode: 'hybrid',
  rate: { amountVnd: 200_000, unit: 'session' },
  teachingSubjects: [
    { subjectId: ids.math, gradeLevelId: ids.grade9 },
    { subjectId: ids.math, gradeLevelId: ids.grade10 },
  ],
  serviceAreaIds: [ids.baDinh],
  availability: [
    { weekday: 2, startTime: '18:00', endTime: '20:00' },
    { weekday: 4, startTime: '19:30', endTime: '21:00' },
  ],
});

/** Gia sư đã điền hồ sơ và được duyệt danh tính (G3 sẽ làm bằng luồng xác minh thật). */
async function verifiedTutor(name = 'Lê Hoàng Nam'): Promise<TestUser> {
  const tutor = await createUser('tutor', name);
  expect((await api(tutor).put('/me/tutor-profile', fullProfile())).status).toBe(200);
  await db.query(
    `UPDATE tutor_profiles SET profile_status = 'verified', identity_verified_at = now()
      WHERE user_id = $1`,
    [tutor.id],
  );
  return tutor;
}

/** Cấp URL tải ảnh và giả lập trình duyệt đã PUT tệp lên kho. */
async function uploadAvatar(user: TestUser, options: { upload?: boolean } = {}) {
  const res = await api(user).post('/files/uploads', {
    purpose: 'avatar',
    fileName: 'anh-dai-dien.png',
    contentType: 'image/png',
    sizeBytes: 2048,
  });
  expect(res.status).toBe(201);
  const ticket = UploadTicketResponse.parse(res.body);
  if (options.upload ?? true) {
    uploaded.set(ticket.storageKey, { sizeBytes: 2048, contentType: 'image/png' });
  }
  return ticket;
}

// ---- Danh mục ---------------------------------------------------------------------------------

describe('catalog', () => {
  it('lists subjects, grade levels, provinces and the communes of a province without signing in', async () => {
    const subjects = await api(null).get('/catalog/subjects');
    expect(subjects.status).toBe(200);
    expect(subjects.headers['cache-control']).toBe('public, max-age=3600');
    expect(subjects.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'math', nameVi: 'Toán' })]),
    );
    expect((await api(null).get('/catalog/grade-levels')).body.items.length).toBeGreaterThan(10);
    expect((await api(null).get('/catalog/provinces')).body.items).toEqual([
      expect.objectContaining({ id: ids.hanoi, fullName: 'Thành phố Hà Nội' }),
    ]);
    const communes = await api(null).get(`/catalog/provinces/${ids.hanoi}/communes`);
    expect(communes.body.items).toEqual([expect.objectContaining({ id: ids.baDinh })]);
    expect((await api(null).get(`/catalog/provinces/${ids.baDinh}/communes`)).status).toBe(404);
  });

  it('looks up provinces and communes by id, with the province of each commune', async () => {
    const found = await api(null).get(`/catalog/areas?ids=${ids.baDinh},${ids.hanoi},999999`);
    expect(found.status).toBe(200);
    // Id không tồn tại bị bỏ qua.
    expect(found.body.items).toEqual([
      expect.objectContaining({ id: ids.hanoi, level: 'province', parentId: null }),
      expect.objectContaining({ id: ids.baDinh, level: 'commune', parentId: ids.hanoi }),
    ]);

    const invalid = await api(null).get('/catalog/areas?ids=1,abc');
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.details[0]).toMatchObject({ path: 'ids.1' });
    const tooMany = Array.from({ length: 51 }, (_, i) => i + 1).join(',');
    expect((await api(null).get(`/catalog/areas?ids=${tooMany}`)).status).toBe(422);
    expect((await api(null).get('/catalog/areas')).status).toBe(422);
  });
});

// ---- Hồ sơ gia sư của chính mình --------------------------------------------------------------

describe('own tutor profile', () => {
  it('starts as an incomplete profile and lists what is missing for verification (D34)', async () => {
    const tutor = await createUser('tutor');
    const res = await api(tutor).get('/me/tutor-profile');
    expect(res.status).toBe(200);
    expect(OwnTutorProfile.parse(res.body)).toMatchObject({
      userId: tutor.id,
      profileStatus: 'incomplete',
      identityVerifiedAt: null,
      acceptingStudents: true,
      teachingSubjects: [],
      missingForVerification: ['teachingSubjects', 'teachingMode', 'rate'],
    });
  });

  it('saves the whole profile, then replaces it', async () => {
    const tutor = await createUser('tutor');
    const saved = await api(tutor).put('/me/tutor-profile', fullProfile());
    expect(saved.status).toBe(200);
    const profile = OwnTutorProfile.parse(saved.body);
    expect(profile).toMatchObject({
      headline: 'Gia sư Toán THCS, 5 năm kinh nghiệm',
      teachingMode: 'hybrid',
      rate: { amountVnd: 200_000, unit: 'session' },
      serviceAreaIds: [ids.baDinh],
      availability: [
        { weekday: 2, startTime: '18:00', endTime: '20:00' },
        { weekday: 4, startTime: '19:30', endTime: '21:00' },
      ],
      missingForVerification: [],
      profileStatus: 'incomplete', // sửa hồ sơ không đổi trạng thái (B.4.1)
    });
    expect(profile.teachingSubjects).toHaveLength(2);

    const replaced = await api(tutor).put('/me/tutor-profile', {
      teachingMode: 'online',
      teachingSubjects: [{ subjectId: ids.english, gradeLevelId: ids.grade9 }],
      acceptingStudents: false,
    });
    expect(OwnTutorProfile.parse(replaced.body)).toMatchObject({
      headline: null,
      teachingMode: 'online',
      rate: null,
      acceptingStudents: false,
      teachingSubjects: [{ subjectId: ids.english, gradeLevelId: ids.grade9 }],
      serviceAreaIds: [],
      availability: [],
      missingForVerification: ['rate'],
    });
  });

  it('rejects unknown catalog ids and areas for online-only teaching', async () => {
    const tutor = await createUser('tutor');
    const unknown = await api(tutor).put('/me/tutor-profile', {
      teachingSubjects: [{ subjectId: 99_999, gradeLevelId: ids.grade9 }],
      serviceAreaIds: [99_999],
    });
    expect(unknown.status).toBe(422);
    const details = ApiErrorBody.parse(unknown.body).error.details ?? [];
    expect(details.map((d) => d.path)).toEqual(['teachingSubjects', 'serviceAreaIds']);
    const online = await api(tutor).put('/me/tutor-profile', {
      teachingMode: 'online',
      serviceAreaIds: [ids.baDinh],
    });
    expect(online.status).toBe(422);
    expect(online.body.error.details[0]).toMatchObject({
      path: 'serviceAreaIds',
      code: 'service_areas_need_in_person',
    });
  });

  it('is only for tutors', async () => {
    const parent = await createUser('parent');
    expect((await api(parent).get('/me/tutor-profile')).status).toBe(403);
    expect((await api(null).get('/me/tutor-profile')).status).toBe(401);
  });
});

describe('tutor credentials', () => {
  it('adds, edits and deletes self-declared credentials', async () => {
    const tutor = await createUser('tutor');
    const created = await api(tutor).post('/me/tutor-profile/credentials', {
      kind: 'certificate',
      title: 'IELTS 8.0',
      issuer: 'British Council',
      issuedYear: 2022,
    });
    expect(created.status).toBe(201);
    const credential = TutorCredential.parse(created.body);
    expect(credential.verificationStatus).toBe('self_declared');

    const edited = await api(tutor).patch(`/me/tutor-profile/credentials/${credential.id}`, {
      title: 'IELTS 8.5',
      issuer: null,
    });
    expect(edited.body).toMatchObject({ title: 'IELTS 8.5', issuer: null, issuedYear: 2022 });

    expect((await api(tutor).delete(`/me/tutor-profile/credentials/${credential.id}`)).status).toBe(
      204,
    );
    expect(
      OwnTutorProfile.parse((await api(tutor).get('/me/tutor-profile')).body).credentials,
    ).toEqual([]);
  });

  it('locks credentials under review or verified, and resets a rejected one to self-declared', async () => {
    const tutor = await createUser('tutor');
    const add = async (title: string) =>
      TutorCredential.parse(
        (await api(tutor).post('/me/tutor-profile/credentials', { kind: 'degree', title })).body,
      );
    const verified = await add('Cử nhân Sư phạm Toán');
    const rejected = await add('Thạc sĩ Toán');
    await db.query(
      `UPDATE tutor_credentials SET verification_status = 'verified', verified_at = now() WHERE id = $1`,
      [verified.id],
    );
    await db.query(`UPDATE tutor_credentials SET verification_status = 'rejected' WHERE id = $1`, [
      rejected.id,
    ]);

    const path = (id: string) => `/me/tutor-profile/credentials/${id}`;
    expect((await api(tutor).patch(path(verified.id), { title: 'Khác' })).status).toBe(409);
    expect((await api(tutor).delete(path(verified.id))).status).toBe(409);
    const fixed = await api(tutor).patch(path(rejected.id), { issuedYear: 2020 });
    expect(fixed.body).toMatchObject({ verificationStatus: 'self_declared', issuedYear: 2020 });
  });

  it('a tutor cannot edit or delete the credential of another tutor', async () => {
    const owner = await createUser('tutor');
    const other = await createUser('tutor');
    const credential = TutorCredential.parse(
      (await api(owner).post('/me/tutor-profile/credentials', { kind: 'degree', title: 'Cử nhân' }))
        .body,
    );
    const path = `/me/tutor-profile/credentials/${credential.id}`;
    expect((await api(other).patch(path, { title: 'Bị sửa' })).status).toBe(404);
    expect((await api(other).delete(path)).status).toBe(404);
    const [row] = await db.query<{ title: string }[]>(
      `SELECT title FROM tutor_credentials WHERE id = $1`,
      [credential.id],
    );
    expect(row!.title).toBe('Cử nhân');
  });
});

// ---- Hồ sơ công khai: không lộ email hay số điện thoại -------------------------------------------

describe('public tutor profile', () => {
  it('shows a verified tutor to guests without email, phone or real full name (D16)', async () => {
    const tutor = await verifiedTutor('Lê Hoàng Nam');
    await db.query(`UPDATE users SET display_name = 'Thầy Nam' WHERE id = $1`, [tutor.id]);
    await api(tutor).post('/me/tutor-profile/credentials', {
      kind: 'degree',
      title: 'Cử nhân Sư phạm Toán',
    });
    const rejected = TutorCredential.parse(
      (
        await api(tutor).post('/me/tutor-profile/credentials', {
          kind: 'certificate',
          title: 'Giả',
        })
      ).body,
    );
    await db.query(`UPDATE tutor_credentials SET verification_status = 'rejected' WHERE id = $1`, [
      rejected.id,
    ]);

    const res = await api(null).get(`/tutors/${tutor.id}`);
    expect(res.status).toBe(200);
    const profile = PublicTutorProfile.parse(res.body);
    expect(profile).toMatchObject({
      id: tutor.id,
      displayName: 'Thầy Nam',
      identityVerified: true,
      teachingMode: 'hybrid',
      rate: { amountVnd: 200_000, unit: 'session' },
      credentials: [
        {
          kind: 'degree',
          title: 'Cử nhân Sư phạm Toán',
          issuer: null,
          issuedYear: null,
          verified: false,
        },
      ],
    });

    // Không có trường liên hệ hay định danh nào, ở bất kỳ đâu trong body.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(tutor.email);
    expect(body).not.toContain(tutor.phone);
    expect(body).not.toContain('Lê Hoàng Nam');
    for (const key of ['email', 'phone', 'fullName', 'userId', 'identityVerifiedAt']) {
      expect(res.body).not.toHaveProperty(key);
    }
  });

  it('hides tutors that are not verified, are restricted, locked or deleted (404)', async () => {
    const unverified = await createUser('tutor');
    await api(unverified).put('/me/tutor-profile', fullProfile());
    expect((await api(null).get(`/tutors/${unverified.id}`)).status).toBe(404);

    for (const change of [`status = 'restricted'`, `status = 'locked'`, `deleted_at = now()`]) {
      const tutor = await verifiedTutor();
      expect((await api(null).get(`/tutors/${tutor.id}`)).status).toBe(200);
      await db.query(`UPDATE users SET ${change} WHERE id = $1`, [tutor.id]);
      const res = await api(null).get(`/tutors/${tutor.id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }
    expect((await api(null).get(`/tutors/${randomUUID()}`)).status).toBe(404);
  });
});

// ---- Thông tin cá nhân và ảnh đại diện ---------------------------------------------------------

describe('account', () => {
  it('returns and updates the own personal info; a new phone is self-declared (C12)', async () => {
    const parent = await createUser('parent', 'Nguyễn Thị Mai');
    const me = AccountProfile.parse((await api(parent).get('/me')).body);
    expect(me).toMatchObject({
      email: parent.email,
      fullName: 'Nguyễn Thị Mai',
      fullNameLocked: false,
      phone: parent.phone,
      phoneVerified: false,
      avatarUrl: null,
      roles: ['parent'],
    });

    const updated = await api(parent).patch('/me', {
      displayName: 'Mẹ Bin',
      fullName: 'Nguyễn Thị Mai Anh',
      phone: '0987 654 321',
      locale: 'en',
    });
    expect(updated.status).toBe(200);
    expect(AccountProfile.parse(updated.body)).toMatchObject({
      displayName: 'Mẹ Bin',
      fullName: 'Nguyễn Thị Mai Anh',
      phone: '0987654321',
      locale: 'en',
    });
    const cleared = await api(parent).patch('/me', { phone: '' });
    expect(cleared.body.phone).toBeNull();
    expect((await api(null).get('/me')).status).toBe(401);
  });

  it('locks the real full name of a verified tutor (D34)', async () => {
    const tutor = await verifiedTutor('Lê Hoàng Nam');
    expect(AccountProfile.parse((await api(tutor).get('/me')).body).fullNameLocked).toBe(true);
    const res = await api(tutor).patch('/me', { fullName: 'Tên Khác' });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0]).toMatchObject({ path: 'fullName', code: 'full_name_locked' });
    // Gửi lại đúng tên cũ, hoặc đổi trường khác: được.
    expect((await api(tutor).patch('/me', { fullName: 'Lê Hoàng Nam' })).status).toBe(200);
    expect((await api(tutor).patch('/me', { displayName: 'Thầy Nam' })).status).toBe(200);
  });
});

describe('avatar', () => {
  it('sets an uploaded avatar, shows it on the public profile, and replaces the old file', async () => {
    const tutor = await verifiedTutor();
    const first = await uploadAvatar(tutor);
    expect(first.bucket).toBe('public');
    const set = await api(tutor).put('/me/avatar', { fileId: first.fileId });
    expect(set.status).toBe(200);
    expect(set.body.avatarUrl).toBe(`${CDN}/${first.storageKey}`);
    expect((await api(null).get(`/tutors/${tutor.id}`)).body.avatarUrl).toBe(
      `${CDN}/${first.storageKey}`,
    );

    const second = await uploadAvatar(tutor);
    await api(tutor).put('/me/avatar', { fileId: second.fileId });
    const [old] = await db.query<{ status: string; deleted: boolean }[]>(
      `SELECT status, deleted_at IS NOT NULL AS deleted FROM files WHERE id = $1`,
      [first.fileId],
    );
    expect(old).toEqual({ status: 'deleted', deleted: true });
    expect(deletedKeys).toContain(first.storageKey);

    expect((await api(tutor).delete('/me/avatar')).status).toBe(204);
    expect((await api(tutor).get('/me')).body.avatarUrl).toBeNull();
    expect(deletedKeys).toContain(second.storageKey);
  });

  it('refuses a file that is not uploaded, belongs to someone else, or has another purpose', async () => {
    const user = await createUser('parent');
    const other = await createUser('parent');

    const notUploaded = await uploadAvatar(user, { upload: false });
    const res = await api(user).put('/me/avatar', { fileId: notUploaded.fileId });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0]).toMatchObject({ code: 'file_not_uploaded' });

    const othersFile = await uploadAvatar(other);
    expect((await api(user).put('/me/avatar', { fileId: othersFile.fileId })).status).toBe(422);

    // Tệp lên kho khác dung lượng đã khai: không nhận.
    const wrongSize = await uploadAvatar(user, { upload: false });
    uploaded.set(wrongSize.storageKey, { sizeBytes: 9999, contentType: 'image/png' });
    expect((await api(user).put('/me/avatar', { fileId: wrongSize.fileId })).status).toBe(422);

    const document = await api(user).post('/files/uploads', {
      purpose: 'verification_document',
      fileName: 'cccd.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1000,
    });
    expect(document.status).toBe(422);
    expect(document.body.error.details[0]).toMatchObject({ code: 'file_purpose_not_allowed' });

    const tooBig = await api(user).post('/files/uploads', {
      purpose: 'avatar',
      fileName: 'big.png',
      contentType: 'image/png',
      sizeBytes: 6 * 1024 * 1024,
    });
    expect(tooBig.status).toBe(422);
  });
});
