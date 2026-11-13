import { Outlet } from 'react-router';
import { AdminShell } from '~/components/layout/admin-shell';
import { DevRoleSwitcher } from '~/components/layout/dev-role-switcher';
import { isDevRoleEnabled, readDevRole, requireRole } from '~/lib/dev-role.server';
import { STAFF_ROLES } from '~/lib/navigation';
import type { Route } from './+types/layout';

// G1: vai trò lấy từ công cụ chọn vai trò ở môi trường dev (production trả 404).
// G2: thay bằng phiên đăng nhập thật + kiểm tra vai trò manager/admin ở server.
export async function loader({ request }: Route.LoaderArgs) {
  const role = await requireRole(request, STAFF_ROLES);
  const devRole = isDevRoleEnabled() ? ((await readDevRole(request)) ?? role) : null;
  return { role, devRole };
}

export default function AdminLayoutRoute({ loaderData }: Route.ComponentProps) {
  const { role, devRole } = loaderData;
  return (
    <AdminShell role={role} banner={devRole && <DevRoleSwitcher current={devRole} />}>
      <Outlet />
    </AdminShell>
  );
}
