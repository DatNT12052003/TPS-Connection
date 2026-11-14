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
  DocumentViewUrl,
  FILE_RULES,
  OwnIdentityVerification,
  OwnTutorProfile,
  PublicTutorProfile,
  type Role,
  TutorCredential,
  UploadTicketResponse,
  VerificationQueue,
  VerificationRequestDetail,
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
import { createVerificationService } from '../../src/modules/verification/verification.service.js';
import { createVerificationReviewService } from '../../src/modules/verification/verification-review.service.js';
import { createFilesMaintenanceService } from '../../src/modules/files/files-maintenance.service.js';
import type { EmailMessage } from '../../src/lib/email/email-sender.js';
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
/** Email kết quả xác minh được "gửi" (xếp hàng). */
const sentEmails: EmailMessage[] = [];
const fakeStorage: Pick<
  Storage,
  'createUploadTicket' | 'headObject' | 'deleteObject' | 'publicUrl' | 'createDownloadUrl'
> = {
  async createDownloadUrl(bucket, storageKey, options) {
    return `http://storage.test/${bucket}/${storageKey}?expires=${options?.expiresInSeconds}`;
  },
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
  const files = createFilesService({ storage: fakeStorage, logger: silentLogger });
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
    tutors: createTutorsService({ dataSource: db, files, logger: silentLogger, publicFileUrl }),
    verification: createVerificationService({ dataSource: db, files, logger: silentLogger }),
    verificationReview: createVerificationReviewService({
      dataSource: db,
      storage: fakeStorage,
      sendEmail: async (message) => {
        sentEmails.push(message);
      },
      webUrl: 'http://web.test',
      logger: silentLogger,
    }),
    account: createAccountService({ dataSource: db, files, publicFileUrl, logger: silentLogger }),
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
  /** IP riêng (X-Forwarded-For): giới hạn tải tệp theo IP không dồn mọi người dùng trong test vào một. */
  ip: string;
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
  return {
    id,
    email,
    phone,
    auth: `Bearer ${token}`,
    ip: `10.0.${Math.floor(counter / 250)}.${(counter % 250) + 1}`,
  };
}

