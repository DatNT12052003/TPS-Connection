import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_LOCALE } from '@tps/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from 'react-router';
import type { Route } from './+types/root';
import './app.css';
import { ErrorContent } from './components/layout/error-content';
import { createI18n } from './lib/i18n';
import { readPreferences, type Preferences } from './lib/preferences';

export async function loader({ request }: Route.LoaderArgs) {
  return { preferences: await readPreferences(request) };
}

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap',
  },
];

const FALLBACK_PREFERENCES: Preferences = { locale: DEFAULT_LOCALE, theme: 'system' };

/** Khung tài liệu HTML, dùng cho cả trang thường và trang lỗi. */
export function Layout({ children }: { children: ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root');
  const { locale, theme } = data?.preferences ?? FALLBACK_PREFERENCES;
  return (
    // data-theme do server đặt theo cookie: không nháy màu khi tải trang. "system" thì để CSS tự theo hệ điều hành.
    <html lang={locale} {...(theme !== 'system' && { 'data-theme': theme })}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <Meta />
        <Links />
      </head>
      <body className="font-sans antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function Providers({ locale, children }: { locale: Preferences['locale']; children: ReactNode }) {
  const i18n = useMemo(() => createI18n(locale), [locale]);
  // Mỗi request SSR / mỗi phiên trình duyệt một QueryClient, không dùng chung giữa người dùng.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <Providers locale={loaderData.preferences.locale}>
      <Outlet />
    </Providers>
  );
}

/** Lỗi không route con nào bắt: 404 (không có trang, hoặc khu vực bị khóa ở production) và lỗi khác. */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const data = useRouteLoaderData<typeof loader>('root');
  const locale = data?.preferences.locale ?? DEFAULT_LOCALE;
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

  return (
    <Providers locale={locale}>
      <main id="main" className="flex min-h-dvh items-center">
        <ErrorContent kind={notFound ? 'notFound' : 'error'} stack={stack} />
      </main>
    </Providers>
  );
}
