// Người đang đăng nhập trên thanh trên (theo canvas: chữ cái đầu + tên, từ 1024 px) và nút đăng xuất.
// Đăng xuất là form POST /logout (chống CSRF; dùng được cả khi JavaScript chưa tải).
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Form, NavLink } from 'react-router';
import { Button } from '~/components/ui/button';
import { PATHS } from '~/lib/navigation';
import type { SessionUser } from '~/lib/session';
import { cn } from '~/lib/utils';

export function AccountControls({
  user,
  accountTo,
}: {
  user: Pick<SessionUser, 'displayName'>;
  /** Trang tài khoản (nếu vai trò này đã có): ô tên trở thành liên kết tới đó (canvas Settings). */
  accountTo?: string | undefined;
}) {
  const { t } = useTranslation();
  const initial = user.displayName.trim().charAt(0).toUpperCase() || '?';
  const pill = (
    <>
      <span
        aria-hidden="true"
        className="inline-flex size-8.5 items-center justify-center rounded-full bg-primary-subtle text-small font-bold text-primary-subtle-foreground"
      >
        {initial}
      </span>
      {/* 1024–1279 px chỉ hiện chữ cái đầu (tên vẫn đọc được bằng trình đọc màn hình và tooltip). */}
      <span className="max-w-40 truncate lg:max-xl:sr-only">{user.displayName}</span>
    </>
  );
  const pillClassName =
    'hidden min-h-control-md items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 font-semibold text-foreground no-underline lg:inline-flex lg:max-xl:pr-1';
  return (
    <div className="flex items-center gap-1">
      {accountTo ? (
        <NavLink
          to={accountTo}
          title={user.displayName}
          className={cn(
            pillClassName,
            'hover:bg-surface-sunken aria-[current=page]:border-primary aria-[current=page]:bg-primary-subtle',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          )}
        >
          {pill}
        </NavLink>
      ) : (
        <span title={user.displayName} className={pillClassName}>
          {pill}
        </span>
      )}
      <Form method="post" action={PATHS.logout}>
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="text-foreground"
          aria-label={t('layout.logout')}
          title={t('layout.logout')}
        >
          <LogOut aria-hidden="true" />
        </Button>
      </Form>
    </div>
  );
}
