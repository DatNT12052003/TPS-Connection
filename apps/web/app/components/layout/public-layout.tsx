// Khu công khai (SSR cho SEO): thanh trên + chân trang. Theo canvas: Main / MainMobile.
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Logo } from '~/components/brand/logo';
import { buttonVariants } from '~/components/ui/button';
import { PATHS, PUBLIC_NAV } from '~/lib/navigation';
import { cn } from '~/lib/utils';
import { MobileMenu } from './mobile-menu';
import { MenuNav, TopNav } from './nav-links';
import { SkipLink } from './page';
import { PreferencesControls } from './preferences-controls';

export function PublicLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink label={t('layout.skipToContent')} />
      <header className="relative border-b border-border bg-surface">
        <div className="mx-auto flex min-h-15 max-w-page items-center gap-2 px-4 md:px-6 lg:min-h-17 lg:gap-6 lg:px-8">
          <Logo to={PATHS.home} className="text-body-lg lg:text-lg" />
          <div className="hidden lg:block">
            <TopNav items={PUBLIC_NAV} label={t('layout.primaryNav')} />
          </div>
          <span className="grow" />
          <div className="hidden items-center gap-2 lg:flex">
            <Link to={PATHS.login} className={buttonVariants({ variant: 'ghost' })}>
              {t('layout.login')}
            </Link>
            <Link to={PATHS.register} className={buttonVariants({ variant: 'primary' })}>
              {t('layout.register')}
            </Link>
          </div>
          <Link
            to={PATHS.login}
            className={cn(buttonVariants({ variant: 'ghost' }), 'px-3 lg:hidden')}
          >
            {t('layout.login')}
          </Link>
          <MobileMenu className="lg:hidden">
            <div className="flex flex-col gap-4">
              <MenuNav items={PUBLIC_NAV} label={t('layout.primaryNav')} />
              <Link
                to={PATHS.register}
                className={buttonVariants({ variant: 'primary', block: true })}
              >
                {t('layout.register')}
              </Link>
            </div>
          </MobileMenu>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}

const FOOTER_LINKS = [
  { to: PATHS.terms, label: 'layout.terms' },
  { to: PATHS.privacy, label: 'layout.privacy' },
  { to: PATHS.contact, label: 'layout.contact' },
  { to: PATHS.status, label: 'layout.systemStatus' },
] as const;

function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-page flex-col gap-4 px-4 py-6 md:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex flex-col gap-2">
          <p className="text-small text-muted-foreground">
            {t('layout.footerNote', { year: new Date().getFullYear() })}
          </p>
          <nav aria-label={t('layout.footerNav')}>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {FOOTER_LINKS.map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="inline-flex min-h-control-md items-center text-small font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t(label)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <PreferencesControls />
      </div>
    </footer>
  );
}
