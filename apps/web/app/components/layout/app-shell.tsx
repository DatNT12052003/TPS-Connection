// Khu người dùng đã đăng nhập (gia sư, phụ huynh, học sinh). Theo canvas TutorHome / ParentHome /
// StudentHome và D51: từ 1024 px thanh trên đầy đủ; dưới 1024 px thanh trên gọn + thanh dưới đáy.
import { Bell } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Logo } from '~/components/brand/logo';
import { buttonVariants } from '~/components/ui/button';
import { APP_NAV, PATHS, type AppRole } from '~/lib/navigation';
import { cn } from '~/lib/utils';
import { BottomNav, TopNav } from './nav-links';
import { SkipLink } from './page';
import { PreferencesControls } from './preferences-controls';

interface AppShellProps {
  role: AppRole;
  /** Thanh phụ phía trên (ví dụ công cụ chọn vai trò ở môi trường dev). */
  banner?: ReactNode;
  children: ReactNode;
}

export function AppShell({ role, banner, children }: AppShellProps) {
  const { t } = useTranslation();
  const nav = APP_NAV[role];
  const roleLabel = t(`role.${role}`);

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink label={t('layout.skipToContent')} />
      {banner}
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex min-h-15 max-w-page items-center gap-2 px-4 md:px-6 lg:min-h-17 lg:gap-6 lg:px-8">
          <Logo to={PATHS.app} className="text-body-lg lg:text-lg" />
          <div className="hidden lg:block">
            <TopNav items={nav.desktop} label={t('layout.primaryNav')} />
          </div>
          <span className="grow" />
          {/* Học sinh chỉ xem (v1), không có trang thông báo riêng (canvas StudentHome). */}
          {role !== 'student' && (
            <Link
              to={PATHS.notifications}
              aria-label={t('layout.notifications')}
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'text-foreground')}
            >
              <Bell aria-hidden="true" />
            </Link>
          )}
          <span className="hidden min-h-control-md items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 font-semibold lg:inline-flex">
            <span
              aria-hidden="true"
              className="inline-flex size-8.5 items-center justify-center rounded-full bg-primary-subtle text-small font-bold text-primary-subtle-foreground"
            >
              {roleLabel.charAt(0)}
            </span>
            {roleLabel}
          </span>
        </div>
      </header>

      {/* pb: chừa chỗ cho thanh dưới đáy (dưới 1024 px). */}
      <main id="main" className="flex-1 pb-24 lg:pb-0">
        {children}
        <div className="mx-auto max-w-page px-4 pb-6 md:px-6 lg:px-8">
          <PreferencesControls className="border-t border-border pt-4" />
        </div>
      </main>

      <BottomNav items={nav.mobile} label={t('layout.primaryNav')} />
    </div>
  );
}
