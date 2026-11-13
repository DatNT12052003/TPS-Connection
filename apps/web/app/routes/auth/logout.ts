// POST /logout: thu hồi phiên ở API (API xóa cookie, middleware chuyển lệnh xóa về trình duyệt) rồi về
// trang chủ. Không có giao diện; GET chỉ chuyển về trang chủ (đăng xuất phải là POST để chống CSRF).
import { redirect } from 'react-router';
import { PATHS } from '~/lib/navigation';
import { getServerApi } from '~/lib/server-api.server';
import type { Route } from './+types/logout';

export async function action({ context }: Route.ActionArgs) {
  await getServerApi(context).call('/api/v1/auth/logout', { method: 'POST' });
  return redirect(PATHS.home);
}

export function loader() {
  return redirect(PATHS.home);
}