const api = (user: TestUser | null) => {
  const prepare = (req: request.Test) => {
    req.set('Origin', TEST_ORIGIN);
    return user ? req.set('Authorization', user.auth).set('X-Forwarded-For', user.ip) : req;
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

// ---- Xác minh (G3 đợt 1) ------------------------------------------------------------------------

/** Cấp URL tải giấy tờ (bucket private) và giả lập trình duyệt đã PUT tệp lên kho. */
async function uploadDocument(
  user: TestUser,
  purpose: 'verification_document' | 'credential' = 'verification_document',
  options: { upload?: boolean } = {},
) {
  const res = await api(user).post('/files/uploads', {
    purpose,
    fileName: 'giay-to.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 4096,
  });
  expect(res.status).toBe(201);
  const ticket = UploadTicketResponse.parse(res.body);
  expect(ticket.bucket).toBe('private');
  if (options.upload ?? true) {
    uploaded.set(ticket.storageKey, { sizeBytes: 4096, contentType: 'image/jpeg' });
  }
  return ticket;
}

/** Gia sư đã điền đủ hồ sơ (chưa nộp xác minh). `occupation` quyết định có cần thẻ sinh viên. */
async function readyTutor(occupation = 'teacher'): Promise<TestUser> {
  const tutor = await createUser('tutor');
  const res = await api(tutor).put('/me/tutor-profile', { ...fullProfile(), occupation });
  expect(res.status).toBe(200);
  return tutor;
}

async function idDocuments(tutor: TestUser) {
  const front = await uploadDocument(tutor);
  const back = await uploadDocument(tutor);
  return [
    { type: 'national_id_front', fileId: front.fileId },
    { type: 'national_id_back', fileId: back.fileId },
  ];
}

const profileStatusOf = async (tutor: TestUser) =>
  OwnTutorProfile.parse((await api(tutor).get('/me/tutor-profile')).body).profileStatus;

describe('identity verification', () => {
  it('submits the ID card, moves the profile to pending and records the consent', async () => {
    const tutor = await readyTutor();
    const before = OwnIdentityVerification.parse(
      (await api(tutor).get('/me/tutor-profile/verification')).body,
    );
    expect(before).toEqual({
      latest: null,
      requiredDocuments: ['national_id_front', 'national_id_back'],
      canSubmit: true,
    });

    const documents = await idDocuments(tutor);
    const res = await api(tutor).post('/me/tutor-profile/verification', {
      documents,
      acceptDocumentProcessing: true,
    });
    expect(res.status).toBe(201);
    const body = OwnIdentityVerification.parse(res.body);
    expect(body.canSubmit).toBe(false);
    expect(body.latest).toMatchObject({ kind: 'identity', status: 'pending', reviewedAt: null });
    expect(body.latest!.documents.map((d) => d.type)).toEqual([
      'national_id_front',
      'national_id_back',
    ]);
    expect(new Date(body.latest!.reviewDueAt).getTime()).toBeGreaterThan(Date.now());
    // Gia sư không nhận lại đường dẫn hay khóa lưu trữ của ảnh giấy tờ.
    expect(JSON.stringify(res.body)).not.toContain('verification_document/');
    expect(JSON.stringify(res.body)).not.toContain('http');

    expect(await profileStatusOf(tutor)).toBe('pending_verification');
    const consents = await db.query<{ version: string }[]>(
      `SELECT version FROM user_consents
        WHERE user_id = $1 AND consent_type = 'verification_document_processing'`,
      [tutor.id],
    );
    expect(consents).toHaveLength(1);
    const fileStatuses = await db.query<{ status: string }[]>(
      `SELECT f.status FROM verification_documents d JOIN files f ON f.id = d.file_id
        WHERE d.request_id = $1`,
      [body.latest!.id],
    );
    expect(fileStatuses.map((f) => f.status)).toEqual(['ready', 'ready']);

    // Nộp lần nữa khi đang chờ: không được.
    const again = await api(tutor).post('/me/tutor-profile/verification', {
      documents: await idDocuments(tutor),
      acceptDocumentProcessing: true,
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('invalid_state_transition');
  });

  it('locks the full name and the occupation while the request is pending', async () => {
    const tutor = await readyTutor();
    await api(tutor).post('/me/tutor-profile/verification', {
      documents: await idDocuments(tutor),
      acceptDocumentProcessing: true,
    });

    const me = AccountProfile.parse((await api(tutor).get('/me')).body);
    expect(me.fullNameLocked).toBe(true);
    const rename = await api(tutor).patch('/me', { fullName: 'Tên Khác' });
    expect(rename.status).toBe(422);
    expect(rename.body.error.details[0]).toMatchObject({
      path: 'fullName',
      code: 'locked_while_verifying',
    });

    const occupation = await api(tutor).put('/me/tutor-profile', {
      ...fullProfile(),
      occupation: 'university_student',
    });
    expect(occupation.status).toBe(422);
    expect(occupation.body.error.details[0]).toMatchObject({
      path: 'occupation',
      code: 'locked_while_verifying',
    });
    // Sửa trường khác vẫn được, trạng thái không đổi.
    const edit = await api(tutor).put('/me/tutor-profile', { ...fullProfile(), bio: 'Bio mới' });
    expect(edit.status).toBe(200);
    expect(await profileStatusOf(tutor)).toBe('pending_verification');
  });

  it('requires the required fields, the right documents and the consent', async () => {
    const incomplete = await createUser('tutor');
    const notReady = await api(incomplete).post('/me/tutor-profile/verification', {
      documents: await idDocuments(incomplete),
      acceptDocumentProcessing: true,
    });
    expect(notReady.status).toBe(409);

    const tutor = await readyTutor();
    const [front, back] = await idDocuments(tutor);
    const missingBack = await api(tutor).post('/me/tutor-profile/verification', {
      documents: [front],
      acceptDocumentProcessing: true,
    });
    expect(missingBack.status).toBe(422);
    expect(missingBack.body.error.details[0]).toMatchObject({ code: 'documents_incomplete' });

    const card = await uploadDocument(tutor);
    const notStudent = await api(tutor).post('/me/tutor-profile/verification', {
      documents: [front, back, { type: 'student_card', fileId: card.fileId }],
      acceptDocumentProcessing: true,
    });
    expect(notStudent.status).toBe(422);
    expect(notStudent.body.error.details[0]).toMatchObject({
      path: 'documents.2.type',
      code: 'document_type_not_allowed',
    });

    const noConsent = await api(tutor).post('/me/tutor-profile/verification', {
      documents: [front, back],
      acceptDocumentProcessing: false,
    });
    expect(noConsent.status).toBe(422);
    expect(noConsent.body.error.details[0]).toMatchObject({
      code: 'must_accept_document_processing',
    });

    const sameFile = await api(tutor).post('/me/tutor-profile/verification', {
      documents: [front, { type: 'national_id_back', fileId: front!.fileId }],
      acceptDocumentProcessing: true,
    });
    expect(sameFile.status).toBe(422);
    expect(sameFile.body.error.details[0]).toMatchObject({ code: 'duplicate_document' });

    expect(await profileStatusOf(tutor)).toBe('incomplete');
  });

  it('asks a university student for the student card as well', async () => {
    const student = await readyTutor('university_student');
    const status = OwnIdentityVerification.parse(
      (await api(student).get('/me/tutor-profile/verification')).body,
    );
    expect(status.requiredDocuments).toEqual([
      'national_id_front',
      'national_id_back',
      'student_card',
    ]);
    const documents = await idDocuments(student);
    const withoutCard = await api(student).post('/me/tutor-profile/verification', {
      documents,
      acceptDocumentProcessing: true,
    });
    expect(withoutCard.status).toBe(422);

    const card = await uploadDocument(student);
    const res = await api(student).post('/me/tutor-profile/verification', {
      documents: [...documents, { type: 'student_card', fileId: card.fileId }],
      acceptDocumentProcessing: true,
    });
    expect(res.status).toBe(201);
  });

  it('refuses files that are not uploaded, belong to someone else or have another purpose', async () => {
    const tutor = await readyTutor();
    const other = await readyTutor();
    const [front] = await idDocuments(tutor);
    const notUploaded = await uploadDocument(tutor, 'verification_document', { upload: false });
    const othersFile = await uploadDocument(other);
    const avatar = await uploadAvatar(tutor);

    for (const fileId of [notUploaded.fileId, othersFile.fileId, avatar.fileId]) {
      const res = await api(tutor).post('/me/tutor-profile/verification', {
        documents: [front, { type: 'national_id_back', fileId }],
        acceptDocumentProcessing: true,
      });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0]).toMatchObject({
        path: 'documents.1.fileId',
        code: 'file_not_uploaded',
      });
    }
    expect(await profileStatusOf(tutor)).toBe('incomplete');
  });

  it('cancels a pending request, deletes the images and allows a new submission', async () => {
    const tutor = await readyTutor();
    const documents = await idDocuments(tutor);
    const submitted = OwnIdentityVerification.parse(
      (
        await api(tutor).post('/me/tutor-profile/verification', {
          documents,
          acceptDocumentProcessing: true,
        })
      ).body,
    );
    const keys = await db.query<{ storage_key: string }[]>(
      `SELECT f.storage_key FROM verification_documents d JOIN files f ON f.id = d.file_id
        WHERE d.request_id = $1`,
      [submitted.latest!.id],
    );

    expect((await api(tutor).delete('/me/tutor-profile/verification')).status).toBe(204);
    expect(await profileStatusOf(tutor)).toBe('incomplete');
    for (const { storage_key } of keys) expect(deletedKeys).toContain(storage_key);
    const after = OwnIdentityVerification.parse(
      (await api(tutor).get('/me/tutor-profile/verification')).body,
    );
    expect(after.latest).toMatchObject({ status: 'cancelled' });
    expect(after.canSubmit).toBe(true);
    expect((await api(tutor).delete('/me/tutor-profile/verification')).status).toBe(404);

    // Ảnh của yêu cầu đã hủy không dùng lại được; tải ảnh mới thì nộp được.
    const reuse = await api(tutor).post('/me/tutor-profile/verification', {
      documents,
      acceptDocumentProcessing: true,
    });
    expect(reuse.status).toBe(422);
    const fresh = await api(tutor).post('/me/tutor-profile/verification', {
      documents: await idDocuments(tutor),
      acceptDocumentProcessing: true,
    });
    expect(fresh.status).toBe(201);
  });

  it('is only for tutors', async () => {
    const parent = await createUser('parent');
    expect((await api(parent).get('/me/tutor-profile/verification')).status).toBe(403);
    expect((await api(null).get('/me/tutor-profile/verification')).status).toBe(401);
    const upload = await api(parent).post('/files/uploads', {
      purpose: 'credential',
      fileName: 'bang.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1000,
    });
    expect(upload.status).toBe(422);
    expect(upload.body.error.details[0]).toMatchObject({ code: 'file_purpose_not_allowed' });
  });
});

describe('credential verification', () => {
  async function tutorWithCredential() {
    const tutor = await readyTutor();
    const res = await api(tutor).post('/me/tutor-profile/credentials', {
      kind: 'degree',
      title: 'Cử nhân Sư phạm Toán',
      issuer: 'ĐHSP Hà Nội',
      issuedYear: 2018,
    });
    expect(res.status).toBe(201);
    return { tutor, credential: TutorCredential.parse(res.body) };
  }

  it('submits a credential, locks it, and cancels back to self-declared', async () => {
    const { tutor, credential } = await tutorWithCredential();
    const page1 = await uploadDocument(tutor, 'credential');
    const page2 = await uploadDocument(tutor, 'credential');
    const path = `/me/tutor-profile/credentials/${credential.id}/verification`;

    const res = await api(tutor).post(path, { fileIds: [page1.fileId, page2.fileId] });
    expect(res.status).toBe(201);
    expect(TutorCredential.parse(res.body)).toMatchObject({
      verificationStatus: 'pending',
      rejectionCode: null,
    });
    const docTypes = await db.query<{ document_type: string }[]>(
      `SELECT d.document_type FROM verification_documents d
         JOIN verification_requests r ON r.id = d.request_id WHERE r.credential_id = $1`,
      [credential.id],
    );
    expect(docTypes.map((d) => d.document_type)).toEqual(['degree', 'degree']);

    expect(
      (await api(tutor).patch(`/me/tutor-profile/credentials/${credential.id}`, { title: 'X' }))
        .status,
    ).toBe(409);
    const again = await api(tutor).post(path, {
      fileIds: [(await uploadDocument(tutor, 'credential')).fileId],
    });
    expect(again.status).toBe(409);
    // Xác minh bằng cấp không đổi trạng thái hồ sơ.
    expect(await profileStatusOf(tutor)).toBe('incomplete');

    expect((await api(tutor).delete(path)).status).toBe(204);
    expect(deletedKeys).toEqual(expect.arrayContaining([page1.storageKey, page2.storageKey]));
    const profile = OwnTutorProfile.parse((await api(tutor).get('/me/tutor-profile')).body);
    expect(profile.credentials[0]).toMatchObject({ verificationStatus: 'self_declared' });
    expect((await api(tutor).delete(path)).status).toBe(404);
  });

  it('refuses the credential of another tutor and files with another purpose', async () => {
    const { tutor, credential } = await tutorWithCredential();
    const other = await readyTutor();
    const path = `/me/tutor-profile/credentials/${credential.id}/verification`;
    const othersFile = await uploadDocument(other, 'credential');
    expect((await api(other).post(path, { fileIds: [othersFile.fileId] })).status).toBe(404);

    const identityFile = await uploadDocument(tutor);
    const wrongPurpose = await api(tutor).post(path, { fileIds: [identityFile.fileId] });
    expect(wrongPurpose.status).toBe(422);
    expect(wrongPurpose.body.error.details[0]).toMatchObject({
      path: 'fileIds.0',
      code: 'file_not_uploaded',
    });
  });

  it('shows the rejection reason and deletes the history with the credential', async () => {
    const { tutor, credential } = await tutorWithCredential();
    const file = await uploadDocument(tutor, 'credential');
    const path = `/me/tutor-profile/credentials/${credential.id}/verification`;
    expect((await api(tutor).post(path, { fileIds: [file.fileId] })).status).toBe(201);

    // Manager từ chối (đợt 2 làm qua API; ở đây ghi thẳng vào database).
    const manager = await createUser('manager');
    await db.query(
      `UPDATE verification_requests
          SET status = 'rejected', reviewed_at = now(), reviewed_by = $2,
              rejection_code = 'other', rejection_note = 'Thiếu trang 2'
        WHERE credential_id = $1`,
      [credential.id, manager.id],
    );
    await db.query(`UPDATE tutor_credentials SET verification_status = 'rejected' WHERE id = $1`, [
      credential.id,
    ]);
    const profile = OwnTutorProfile.parse((await api(tutor).get('/me/tutor-profile')).body);
    expect(profile.credentials[0]).toMatchObject({
      verificationStatus: 'rejected',
      rejectionCode: 'other',
      rejectionNote: 'Thiếu trang 2',
    });

    const removed = await api(tutor).delete(`/me/tutor-profile/credentials/${credential.id}`);
    expect(removed.status).toBe(204);
    expect(deletedKeys).toContain(file.storageKey);
    const left = await db.query(`SELECT 1 FROM verification_requests WHERE credential_id = $1`, [
      credential.id,
    ]);
    expect(left).toHaveLength(0);
  });
});

// ---- Duyệt xác minh, phía Manager (G3 đợt 2) ------------------------------------------------------

const ADMIN_API = '/admin/verification-requests';

/** Gia sư đã nộp xác minh danh tính; trả gia sư và id yêu cầu. */
async function submittedTutor(occupation = 'teacher') {
  const tutor = await readyTutor(occupation);
  const res = await api(tutor).post('/me/tutor-profile/verification', {
    documents: await idDocuments(tutor),
    acceptDocumentProcessing: true,
  });
  expect(res.status).toBe(201);
  return { tutor, requestId: OwnIdentityVerification.parse(res.body).latest!.id };
}

const auditRows = (entityId: string) =>
  db.query<
    {
      action: string;
      actor_user_id: string | null;
      actor_role: string;
      ip_address: string | null;
    }[]
  >(
    `SELECT action, actor_user_id, actor_role, host(ip_address) AS ip_address FROM audit_logs
      WHERE entity_type = 'verification_request' AND entity_id = $1 ORDER BY id`,
    [entityId],
  );

describe('verification review (manager)', () => {
  it('lists the queue, shows the request without image links and logs each document view', async () => {
    const manager = await createUser('manager');
    const { tutor, requestId } = await submittedTutor();

    const queue = VerificationQueue.parse(
      (await api(manager).get(`${ADMIN_API}?kind=identity`)).body,
    );
    const item = queue.items.find((i) => i.id === requestId);
    expect(item).toMatchObject({ kind: 'identity', tutorId: tutor.id, attempt: 1 });
    expect(item!.tutorName).toBe('Lê Hoàng Nam');
    expect(queue.counts.identity).toBeGreaterThanOrEqual(1);
    // Sắp theo hạn duyệt.
    const dues = queue.items.map((i) => i.reviewDueAt);
    expect([...dues].sort()).toEqual(dues);

    const detailRes = await api(manager).get(`${ADMIN_API}/${requestId}`);
    expect(detailRes.status).toBe(200);
    const detail = VerificationRequestDetail.parse(detailRes.body);
    expect(detail.documents.map((d) => d.type)).toEqual(['national_id_front', 'national_id_back']);
    expect(detail.isOwnRequest).toBe(false);
    expect(JSON.stringify(detailRes.body)).not.toContain('http');
    // Xem màn duyệt không phải xem ảnh: chưa có dòng nhật ký.
    expect(await auditRows(requestId)).toEqual([]);

    const view = await api(manager).post(
      `${ADMIN_API}/${requestId}/documents/${detail.documents[0]!.id}/view`,
    );
    expect(view.status).toBe(200);
    expect(view.headers['cache-control']).toBe('no-store');
    expect(DocumentViewUrl.parse(view.body).url).toContain('expires=120');
    expect(await auditRows(requestId)).toEqual([
      {
        action: 'verification.document_viewed',
        actor_user_id: manager.id,
        actor_role: 'manager',
        ip_address: manager.ip,
      },
    ]);

    // Giấy tờ của yêu cầu khác: không xem được qua yêu cầu này.
    const other = await submittedTutor();
    const otherDetail = VerificationRequestDetail.parse(
      (await api(manager).get(`${ADMIN_API}/${other.requestId}`)).body,
    );
    const mixed = await api(manager).post(
      `${ADMIN_API}/${requestId}/documents/${otherDetail.documents[0]!.id}/view`,
    );
    expect(mixed.status).toBe(404);
  });

  it('approves an identity: profile verified and public, images scheduled for deletion, email sent', async () => {
    const manager = await createUser('manager');
    const { tutor, requestId } = await submittedTutor();
    const detail = VerificationRequestDetail.parse(
      (await api(manager).get(`${ADMIN_API}/${requestId}`)).body,
    );

    const res = await api(manager).post(`${ADMIN_API}/${requestId}/approve`);
    expect(res.status).toBe(200);
    expect(VerificationRequestDetail.parse(res.body)).toMatchObject({ status: 'approved' });

    const profile = OwnTutorProfile.parse((await api(tutor).get('/me/tutor-profile')).body);
    expect(profile.profileStatus).toBe('verified');
    expect(profile.identityVerifiedAt).not.toBeNull();
    expect((await api(null).get(`/tutors/${tutor.id}`)).status).toBe(200);

    const [row] = await db.query<{ days: number; files_scheduled: number }[]>(
      `SELECT round(extract(epoch FROM documents_purge_at - reviewed_at) / 86400)::int AS days,
              (SELECT count(*)::int FROM verification_documents d JOIN files f ON f.id = d.file_id
                WHERE d.request_id = r.id AND f.purge_after = r.documents_purge_at) AS files_scheduled
         FROM verification_requests r WHERE id = $1`,
      [requestId],
    );
    expect(row).toEqual({ days: 30, files_scheduled: 2 });

    const email = sentEmails.find((m) => m.to === tutor.email);
    expect(email?.subject).toBe('Danh tính của bạn đã được xác minh');
    expect(email?.text).toContain('http://web.test/app/profile');
    expect((await auditRows(requestId)).map((r) => r.action)).toEqual(['verification.approved']);

    // Đã quyết định: không duyệt lại, không xem ảnh nữa.
    expect((await api(manager).post(`${ADMIN_API}/${requestId}/approve`)).status).toBe(409);
    const view = await api(manager).post(
      `${ADMIN_API}/${requestId}/documents/${detail.documents[0]!.id}/view`,
    );
    expect(view.status).toBe(409);
  });

  it('rejects with a reason: the tutor sees it, resubmits, and the history keeps both', async () => {
    const manager = await createUser('manager');
    const { tutor, requestId } = await submittedTutor();

    const noNote = await api(manager).post(`${ADMIN_API}/${requestId}/reject`, {
      rejectionCode: 'other',
    });
    expect(noNote.status).toBe(422);
    expect(noNote.body.error.details[0]).toMatchObject({ path: 'rejectionNote', code: 'required' });

    const res = await api(manager).post(`${ADMIN_API}/${requestId}/reject`, {
      rejectionCode: 'unclear_image',
      rejectionNote: 'Ảnh mặt sau bị lóa.',
    });
    expect(res.status).toBe(200);

    const own = OwnIdentityVerification.parse(
      (await api(tutor).get('/me/tutor-profile/verification')).body,
    );
    expect(own.latest).toMatchObject({
      status: 'rejected',
      rejectionCode: 'unclear_image',
      rejectionNote: 'Ảnh mặt sau bị lóa.',
    });
    expect(own.canSubmit).toBe(true);
    expect(await profileStatusOf(tutor)).toBe('incomplete');
    const email = sentEmails.find((m) => m.to === tutor.email);
    expect(email?.subject).toBe('Giấy tờ xác minh danh tính chưa được duyệt');
    expect(email?.text).toContain('Lý do: Ảnh mờ, bị lóa hoặc thiếu góc');
    expect(email?.text).toContain('Ảnh mặt sau bị lóa.');

    const again = await api(tutor).post('/me/tutor-profile/verification', {
      documents: await idDocuments(tutor),
      acceptDocumentProcessing: true,
    });
    const secondId = OwnIdentityVerification.parse(again.body).latest!.id;
    const second = VerificationRequestDetail.parse(
      (await api(manager).get(`${ADMIN_API}/${secondId}`)).body,
    );
    expect(second.attempt).toBe(2);
    expect(second.history).toEqual([
      expect.objectContaining({
        id: requestId,
        status: 'rejected',
        rejectionCode: 'unclear_image',
      }),
    ]);
  });

  it('approves a degree: the credential is verified and the profile gets the badge', async () => {
    const manager = await createUser('manager');
    const tutor = await readyTutor();
    const added = await api(tutor).post('/me/tutor-profile/credentials', {
      kind: 'degree',
      title: 'Cử nhân Sư phạm Toán',
    });
    const credential = TutorCredential.parse(added.body);
    const file = await uploadDocument(tutor, 'credential');
    await api(tutor).post(`/me/tutor-profile/credentials/${credential.id}/verification`, {
      fileIds: [file.fileId],
    });
    const queue = VerificationQueue.parse(
      (await api(manager).get(`${ADMIN_API}?kind=credential`)).body,
    );
    const item = queue.items.find((i) => i.tutorId === tutor.id);
    expect(item).toMatchObject({
      credentialTitle: 'Cử nhân Sư phạm Toán',
      credentialKind: 'degree',
    });

    expect((await api(manager).post(`${ADMIN_API}/${item!.id}/approve`)).status).toBe(200);
    const profile = OwnTutorProfile.parse((await api(tutor).get('/me/tutor-profile')).body);
    expect(profile.hasVerifiedDegree).toBe(true);
    expect(profile.credentials[0]).toMatchObject({ verificationStatus: 'verified' });
    // Bằng cấp không đổi trạng thái hồ sơ.
    expect(profile.profileStatus).toBe('incomplete');
  });

  it('is only for managers, and a manager cannot review their own request', async () => {
    const { requestId } = await submittedTutor();
    const admin = await createUser('admin');
    const tutor = await createUser('tutor');
    for (const user of [admin, tutor]) {
      expect((await api(user).get(ADMIN_API)).status).toBe(403);
      expect((await api(user).post(`${ADMIN_API}/${requestId}/approve`)).status).toBe(403);
    }
    expect((await api(null).get(ADMIN_API)).status).toBe(401);

    // Manager kiêm gia sư.
    const { tutor: managerTutor, requestId: ownId } = await submittedTutor();
    await db.query(`INSERT INTO user_roles (user_id, role_code) VALUES ($1, 'manager')`, [
      managerTutor.id,
    ]);
    const own = VerificationRequestDetail.parse(
      (await api(managerTutor).get(`${ADMIN_API}/${ownId}`)).body,
    );
    expect(own.isOwnRequest).toBe(true);
    expect((await api(managerTutor).post(`${ADMIN_API}/${ownId}/approve`)).status).toBe(403);
    const view = await api(managerTutor).post(
      `${ADMIN_API}/${ownId}/documents/${own.documents[0]!.id}/view`,
    );
    expect(view.status).toBe(403);
    expect(await auditRows(ownId)).toEqual([]);
  });

  it('keeps the audit log append-only', async () => {
    const manager = await createUser('manager');
    const { requestId } = await submittedTutor();
    await api(manager).post(`${ADMIN_API}/${requestId}/approve`);
    await expect(
      db.query(`UPDATE audit_logs SET action = 'x.y' WHERE entity_id = $1`, [requestId]),
    ).rejects.toThrow('append-only');
    await expect(
      db.query(`DELETE FROM audit_logs WHERE entity_id = $1`, [requestId]),
    ).rejects.toThrow('append-only');
    await expect(db.query(`TRUNCATE audit_logs`)).rejects.toThrow('append-only');
  });
});

describe('file maintenance jobs', () => {
  const maintenance = () =>
    createFilesMaintenanceService({ dataSource: db, storage: fakeStorage, logger: silentLogger });

  it('deletes verification images once the retention period is over', async () => {
    const manager = await createUser('manager');
    const { requestId } = await submittedTutor();
    await api(manager).post(`${ADMIN_API}/${requestId}/approve`);
    const keys = await db.query<{ storage_key: string }[]>(
      `SELECT f.storage_key FROM verification_documents d JOIN files f ON f.id = d.file_id
        WHERE d.request_id = $1`,
      [requestId],
    );

    // Chưa tới hạn: không xóa.
    await maintenance().purgeVerificationDocuments();
    for (const { storage_key } of keys) expect(deletedKeys).not.toContain(storage_key);

    await db.query(
      `UPDATE verification_requests SET documents_purge_at = now() - interval '1 minute' WHERE id = $1`,
      [requestId],
    );
    expect(await maintenance().purgeVerificationDocuments()).toBeGreaterThanOrEqual(1);
    for (const { storage_key } of keys) expect(deletedKeys).toContain(storage_key);
    const [row] = await db.query<{ purged: boolean; live_files: number }[]>(
      `SELECT documents_purged_at IS NOT NULL AS purged,
              (SELECT count(*)::int FROM verification_documents d JOIN files f ON f.id = d.file_id
                WHERE d.request_id = r.id AND f.status <> 'deleted') AS live_files
         FROM verification_requests r WHERE id = $1`,
      [requestId],
    );
    expect(row).toEqual({ purged: true, live_files: 0 });
    expect((await auditRows(requestId)).map((r) => [r.action, r.actor_role])).toEqual([
      ['verification.approved', 'manager'],
      ['verification.documents_purged', 'system'],
    ]);
    // Kết quả xác minh vẫn giữ; màn duyệt không còn giấy tờ.
    const detail = VerificationRequestDetail.parse(
      (await api(manager).get(`${ADMIN_API}/${requestId}`)).body,
    );
    expect(detail).toMatchObject({ status: 'approved', documents: [] });
  });

  it('cleans uploads abandoned for more than 24 hours', async () => {
    const tutor = await readyTutor();
    const stale = await uploadDocument(tutor, 'verification_document', { upload: false });
    const fresh = await uploadDocument(tutor, 'verification_document', { upload: false });
    await db.query(`UPDATE files SET created_at = now() - interval '25 hours' WHERE id = $1`, [
      stale.fileId,
    ]);

    await maintenance().cleanupStaleUploads();
    const statuses = await db.query<{ id: string; status: string }[]>(
      `SELECT id, status FROM files WHERE id = ANY($1::uuid[])`,
      [[stale.fileId, fresh.fileId]],
    );
    expect(Object.fromEntries(statuses.map((s) => [s.id, s.status]))).toEqual({
      [stale.fileId]: 'deleted',
      [fresh.fileId]: 'pending_upload',
    });
    expect(deletedKeys).toContain(stale.storageKey);
  });
});
