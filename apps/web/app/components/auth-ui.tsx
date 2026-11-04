import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigation } from 'react-router';
import type { FormResult } from '~/lib/form-errors';
import { translate, type Locale, type MessageKey } from '~/lib/i18n';

/** Signed-in and token pages: stay out of search engines and out of Referer headers. */
export const privatePageMeta = (locale: Locale, title: MessageKey) => [
  { title: `${translate(locale, title)} | TPS-Connection` },
  { name: 'robots', content: 'noindex, nofollow' },
  { name: 'referrer', content: 'no-referrer' },
];

export function AuthPage({
  locale,
  title,
  children,
}: {
  locale: Locale;
  title: MessageKey;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const otherLocale: Locale = locale === 'vi' ? 'en' : 'vi';
  const otherPath = pathname.replace(/^\/[^/]+/, `/${otherLocale}`);
  return (
    <main className="mx-auto w-full max-w-md p-4">
      <nav className="flex justify-between">
        <Link className="font-semibold" to={`/${locale}`}>
          TPS-Connection
        </Link>
        <Link className="underline" to={otherPath} hrefLang={otherLocale} reloadDocument>
          {translate(locale, 'language.switch')}
        </Link>
      </nav>
      <h1 className="mt-6 text-2xl font-semibold">{translate(locale, title)}</h1>
      {children}
    </main>
  );
}

export function TextField({
  locale,
  name,
  label,
  type = 'text',
  autoComplete,
  hint,
  defaultValue,
  result,
}: {
  locale: Locale;
  name: string;
  label: MessageKey;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  hint?: MessageKey;
  defaultValue?: string;
  result?: FormResult | { ok: true };
}) {
  const error = result && !result.ok ? result.fieldErrors[name] : undefined;
  const describedBy = [hint && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(' ');
  return (
    <div className="mt-4">
      <label className="block font-medium" htmlFor={name}>
        {translate(locale, label)}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="mt-1 w-full rounded border border-slate-400 p-2"
      />
      {hint && (
        <p id={`${name}-hint`} className="mt-1 text-sm text-slate-600">
          {translate(locale, hint)}
        </p>
      )}
      <FieldError id={`${name}-error`} locale={locale} message={error} />
    </div>
  );
}

export function FieldError({
  id,
  locale,
  message,
}: {
  id: string;
  locale: Locale;
  message?: MessageKey;
}) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-700">
      {translate(locale, message)}
    </p>
  );
}

export function FormAlert({
  locale,
  result,
}: {
  locale: Locale;
  result?: FormResult | { ok: true };
}) {
  if (!result || result.ok || !result.formError) return null;
  return (
    <p role="alert" className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-red-800">
      {translate(locale, result.formError)}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-green-900"
    >
      {children}
    </p>
  );
}

export function SubmitButton({ locale, label }: { locale: Locale; label: MessageKey }) {
  const pending = useNavigation().state !== 'idle';
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 w-full rounded bg-slate-900 p-2 font-medium text-white disabled:opacity-60"
    >
      {translate(locale, pending ? 'form.pending' : label)}
    </button>
  );
}

/**
 * Emailed links carry their token in the URL fragment, which browsers do not
 * send to servers, so it stays out of access logs. Answers undefined until read,
 * and an empty string when the link has no token. Also removes it from the address bar.
 */
export function useFragmentToken(): string | undefined {
  const [token, setToken] = useState<string>();
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    setToken((current) => current ?? value ?? '');
    if (value) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);
  return token;
}
