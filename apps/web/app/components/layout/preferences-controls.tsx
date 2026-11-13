import type { Locale } from '@tps/shared';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Form, useLocation, useRouteLoaderData } from 'react-router';
import type { ThemePreference } from '~/lib/preferences';
import { cn } from '~/lib/utils';
import type { loader as rootLoader } from '~/root';

const LOCALES: Locale[] = ['vi', 'en'];
const THEMES = [
  { value: 'system', icon: Monitor, label: 'preferences.themeSystem' },
  { value: 'light', icon: Sun, label: 'preferences.themeLight' },
  { value: 'dark', icon: Moon, label: 'preferences.themeDark' },
] as const satisfies readonly { value: ThemePreference; icon: unknown; label: string }[];

const segment = cn(
  'inline-flex min-h-control-md min-w-control-md cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold',
  'text-muted-foreground hover:bg-surface-sunken hover:text-foreground',
  'aria-pressed:bg-primary-subtle aria-pressed:text-primary-subtle-foreground',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
);

/**
 * Chọn ngôn ngữ và chế độ màu. Gửi form POST /preferences (lưu cookie rồi quay lại trang hiện tại),
 * nên dùng được cả khi JavaScript chưa tải.
 */
export function PreferencesControls({ className }: { className?: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const root = useRouteLoaderData<typeof rootLoader>('root');
  const current = root?.preferences ?? { locale: 'vi', theme: 'system' };
  const redirectTo = location.pathname + location.search;

  return (
    <Form
      method="post"
      action="/preferences"
      preventScrollReset
      className={cn('flex flex-wrap items-center gap-x-6 gap-y-2', className)}
    >
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <fieldset className="flex items-center gap-1">
        <legend className="sr-only">{t('preferences.language')}</legend>
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="submit"
            name="locale"
            value={locale}
            lang={locale}
            aria-pressed={current.locale === locale}
            className={segment}
          >
            {t(`language.${locale}`)}
          </button>
        ))}
      </fieldset>
      <fieldset className="flex items-center gap-1">
        <legend className="sr-only">{t('preferences.theme')}</legend>
        {THEMES.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            type="submit"
            name="theme"
            value={value}
            aria-pressed={current.theme === value}
            aria-label={t(label)}
            title={t(label)}
            className={segment}
          >
            <Icon aria-hidden="true" className="size-4" />
          </button>
        ))}
      </fieldset>
    </Form>
  );
}
