// /admin: chuyển tới màn làm việc chính theo vai trò (G3): Admin → tài khoản, Manager → hàng chờ xác minh.
// Người vừa là Admin vừa là Manager vào khu Admin (`staffRoleOf`); menu chỉ hiện mục của Admin, hàng chờ xác
// minh vẫn mở được ở /admin/verifications (API kiểm tra vai trò Manager).
import { redirect } from 'react-router';
import { staffRoleOf } from '~/lib/session';
import { requireUser } from '~/lib/session.server';
import { STAFF_ROLES } from '~/lib/navigation';
import type { Route } from './+types/home';

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context, { roles: STAFF_ROLES });
  throw redirect(staffRoleOf(user) === 'admin' ? '/admin/accounts' : '/admin/verifications');
}

export default function AdminHomePage() {
  return null;
}
