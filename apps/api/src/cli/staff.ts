// Cấp / thu hồi vai trò vận hành:
//   npm run users:staff -w @tps/api -- grant  --email <email> --role admin|manager [--name "<Họ tên>"]
//   npm run users:staff -w @tps/api -- revoke --email <email> --role admin|manager
// --name chỉ cần khi email chưa có tài khoản. Tài khoản mới chưa có mật khẩu: người được cấp vào trang
// đăng nhập, chọn "Quên mật khẩu" để nhận mã qua email và tự đặt mật khẩu.
/* eslint-disable no-console -- lệnh chạy tay, in kết quả ra terminal */
import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { Email } from '@tps/shared';
import { z } from 'zod';
import { createDataSource } from '../db/data-source.js';
import { AppError } from '../lib/app-error.js';
import { grantStaffRole, revokeStaffRole } from '../modules/users/staff-roles.js';

const USAGE = `Cách dùng:
  npm run users:staff -w @tps/api -- grant  --email <email> --role admin|manager [--name "<Họ tên>"]
  npm run users:staff -w @tps/api -- revoke --email <email> --role admin|manager`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: 'string' },
    role: { type: 'string' },
    name: { type: 'string' },
  },
});

const parsed = z
  .object({
    action: z.enum(['grant', 'revoke']),
    email: Email,
    role: z.enum(['admin', 'manager']),
    name: z.string().trim().min(1).max(100).optional(),
  })
  .safeParse({ action: positionals[0], ...values });
if (!parsed.success) {
  console.error(`${z.prettifyError(parsed.error)}\n\n${USAGE}`);
  process.exit(1);
}
const { action, email, role, name } = parsed.data;

const env = z.object({ DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }) }).parse(process.env);
const dataSource = createDataSource({ DATABASE_URL: env.DATABASE_URL, DATABASE_POOL_MAX: 1 });
await dataSource.initialize();
try {
  if (action === 'grant') {
    const result = await grantStaffRole(dataSource, { email, fullName: name, role });
    if (result.alreadyGranted) {
      console.log(`${email} đã có vai trò ${role}, không đổi gì.`);
    } else {
      console.log(`Đã cấp vai trò ${role} cho ${email}.`);
    }
    if (result.created) {
      console.log(
        'Tài khoản mới, chưa có mật khẩu. Người này vào trang đăng nhập, chọn "Quên mật khẩu" để nhận mã qua email và tự đặt mật khẩu.',
      );
    }
  } else {
    const result = await revokeStaffRole(dataSource, { email, role });
    console.log(
      result.revoked
        ? `Đã thu hồi vai trò ${role} của ${email}.`
        : `${email} không có vai trò ${role}.`,
    );
  }
} catch (error) {
  if (error instanceof AppError) {
    console.error(`Không thực hiện được: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await dataSource.destroy();
}
