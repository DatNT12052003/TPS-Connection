import { Outlet } from 'react-router';
import { AppShell } from '~/components/layout/app-shell';
import { DevRoleSwitcher } from '~/components/layout/dev-role-switcher';
import { isDevRoleEnabled, readDevRole, requireRole } from '~/lib/dev-role.server';
import { APP_ROLES } from '~/lib/navigation';
import type { Route } from './+types/layout';

// G1: vai trò lấy từ công cụ chọn vai trò ở môi trường dev (production trả 404).
// G2: thay bằng phiên đăng nhập thật; chưa đăng nhập thì chuyển tới /login.
export async function loader({ request }: Route.LoaderArgs) {
  const role = await requireRole(request, APP_ROLES);
  const devRole = isDevRoleEnabled() ? ((await readDevRole(request)) ?? role) : null;
  return { role, devRole };
}

export default function AppLayoutRoute({ loaderData }: Route.ComponentProps) {
  const { role, devRole } = loaderData;
  return (
    <AppShell role={role} banner={devRole && <DevRoleSwitcher current={devRole} />}>
      <Outlet />
    </AppShell>
  );
}
