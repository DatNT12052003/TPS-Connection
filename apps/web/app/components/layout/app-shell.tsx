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
import type { SessionUser } from '~/lib/session';
import { AccountControls } from './account-controls';
import { BottomNav, TopNav } from './nav-links';
import { SkipLink } from './page';
import { SettingsMenu } from './settings-menu';

interface AppShellProps {
  user: Pick<SessionUser, 'displayName'>;
  /** Vai trò dùng để dựng điều hướng (appRoleOf). */
  role: AppRole;
  children: ReactNode;
}

export function AppShell({ user, role, children }: AppShellProps) {
  const { t } = useTranslation();
  const nav = APP_NAV[role];

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink label={t('layout.skipToContent')} />
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        {/* 1024–1279 px: thanh trên chật (tới 6 mục) nên chỉ hiện biểu tượng logo và chữ cái đầu của tên. */}
        <div className="mx-auto flex min-h-15 max-w-page items-center gap-1 px-4 sm:gap-2 md:px-6 lg:min-h-17 lg:gap-4 lg:px-8 xl:gap-6">
          <Logo
            to={PATHS.app}
            className="text-body-lg lg:text-lg"
            labelClassName="lg:max-xl:sr-only"
          />
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
          <SettingsMenu />
          {/* Trang tài khoản: hiện chỉ phụ huynh có (G2 đợt 2); gia sư, học sinh thêm ở đợt 3. */}
          <AccountControls user={user} accountTo={role === 'parent' ? PATHS.account : undefined} />
        </div>
      </header>

      {/* pb: chừa chỗ cho thanh dưới đáy (dưới 1024 px). */}
      <main id="main" className="flex-1 pb-24 lg:pb-0">
        {children}
      </main>

      <BottomNav items={nav.mobile} label={t('layout.primaryNav')} />
    </div>
  );
}
