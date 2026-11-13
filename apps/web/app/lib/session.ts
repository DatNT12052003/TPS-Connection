// Người dùng đang đăng nhập, dạng gọn mà root loader đưa xuống giao diện (dùng được cả ở trình duyệt).
import type { Role, UserStatus } from '@tps/shared';
import { APP_ROLES, type AppRole, PATHS, STAFF_ROLES, type StaffRole } from './navigation';

export interface SessionUser {
  id: string;
  displayName: string;
  roles: Role[];
  status: UserStatus;
}

/**
 * Vai trò dùng để dựng khu /app khi một người có nhiều vai trò: theo thứ tự gia sư, phụ huynh, học sinh.
 * Chưa có chỗ chuyển vai trò trên giao diện; thêm khi có người dùng vừa là gia sư vừa là phụ huynh.
 */
export function appRoleOf(user: Pick<SessionUser, 'roles'>): AppRole | null {
  return APP_ROLES.find((role) => user.roles.includes(role)) ?? null;
}

/** Vai trò cho khu /admin: Admin trước Manager. */
export function staffRoleOf(user: Pick<SessionUser, 'roles'>): StaffRole | null {
  return [...STAFF_ROLES].reverse().find((role) => user.roles.includes(role)) ?? null;
}

/** Trang chính sau khi đăng nhập: chỉ có vai trò Manager/Admin thì vào /admin, còn lại vào /app. */
export function homePathFor(user: Pick<SessionUser, 'roles'>): string {
  return appRoleOf(user) === null && staffRoleOf(user) !== null ? PATHS.admin : PATHS.app;
}
