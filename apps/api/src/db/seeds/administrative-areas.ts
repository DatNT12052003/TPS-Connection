// Nạp danh mục đơn vị hành chính từ bộ dữ liệu vietnamese-provinces-database (D42–D44).
// Quy tắc (docs/danh_muc_hanh_chinh.md mục 5): idempotent; upsert theo `code`; đơn vị không còn trong nguồn
// thì `is_active = false` (không bao giờ xóa); kiểm tra dữ liệu trước khi ghi; có chế độ chỉ xem khác biệt.
import { type AdministrativeLevel, type AdministrativeUnitType, toAscii } from '@tps/shared';
import type { DataSource, QueryRunner } from 'typeorm';
import { z } from 'zod';

const SourceWard = z.object({
  Code: z.string(),
  Name: z.string().min(1),
  NameEn: z.string().nullish(),
  FullName: z.string().min(1),
  ProvinceCode: z.string(),
  PostalCode: z.string().nullish(),
  AdministrativeUnitId: z.number().int(),
});

const SourceProvince = z.object({
  Code: z.string(),
  Name: z.string().min(1),
  NameEn: z.string().nullish(),
  FullName: z.string().min(1),
  AdministrativeUnitId: z.number().int(),
  Wards: z.array(SourceWard),
});

/** Định dạng `full_json_generated_data_vn_units.json`. */
export const SourceDataset = z.array(SourceProvince);
export type SourceDataset = z.infer<typeof SourceDataset>;

export const SourceMetadata = z.object({
  DatasetVersion: z.string(),
  LatestDecree: z.string(),
  GeneratedAt: z.string(),
});
export type SourceMetadata = z.infer<typeof SourceMetadata>;

/** `AdministrativeUnitId` của nguồn -> `unit_type` của mình. */
const UNIT_TYPES: Record<number, { level: AdministrativeLevel; unitType: AdministrativeUnitType }> =
  {
    1: { level: 'province', unitType: 'municipality' },
    2: { level: 'province', unitType: 'province' },
    3: { level: 'commune', unitType: 'ward' },
    4: { level: 'commune', unitType: 'commune' },
    5: { level: 'commune', unitType: 'special_zone' },
  };

/** Số đơn vị mong đợi (sắp xếp năm 2025, chưa đổi tới v5.2.0). Đổi khi có sáp nhập/chia tách mới. */
export const EXPECTED_COUNTS = { provinces: 34, communes: 3321 };

export interface AreaRow {
  code: string;
  level: AdministrativeLevel;
  unitType: AdministrativeUnitType;
  parentCode: string | null;
  name: string;
  fullName: string;
  nameEn: string | null;
  nameAscii: string;
  postalCode: string | null;
}

export class AreaSeedError extends Error {
  constructor(readonly problems: string[]) {
    super(`Dữ liệu đơn vị hành chính không hợp lệ:\n- ${problems.join('\n- ')}`);
    this.name = 'AreaSeedError';
  }
}

/**
 * Kiểm tra và chuyển dữ liệu nguồn thành các dòng của bảng. Ném AreaSeedError liệt kê MỌI lỗi tìm thấy
 * (sai định dạng mã, trùng mã, xã không thuộc tỉnh nào, loại đơn vị lạ, sai số lượng).
 */
