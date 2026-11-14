import { STAFF_ROLES } from '@tps/shared';
import { Outlet } from 'react-router';
import { AdminShell } from '~/components/layout/admin-shell';
import { staffRoleOf } from '~/lib/session';
import { requireUser } from '~/lib/session.server';
import type { Route } from './+types/layout';

// Khu Manager/Admin: phải đăng nhập và có vai trò nhân viên; đăng nhập mà không có vai trò đó: 404
// (không để lộ khu quản trị). API vẫn kiểm tra quyền ở từng endpoint.
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context, { roles: STAFF_ROLES });
  const role = staffRoleOf(user) ?? 'manager';
  return { user, role };
}

export default function AdminLayoutRoute({ loaderData }: Route.ComponentProps) {
  return (
    <AdminShell user={loaderData.user} role={loaderData.role}>
      <Outlet />
    </AdminShell>
  );
}
