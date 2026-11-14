// Người dùng đang đăng nhập, đọc qua API (`GET /auth/me`) bằng cookie phiên của trình duyệt (D57).
// Mỗi request chỉ hỏi API một lần (nhiều loader dùng chung). Chỉ chạy trên server.
import { AuthUser, type Role } from '@tps/shared';
import { data, redirect, type RouterContextProvider } from 'react-router';
import { ApiError } from './api';
import { PATHS } from './navigation';
import type { SessionUser } from './session';

export { homePathFor } from './session';
import { getServerApi, type ServerApi } from './server-api.server';

const userByApi = new WeakMap<ServerApi, Promise<SessionUser | null>>();

/** Chỉ giữ những gì giao diện cần; không đưa email, số điện thoại vào HTML của mọi trang. */
const toSessionUser = (user: AuthUser): SessionUser => ({
  id: user.id,
  displayName: user.displayName,
  roles: user.roles,
  status: user.status,
});

async function loadUser(api: ServerApi): Promise<SessionUser | null> {
  if (!api.hasSession()) return null;
  try {
    return toSessionUser(await api.call('/api/v1/auth/me', { schema: AuthUser }));
  } catch (error) {
    // Phiên hết hạn, tài khoản bị khóa: coi như chưa đăng nhập. API không gọi được (0, 5xx): ném lỗi.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) return null;
    throw error;
  }
}

/**
 * Người dùng đang đăng nhập, hoặc null. API không gọi được thì ném ApiError: trang cần đăng nhập hiện
 * trang lỗi; trang công khai dùng `getCurrentUserOrNull`.
 */
export function getCurrentUser(
  context: Readonly<RouterContextProvider>,
): Promise<SessionUser | null> {
  const api = getServerApi(context);
  let user = userByApi.get(api);
  if (!user) {
    user = loadUser(api);
    userByApi.set(api, user);
  }
  return user;
}

/** Như getCurrentUser nhưng API lỗi thì coi như chưa đăng nhập (trang công khai vẫn hiện được). */
export async function getCurrentUserOrNull(
  context: Readonly<RouterContextProvider>,
): Promise<SessionUser | null> {
  try {
    return await getCurrentUser(context);
  } catch {
    return null;
  }
}

/**
 * Bắt buộc đăng nhập. Chưa đăng nhập: chuyển tới /login, kèm `redirectTo` để quay lại đúng trang.
 * `roles`: phải có ít nhất một vai trò; đăng nhập nhưng không có: 404 (không để lộ khu vực đó có tồn tại).
 */
export async function requireUser(
  request: Request,
  context: Readonly<RouterContextProvider>,
  options: { roles?: readonly Role[] } = {},
): Promise<SessionUser> {
  const user = await getCurrentUser(context);
  if (!user) {
    const url = new URL(request.url);
    const params = new URLSearchParams({ redirectTo: url.pathname + url.search });
    throw redirect(`${PATHS.login}?${params.toString()}`);
  }
  if (options.roles && !user.roles.some((role) => options.roles?.includes(role))) {
    throw data(null, { status: 404 });
  }
  return user;
}
