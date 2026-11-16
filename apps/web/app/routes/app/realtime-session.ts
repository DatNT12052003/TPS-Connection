// GET /app/realtime/session (chỉ có loader, không giao diện): kết nối realtime bị từ chối vì access token hết hạn thì
// trình duyệt gọi route này. Server web gọi API như mọi loader khác nên tự làm mới phiên và đặt cookie mới; sau đó
// trình duyệt kết nối Socket.IO lại (lib/realtime.ts). Chưa đăng nhập: 401.
import { getCurrentUser } from '~/lib/session.server';
import type { Route } from './+types/realtime-session';

export async function loader({ context }: Route.LoaderArgs) {
  const user = await getCurrentUser(context).catch(() => null);
  return new Response(null, { status: user ? 204 : 401 });
}
