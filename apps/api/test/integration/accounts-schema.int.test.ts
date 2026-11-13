// Schema G2 phần 1 (danh mục, tài khoản, tệp) trên PostgreSQL thật: migration, dữ liệu seed, ràng buộc
// quan trọng và bộ nạp đơn vị hành chính.
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  AdministrativeLevel,
  AdministrativeUnitType,
  AuthSessionRevokeReason,
  ConsentType,
  FileBucket,
  FilePurpose,
  FileStatus,
  GradeStage,
  Locale,
  Role,
  UserStatus,
} from '@tps/shared';
import type { z } from 'zod';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../../src/db/data-source.js';
import { MIGRATIONS } from '../../src/db/migrations/index.js';
import { seedAdministrativeAreas, toAreaRows } from '../../src/db/seeds/administrative-areas.js';
import { AdministrativeArea } from '../../src/modules/catalog/administrative-area.entity.js';
import { Subject } from '../../src/modules/catalog/subject.entity.js';
import { StoredFile } from '../../src/modules/files/stored-file.entity.js';
import { UserRole } from '../../src/modules/users/user-role.entity.js';
import { User } from '../../src/modules/users/user.entity.js';
import { sampleDataset } from '../fixtures/vn-units-sample.js';

jest.setTimeout(180_000);

let postgres: StartedPostgreSqlContainer;
let db: DataSource;

beforeAll(async () => {
  postgres = await new PostgreSqlContainer('postgres:18.6-alpine').start();
  db = createDataSource({ DATABASE_URL: postgres.getConnectionUri(), DATABASE_POOL_MAX: 2 });
  await db.initialize();
  await db.runMigrations();
});

afterAll(async () => {
  await db?.destroy();
  await postgres?.stop();
});

/** Lỗi PostgreSQL kèm tên constraint, để kiểm tra đúng ràng buộc nào chặn. */
async function constraintOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const driverError = (error as { driverError?: { constraint?: string } }).driverError;
    return driverError?.constraint ?? (error as Error).message;
  }
}

let emailCounter = 0;
const users = () => db.getRepository(User);
function newUser(overrides: Partial<User> = {}) {
  emailCounter += 1;
  return users().save(
    users().create({ email: `user${emailCounter}@example.com`, displayName: 'Mai', ...overrides }),
  );
}

describe('migrations', () => {
  it('revert completely and re-apply', async () => {
    for (let i = 0; i < MIGRATIONS.length; i += 1) await db.undoLastMigration();
    const tables = await db.query<{ count: number }[]>(
      `SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'public'
         AND table_name <> 'typeorm_migrations'`,
    );
    expect(tables[0]?.count).toBe(0);
    await db.runMigrations();
    expect(await db.showMigrations()).toBe(false);
  });
});

