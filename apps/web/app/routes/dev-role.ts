// TẠM THỜI (G1, chỉ môi trường dev): POST /dev/role chọn vai trò để xem layout. G2 xóa route này.
import { Role } from '@tps/shared';
import { data, redirect } from 'react-router';
import { isDevRoleEnabled, serializeDevRole } from '~/lib/dev-role.server';
import { PATHS } from '~/lib/navigation';
import type { Route } from './+types/dev-role';

export async function action({ request }: Route.ActionArgs) {
  if (!isDevRoleEnabled()) throw data(null, { status: 404 });

  const form = await request.formData();
  const role = Role.safeParse(form.get('role'));
  if (!role.success) throw data(null, { status: 400 });

  const target = role.data === 'manager' || role.data === 'admin' ? PATHS.admin : PATHS.app;
  return redirect(target, { headers: { 'Set-Cookie': await serializeDevRole(role.data) } });
}

export function loader() {
  throw data(null, { status: 404 });
}
