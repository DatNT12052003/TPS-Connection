// Khu Manager / Admin tại /admin. Theo canvas ManagerQueue / AdminAccounts: thanh trên có nhãn khu vực
// ("Quản trị" hoặc "Admin") và các mục xử lý; điện thoại dùng menu mở ra. Màn hình quản trị dùng tốt
// nhất trên máy tính.
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from '~/components/brand/logo';
import { ADMIN_NAV, PATHS, type StaffRole } from '~/lib/navigation';
import type { SessionUser } from '~/lib/session';
import { AccountControls } from './account-controls';
import { MobileMenu } from './mobile-menu';
import { MenuNav, TopNav } from './nav-links';
import { SkipLink } from './page';
import { SettingsMenu } from './settings-menu';

interface AdminShellProps {
  user: Pick<SessionUser, 'displayName'>;
  role: StaffRole;
  children: ReactNode;
}

export function AdminShell({ user, role, children }: AdminShellProps) {
  const { t } = useTranslation();
  const items = ADMIN_NAV[role];
  const areaLabel = t(role === 'manager' ? 'layout.managerArea' : 'layout.adminArea');
  const roleLabel = t(`role.${role}`);

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink label={t('layout.skipToContent')} />
      <header className="relative border-b border-border bg-surface">
        <div className="mx-auto flex min-h-15 max-w-page items-center gap-1 px-4 sm:gap-2 md:px-6 lg:min-h-17 lg:gap-6 lg:px-8">
          <Logo to={PATHS.admin} label={areaLabel} className="text-body-lg lg:text-lg" />
          <div className="hidden lg:block">
            <TopNav items={items} label={areaLabel} />
          </div>
          <span className="grow" />
          <span className="hidden min-h-control-md items-center rounded-full border border-border px-3 font-semibold lg:inline-flex">
            {roleLabel}
          </span>
          <SettingsMenu />
          <AccountControls user={user} />
          <MobileMenu className="lg:hidden">
            <MenuNav items={items} label={areaLabel} />
          </MobileMenu>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