export function toAreaRows(
  input: unknown,
  expected: { provinces: number; communes: number } | null = EXPECTED_COUNTS,
): AreaRow[] {
  const parsed = SourceDataset.safeParse(input);
  if (!parsed.success) {
    throw new AreaSeedError([`Sai cấu trúc tệp nguồn: ${z.prettifyError(parsed.error)}`]);
  }

  const problems: string[] = [];
  const provinces: AreaRow[] = [];
  const communes: AreaRow[] = [];
  const seen = new Set<string>();
  const provinceCodes = new Set(parsed.data.map((p) => p.Code));

  const unitOf = (code: string, unitId: number, level: AdministrativeLevel) => {
    const unit = UNIT_TYPES[unitId];
    if (!unit) {
      problems.push(`${code}: loại đơn vị ${unitId} chưa được hỗ trợ`);
      return undefined;
    }
    if (unit.level !== level) {
      problems.push(`${code}: loại đơn vị ${unitId} không thuộc cấp ${level}`);
      return undefined;
    }
    return unit.unitType;
  };
  const checkCode = (code: string, pattern: RegExp, label: string) => {
    if (!pattern.test(code)) problems.push(`${code}: mã ${label} sai định dạng`);
    if (seen.has(code)) problems.push(`${code}: trùng mã`);
    seen.add(code);
  };

  for (const p of parsed.data) {
    checkCode(p.Code, /^\d{2}$/, 'tỉnh (2 chữ số)');
    const unitType = unitOf(p.Code, p.AdministrativeUnitId, 'province');
    if (unitType) {
      provinces.push({
        code: p.Code,
        level: 'province',
        unitType,
        parentCode: null,
        name: p.Name.trim(),
        fullName: p.FullName.trim(),
        nameEn: p.NameEn?.trim() || null,
        nameAscii: toAscii(p.Name.trim()),
        postalCode: null, // nguồn chỉ có tiền tố mã bưu chính ở cấp tỉnh
      });
    }

    for (const w of p.Wards) {
      checkCode(w.Code, /^\d{5}$/, 'xã (5 chữ số)');
      if (w.ProvinceCode !== p.Code || !provinceCodes.has(w.ProvinceCode)) {
        problems.push(`${w.Code}: thuộc tỉnh ${w.ProvinceCode} nhưng nằm trong ${p.Code}`);
      }
      const wardType = unitOf(w.Code, w.AdministrativeUnitId, 'commune');
      if (wardType) {
        communes.push({
          code: w.Code,
          level: 'commune',
          unitType: wardType,
          parentCode: p.Code,
          name: w.Name.trim(),
          fullName: w.FullName.trim(),
          nameEn: w.NameEn?.trim() || null,
          nameAscii: toAscii(w.Name.trim()),
          postalCode: w.PostalCode?.trim() || null,
        });
      }
    }
  }

  if (expected) {
    if (parsed.data.length !== expected.provinces) {
      problems.push(`Có ${parsed.data.length} tỉnh/thành, mong đợi ${expected.provinces}`);
    }
    const communeCount = parsed.data.reduce((n, p) => n + p.Wards.length, 0);
    if (communeCount !== expected.communes) {
      problems.push(`Có ${communeCount} xã/phường/đặc khu, mong đợi ${expected.communes}`);
    }
  }

  if (problems.length > 0) throw new AreaSeedError(problems);
  return [...provinces, ...communes];
}

const COMPARED_FIELDS = [
  'level',
  'unitType',
  'parentCode',
  'name',
  'fullName',
  'nameEn',
  'nameAscii',
  'postalCode',
] as const satisfies readonly (keyof AreaRow)[];

export interface AreaChange {
  code: string;
  /** Trường đổi giá trị: [cũ, mới]. `isActive` có mặt khi đơn vị được bật lại. */
  fields: Partial<Record<(typeof COMPARED_FIELDS)[number] | 'isActive', [unknown, unknown]>>;
}

export interface AreaSeedReport {
  inserted: string[];
  updated: AreaChange[];
  /** Đơn vị đang hiệu lực nhưng không còn trong nguồn: đặt `is_active = false`. */
  deactivated: string[];
  unchanged: number;
  dryRun: boolean;
}

type ExistingRow = AreaRow & { isActive: boolean };

/**
 * So sánh `rows` với bảng và ghi khác biệt trong một transaction. `dryRun`: chỉ trả báo cáo, không ghi.
 * `source` (ví dụ "vietnamese-provinces-database v5.2.0") được ghi vào COMMENT của bảng để biết danh mục
 * đang ở mốc nào.
 */
