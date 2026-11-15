import { Outlet, redirect } from 'react-router';
import { AppShell } from '~/components/layout/app-shell';
import { appRoleOf } from '~/lib/session';
import { homePathFor, requireUser } from '~/lib/session.server';
import type { Route } from './+types/layout';

// Khu gia sư, phụ huynh, học sinh: phải đăng nhập (chưa đăng nhập: về /login rồi quay lại đây).
// Tài khoản chỉ có vai trò Manager/Admin: chuyển sang /admin.
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const role = appRoleOf(user);
  if (!role) throw redirect(homePathFor(user));
  return { user, role };
}

export default function AppLayoutRoute({ loaderData }: Route.ComponentProps) {
  return (
    <AppShell user={loaderData.user} role={loaderData.role}>
      <Outlet />
    </AppShell>
  );
}
