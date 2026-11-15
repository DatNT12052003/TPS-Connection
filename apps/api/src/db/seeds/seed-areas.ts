// Lệnh nạp đơn vị hành chính: npm run db:seed:areas -w @tps/api [-- --dry-run]
// Tùy chọn: --dry-run (chỉ in khác biệt), --source <thư mục> (mặc định src/db/seeds/data/vn-units),
// --expect-provinces <n>, --expect-communes <n> (khi danh mục đổi số lượng sau sáp nhập/chia tách).
/* eslint-disable no-console -- lệnh chạy tay, in kết quả ra terminal */
import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createDataSource } from '../data-source.js';
import {
  type AreaSeedReport,
  EXPECTED_COUNTS,
  SourceMetadata,
  seedAdministrativeAreas,
  toAreaRows,
} from './administrative-areas.js';

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    source: { type: 'string', default: 'src/db/seeds/data/vn-units' },
    'expect-provinces': { type: 'string' },
    'expect-communes': { type: 'string' },
  },
});

const env = z
  .object({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  })
  .parse(process.env);

const readJson = async (file: string): Promise<unknown> =>
  JSON.parse(await readFile(join(args.source, file), 'utf8')) as unknown;

const metadata = SourceMetadata.parse(await readJson('vn_provinces_metadata.json'));
const rows = toAreaRows(await readJson('full_json_generated_data_vn_units.json'), {
  provinces: Number(args['expect-provinces'] ?? EXPECTED_COUNTS.provinces),
  communes: Number(args['expect-communes'] ?? EXPECTED_COUNTS.communes),
});
const source = `vietnamese-provinces-database ${metadata.DatasetVersion} (${metadata.LatestDecree})`;

const dataSource = createDataSource({ DATABASE_URL: env.DATABASE_URL, DATABASE_POOL_MAX: 1 });
await dataSource.initialize();
try {
  const report = await seedAdministrativeAreas(dataSource, rows, {
    dryRun: args['dry-run'],
    source,
  });
  printReport(report, source);
} finally {
  await dataSource.destroy();
}

function printReport(report: AreaSeedReport, sourceLabel: string) {
  const sample = (codes: string[]) =>
    codes.length > 20
      ? `${codes.slice(0, 20).join(', ')}, … (+${codes.length - 20})`
      : codes.join(', ');

  console.log(`Nguồn: ${sourceLabel}`);
  console.log(
    report.dryRun ? 'Chế độ xem trước (--dry-run): KHÔNG ghi gì.' : 'Đã ghi vào database.',
  );
  console.log(`  Thêm mới:          ${report.inserted.length}`);
  console.log(`  Cập nhật:          ${report.updated.length}`);
  console.log(`  Ngừng hiệu lực:    ${report.deactivated.length}`);
  console.log(`  Không đổi:         ${report.unchanged}`);
  if (report.inserted.length > 0 && report.inserted.length < rows.length) {
    console.log(`\nThêm mới: ${sample(report.inserted)}`);
  }
  for (const change of report.updated.slice(0, 50)) {
    const fields = Object.entries(change.fields)
      .map(([field, [from, to]]) => `${field}: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`)
      .join('; ');
    console.log(`  ~ ${change.code}  ${fields}`);
  }
  if (report.updated.length > 50) console.log(`  … và ${report.updated.length - 50} đơn vị khác`);
  if (report.deactivated.length > 0) {
    console.log(`\nNgừng hiệu lực (không còn trong nguồn): ${sample(report.deactivated)}`);
  }
}