describe('CHECK constraints', () => {
  // Enum của @tps/shared và CHECK trong migration phải có đúng cùng một tập giá trị (CLAUDE.md).
  it.each<[string, z.ZodEnum]>([
    ['users_status_chk', UserStatus],
    ['users_locale_chk', Locale],
    ['auth_sessions_revoke_reason_chk', AuthSessionRevokeReason],
    ['user_consents_type_chk', ConsentType],
    ['files_bucket_chk', FileBucket],
    ['files_purpose_chk', FilePurpose],
    ['files_status_chk', FileStatus],
    ['grade_levels_stage_chk', GradeStage],
    ['administrative_areas_level_chk', AdministrativeLevel],
    ['administrative_areas_unit_type_chk', AdministrativeUnitType],
  ])('%s allows exactly the values of the shared enum', async (constraint, schema) => {
    const [row] = await db.query<{ def: string }[]>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1`,
      [constraint],
    );
    expect(row).toBeDefined();
    const values = [...(row?.def ?? '').matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
    expect(values.sort()).toEqual([...schema.options].map(String).sort());
  });
});

describe('seed data', () => {
  it('has every role from @tps/shared, with manager and admin as staff', async () => {
    const rows = await db.query<{ code: string; is_staff: boolean }[]>(
      `SELECT code, is_staff FROM roles ORDER BY code`,
    );
    expect(rows.map((r) => r.code).sort()).toEqual([...Role.options].sort());
    expect(rows.filter((r) => r.is_staff).map((r) => r.code)).toEqual(['admin', 'manager']);
  });

  it('has grade levels from preschool to working adult, with valid stages', async () => {
    const rows = await db.query<{ code: string; stage: string }[]>(
      `SELECT code, stage FROM grade_levels ORDER BY sort_order`,
    );
    expect(rows).toHaveLength(15);
    expect(rows[0]?.code).toBe('preschool');
    expect(rows.find((r) => r.code === 'grade_9')?.stage).toBe('lower_secondary');
    expect(rows.at(-1)?.code).toBe('working_adult');
    for (const row of rows) expect(GradeStage.options).toContain(row.stage);
  });

  it('groups every subject under a subject group', async () => {
    const subjects = await db.getRepository(Subject).find();
    const groups = subjects.filter((s) => s.parentId === null);
    expect(groups.every((g) => g.code.startsWith('group_'))).toBe(true);
    const math = subjects.find((s) => s.code === 'math');
    expect(groups.find((g) => g.id === math?.parentId)?.code).toBe('group_sciences');
    expect(subjects.filter((s) => s.parentId !== null).length).toBeGreaterThanOrEqual(20);
  });
});

describe('users', () => {
  it('get a time-ordered uuidv7 id and timestamps from the database', async () => {
    const first = await newUser();
    const second = await newUser();
    expect(first.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second.id > first.id).toBe(true);
    expect(first.createdAt).toBeInstanceOf(Date);
    expect(first.status).toBe('active');
    expect(first.locale).toBe('vi');
  });

  it('treat emails case-insensitively and allow reuse after the account is deleted', async () => {
    const user = await newUser({ email: 'Phu.Huynh@Example.com' });
    expect(await constraintOf(newUser({ email: 'phu.huynh@example.com' }))).toBe('users_email_uq');

    await users().update(user.id, { deletedAt: new Date() });
    await expect(newUser({ email: 'phu.huynh@example.com' })).resolves.toBeDefined();
  });

  it('keep the email unless the account is anonymized, and anonymize only deleted accounts', async () => {
    expect(await constraintOf(newUser({ email: null }))).toBe('users_email_required_chk');
    expect(await constraintOf(newUser({ anonymizedAt: new Date() }))).toBe(
      'users_anonymized_after_delete_chk',
    );
    await expect(
      newUser({ email: null, deletedAt: new Date(), anonymizedAt: new Date() }),
    ).resolves.toBeDefined();
  });

  it('never load the password hash unless asked for', async () => {
    const user = await newUser({ passwordHash: '$argon2id$v=19$fake' });
    const loaded = await users().findOneByOrFail({ id: user.id });
    expect(loaded.passwordHash).toBeUndefined();
    const withHash = await users()
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id: user.id })
      .getOneOrFail();
    expect(withHash.passwordHash).toBe('$argon2id$v=19$fake');
  });

  it('reject values outside the shared enums', async () => {
    expect(await constraintOf(newUser({ status: 'banned' as never }))).toBe('users_status_chk');
    expect(await constraintOf(newUser({ locale: 'fr' as never }))).toBe('users_locale_chk');
    expect(await constraintOf(newUser({ displayName: '   ' }))).toBe('users_display_name_chk');
  });
});

describe('user roles', () => {
  it('allow one active grant per role, and a new grant after revoking', async () => {
    const user = await newUser();
    const roles = db.getRepository(UserRole);
    const first = await roles.save(roles.create({ userId: user.id, roleCode: 'parent' }));
    await roles.save(roles.create({ userId: user.id, roleCode: 'tutor' }));

    expect(
      await constraintOf(roles.save(roles.create({ userId: user.id, roleCode: 'parent' }))),
    ).toBe('user_roles_active_uq');

    await roles.update(first.id, { revokedAt: new Date() });
    await expect(
      roles.save(roles.create({ userId: user.id, roleCode: 'parent' })),
    ).resolves.toBeDefined();
  });

  it('only accept seeded roles', async () => {
    const user = await newUser();
    const roles = db.getRepository(UserRole);
    expect(
      await constraintOf(roles.save(roles.create({ userId: user.id, roleCode: 'owner' as never }))),
    ).toBe('user_roles_role_code_fkey');
  });
});

describe('files', () => {
  it('keep verification documents in the private bucket', async () => {
    const owner = await newUser();
    const files = db.getRepository(StoredFile);
    const base = { ownerUserId: owner.id, mimeType: 'image/jpeg', sizeBytes: 1024 };
    expect(
      await constraintOf(
        files.save(
          files.create({
            ...base,
            bucket: 'public',
            purpose: 'verification_document',
            storageKey: 'a',
          }),
        ),
      ),
    ).toBe('files_private_documents_chk');

    const saved = await files.save(
      files.create({ ...base, bucket: 'public', purpose: 'avatar', storageKey: 'avatar/x.jpg' }),
    );
    expect(saved.status).toBe('pending_upload');
    await users().update(owner.id, { avatarFileId: saved.id });
  });
});

describe('administrative areas', () => {
  const areas = () => db.getRepository(AdministrativeArea);

  beforeEach(async () => {
    // CASCADE: hồ sơ phụ huynh và người học tham chiếu tới khu vực (chỉ là dữ liệu test của file này).
    await db.query(`TRUNCATE administrative_areas RESTART IDENTITY CASCADE`);
  });

  it('enforce the two-level structure', async () => {
    const province = await areas().save(
      areas().create({
        code: '01',
        level: 'province',
        unitType: 'municipality',
        name: 'Hà Nội',
        fullName: 'Thành phố Hà Nội',
        nameAscii: 'Ha Noi',
      }),
    );
    const commune = {
      level: 'commune' as const,
      unitType: 'ward' as const,
      name: 'Ba Đình',
      fullName: 'Phường Ba Đình',
      nameAscii: 'Ba Dinh',
    };
    expect(await constraintOf(areas().save(areas().create({ ...commune, code: '00004' })))).toBe(
      'administrative_areas_parent_chk',
    );
    expect(
      await constraintOf(
        areas().save(areas().create({ ...commune, code: '4', parentId: province.id })),
      ),
    ).toBe('administrative_areas_code_format_chk');
    expect(
      await constraintOf(
        areas().save(
          areas().create({
            ...commune,
            code: '00004',
            parentId: province.id,
            unitType: 'province',
          }),
        ),
      ),
    ).toBe('administrative_areas_unit_level_chk');
  });

  it('seed idempotently, update changes in place and deactivate removed units', async () => {
    const source = 'test dataset';
    const first = await seedAdministrativeAreas(db, toAreaRows(sampleDataset(), null), { source });
    expect(first.inserted).toEqual(['01', '91', '00004', '00008', '31105']);

    const ward = await areas().findOneByOrFail({ code: '00004' });
    const hanoi = await areas().findOneByOrFail({ code: '01' });
    expect(ward.parentId).toBe(hanoi.id);
    expect(ward.nameAscii).toBe('Ba Dinh');

    const again = await seedAdministrativeAreas(db, toAreaRows(sampleDataset(), null), { source });
    expect(again).toMatchObject({ inserted: [], updated: [], deactivated: [], unchanged: 5 });

    // Đổi loại (xã -> phường) giữ mã: cập nhật tại chỗ. Một đơn vị bị sáp nhập: biến mất khỏi nguồn.
    const changed = sampleDataset();
    changed[1]!.Wards[0]!.FullName = 'Phường Phú Quốc';
    changed[1]!.Wards[0]!.AdministrativeUnitId = 3;
    changed[0]!.Wards.splice(1, 1);

    const preview = await seedAdministrativeAreas(db, toAreaRows(changed, null), {
      source,
      dryRun: true,
    });
    expect(preview.updated).toEqual([
      {
        code: '31105',
        fields: {
          unitType: ['special_zone', 'ward'],
          fullName: ['Đặc khu Phú Quốc', 'Phường Phú Quốc'],
        },
      },
    ]);
    expect(preview.deactivated).toEqual(['00008']);
    expect((await areas().findOneByOrFail({ code: '31105' })).unitType).toBe('special_zone');

    await seedAdministrativeAreas(db, toAreaRows(changed, null), { source });
    const ngocHa = await areas().findOneByOrFail({ code: '00008' });
    expect(ngocHa.isActive).toBe(false);
    expect(ngocHa.validTo).not.toBeNull();
    expect((await areas().findOneByOrFail({ code: '31105' })).unitType).toBe('ward');

    // Đơn vị quay lại nguồn thì được bật lại.
    const back = await seedAdministrativeAreas(db, toAreaRows(sampleDataset(), null), { source });
    expect(back.updated.map((c) => c.code)).toContain('00008');
    expect((await areas().findOneByOrFail({ code: '00008' })).isActive).toBe(true);

    const [row] = await db.query<{ comment: string }[]>(
      `SELECT obj_description('administrative_areas'::regclass) AS comment`,
    );
    expect(row?.comment).toContain('Nguồn: test dataset');
  });
});
