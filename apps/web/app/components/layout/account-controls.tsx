// Người đang đăng nhập trên thanh trên (theo canvas: chữ cái đầu + tên, từ 1024 px) và nút đăng xuất.
// Đăng xuất là form POST /logout (chống CSRF; dùng được cả khi JavaScript chưa tải).
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Form } from 'react-router';
import { Button } from '~/components/ui/button';
import { PATHS } from '~/lib/navigation';
import type { SessionUser } from '~/lib/session';

export function AccountControls({ user }: { user: Pick<SessionUser, 'displayName'> }) {
  const { t } = useTranslation();
  const initial = user.displayName.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="flex items-center gap-1">
      <span
        title={user.displayName}
        className="hidden min-h-control-md items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 font-semibold lg:inline-flex lg:max-xl:pr-1"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-8.5 items-center justify-center rounded-full bg-primary-subtle text-small font-bold text-primary-subtle-foreground"
        >
          {initial}
        </span>
        {/* 1024–1279 px chỉ hiện chữ cái đầu (tên vẫn đọc được bằng trình đọc màn hình và tooltip). */}
        <span className="max-w-40 truncate lg:max-xl:sr-only">{user.displayName}</span>
      </span>
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
