// Bố cục các trang tài khoản, theo canvas giao diện (D52):
// - AuthSplitLayout (Register, Login): khung thương hiệu nền màu chính bên trái, form bên phải; dưới
//   1024 px khung thương hiệu thu thành thanh logo phía trên (RegisterMobile).
// - AuthCenteredLayout (VerifyEmail, ForgotPassword): thanh trên có logo và nút Đăng nhập, nội dung ở giữa.
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Logo } from '~/components/brand/logo';
import { buttonVariants } from '~/components/ui/button';
import { PATHS } from '~/lib/navigation';
import { cn } from '~/lib/utils';
import { SkipLink } from './page';
import { SettingsMenu } from './settings-menu';

interface AuthSplitLayoutProps {
  title: string;
  points: string[];
  children: ReactNode;
}

export function AuthSplitLayout({ title, points, children }: AuthSplitLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col bg-surface lg:flex-row">
      <SkipLink label={t('layout.skipToContent')} />
      <aside className="hidden flex-col justify-between gap-8 bg-primary p-12 text-primary-foreground lg:flex lg:w-5/12">
        <Logo to={PATHS.home} tone="inverse" />
        <div className="flex flex-col gap-6">
          <p className="max-w-[15ch] text-display">{title}</p>
          <ul className="flex flex-col gap-4">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-body-lg">
                <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-small">{t('auth.brandFree')}</p>
      </aside>

      <header className="flex items-center justify-between border-b border-border px-4 lg:hidden">
        <Logo to={PATHS.home} className="text-body-lg" />
        <SettingsMenu />
      </header>

      <main
        id="main"
        className="relative flex flex-1 flex-col items-center justify-center gap-8 px-4 py-8 md:px-8 lg:py-12"
      >
        {/* Máy tính: bánh răng góc phải trên của vùng form (điện thoại: ở thanh logo phía trên). */}
        <SettingsMenu className="absolute top-4 right-4 hidden lg:block" />
        <div className="flex w-full max-w-110 flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}

export function AuthCenteredLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink label={t('layout.skipToContent')} />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-15 max-w-page items-center gap-1 px-4 sm:gap-2 md:px-6 lg:min-h-17 lg:px-8">
          <Logo to={PATHS.home} className="text-body-lg lg:text-lg" />
          <span className="grow" />
          <Link
            to={PATHS.login}
            className={cn(buttonVariants({ variant: 'secondary' }), 'max-sm:px-2')}
          >
            {t('layout.login')}
          </Link>
          <SettingsMenu />
        </div>
      </header>
      <main
        id="main"
        className="mx-auto flex w-full max-w-page flex-1 flex-col items-center gap-6 px-4 py-8 md:px-6 lg:py-10"
      >
        {children}
      </main>
    </div>
  );
}
