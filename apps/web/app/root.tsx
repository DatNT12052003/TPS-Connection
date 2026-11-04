import type { ReactNode } from 'react';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useParams,
} from 'react-router';
import type { Route } from './+types/root';
import { DEFAULT_LOCALE, isLocale, translate } from '~/lib/i18n';
import './app.css';

const useLocale = () => {
  const { lang } = useParams();
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
};

export function Layout({ children }: { children: ReactNode }) {
  const locale = useLocale();
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-white text-slate-900">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const locale = useLocale();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="text-2xl font-semibold">{translate(locale, 'error.title')}</h1>
      <p className="mt-2">{translate(locale, notFound ? 'error.notFound' : 'error.unavailable')}</p>
    </main>
  );
}