export async function seedAdministrativeAreas(
  dataSource: DataSource,
  rows: AreaRow[],
  options: { dryRun?: boolean; source: string },
): Promise<AreaSeedReport> {
  const dryRun = options.dryRun ?? false;
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.startTransaction();
    // Khóa bảng (vẫn cho đọc) để hai lần nạp chạy cùng lúc không ghi chồng nhau.
    await queryRunner.query(`LOCK TABLE administrative_areas IN SHARE ROW EXCLUSIVE MODE`);

    const existing = await loadExisting(queryRunner);
    const report: AreaSeedReport = {
      inserted: [],
      updated: [],
      deactivated: [],
      unchanged: 0,
      dryRun,
    };
    const toWrite: AreaRow[] = [];

    for (const row of rows) {
      const current = existing.get(row.code);
      if (!current) {
        report.inserted.push(row.code);
        toWrite.push(row);
        continue;
      }
      const fields: AreaChange['fields'] = {};
      for (const field of COMPARED_FIELDS) {
        if (current[field] !== row[field]) fields[field] = [current[field], row[field]];
      }
      if (!current.isActive) fields.isActive = [false, true];
      if (Object.keys(fields).length > 0) {
        report.updated.push({ code: row.code, fields });
        toWrite.push(row);
      } else {
        report.unchanged += 1;
      }
    }

    const sourceCodes = new Set(rows.map((r) => r.code));
    report.deactivated = [...existing.values()]
      .filter((r) => r.isActive && !sourceCodes.has(r.code))
      .map((r) => r.code);

    if (!dryRun) {
      // Tỉnh trước để xã tìm được parent_id của tỉnh mới thêm.
      await upsert(
        queryRunner,
        toWrite.filter((r) => r.level === 'province'),
      );
      await upsert(
        queryRunner,
        toWrite.filter((r) => r.level === 'commune'),
      );
      if (report.deactivated.length > 0) {
        await queryRunner.query(
          `UPDATE administrative_areas
              SET is_active = false, valid_to = COALESCE(valid_to, current_date), updated_at = now()
            WHERE code = ANY($1::text[])`,
          [report.deactivated],
        );
      }
      await queryRunner.query(
        `COMMENT ON TABLE administrative_areas IS ${pgLiteral(
          `Nguồn: ${options.source}; nạp lúc ${new Date().toISOString()}`,
        )}`,
      );
    }

    await (dryRun ? queryRunner.rollbackTransaction() : queryRunner.commitTransaction());
    return report;
  } catch (error) {
    if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async function loadExisting(queryRunner: QueryRunner): Promise<Map<string, ExistingRow>> {
  const rows = (await queryRunner.query(`
    SELECT a.code, a.level, a.unit_type AS "unitType", p.code AS "parentCode", a.name,
           a.full_name AS "fullName", a.name_en AS "nameEn", a.name_ascii AS "nameAscii",
           a.postal_code AS "postalCode", a.is_active AS "isActive"
      FROM administrative_areas a
      LEFT JOIN administrative_areas p ON p.id = a.parent_id
  `)) as ExistingRow[];
  return new Map(rows.map((r) => [r.code, r]));
}

async function upsert(queryRunner: QueryRunner, rows: AreaRow[]) {
  if (rows.length === 0) return;
  const column = <K extends keyof AreaRow>(key: K) => rows.map((r) => r[key]);
  await queryRunner.query(
    `INSERT INTO administrative_areas
            (code, level, unit_type, parent_id, name, full_name, name_en, name_ascii, postal_code)
     SELECT s.code, s.level, s.unit_type, p.id, s.name, s.full_name, s.name_en, s.name_ascii, s.postal_code
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
                   $8::text[], $9::text[])
            AS s (code, level, unit_type, parent_code, name, full_name, name_en, name_ascii, postal_code)
       LEFT JOIN administrative_areas p ON p.code = s.parent_code
     ON CONFLICT (code) DO UPDATE
        SET level = EXCLUDED.level, unit_type = EXCLUDED.unit_type, parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name, full_name = EXCLUDED.full_name, name_en = EXCLUDED.name_en,
            name_ascii = EXCLUDED.name_ascii, postal_code = EXCLUDED.postal_code,
            is_active = true, valid_to = NULL, updated_at = now()`,
    [
      column('code'),
      column('level'),
      column('unitType'),
      column('parentCode'),
      column('name'),
      column('fullName'),
      column('nameEn'),
      column('nameAscii'),
      column('postalCode'),
    ],
  );
}

/** Chuỗi hằng SQL (COMMENT ON không nhận tham số $1). */
function pgLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
