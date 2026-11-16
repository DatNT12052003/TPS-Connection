import { NotificationUnread, UnreadSummary } from '@tps/shared';
import { Outlet, redirect } from 'react-router';
import { AppShell } from '~/components/layout/app-shell';
import { useRealtimeRevalidation } from '~/lib/realtime';
import { getServerApi } from '~/lib/server-api.server';
import { appRoleOf } from '~/lib/session';
import { homePathFor, requireUser } from '~/lib/session.server';
import type { Route } from './+types/layout';

// Khu gia sư, phụ huynh, học sinh: phải đăng nhập (chưa đăng nhập: về /login rồi quay lại đây).
// Tài khoản chỉ có vai trò Manager/Admin: chuyển sang /admin.
// Gia sư, phụ huynh (G5): số thông báo chưa đọc (chuông) và số hội thoại có tin chưa đọc (mục Kết nối); hai số này
// không quan trọng bằng trang, nên API lỗi thì coi như 0. Kết nối realtime để các trang tự cập nhật.
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const role = appRoleOf(user);
  if (!role) throw redirect(homePathFor(user));
  if (role === 'student') return { user, role, unread: { notifications: 0, conversations: 0 } };

  const api = getServerApi(context);
  const [notifications, conversations] = await Promise.all([
    api
      .call('/api/v1/notifications/unread', { schema: NotificationUnread })
      .then((r) => r.count)
      .catch(() => 0),
    api
      .call('/api/v1/conversations/unread', { schema: UnreadSummary })
      .then((r) => r.conversations)
      .catch(() => 0),
  ]);
  return { user, role, unread: { notifications, conversations } };
}

export default function AppLayoutRoute({ loaderData }: Route.ComponentProps) {
  const { user, role, unread } = loaderData;
  useRealtimeRevalidation(role !== 'student');
  return (
    <AppShell user={user} role={role} unread={unread}>
      <Outlet />
    </AppShell>
  );
}
