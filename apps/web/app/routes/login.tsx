import { Form, Link, redirect } from 'react-router';
import type { Route } from './+types/login';
import {
  AuthPage,
  FormAlert,
  privatePageMeta,
  SubmitButton,
  TextField,
} from '~/components/auth-ui';
import { publicApi } from '~/lib/api.server';
import { toFormResult } from '~/lib/form-errors';
import { DEFAULT_LOCALE, isLocale, translate, type Locale } from '~/lib/i18n';
import { relaySetCookies } from '~/lib/session.server';

const localeOf = (lang: string | undefined): Locale => (isLocale(lang) ? lang : DEFAULT_LOCALE);

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'login.title');

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const { error, response } = await publicApi().POST('/api/v1/auth/login', {
    body: {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    },
  });
  if (response.ok) {
    return redirect(`/${localeOf(params.lang)}/account`, { headers: relaySetCookies(response) });
  }
  return toFormResult(error);
}

export default function Login({ params, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  return (
    <AuthPage locale={locale} title="login.title">
      <FormAlert locale={locale} result={actionData} />
      <Form method="post">
        <TextField
          locale={locale}
          name="email"
          label="field.email"
          type="email"
          autoComplete="username"
          result={actionData}
        />
        <TextField
          locale={locale}
          name="password"
          label="field.password"
          type="password"
          autoComplete="current-password"
          result={actionData}
        />
        <SubmitButton locale={locale} label="login.submit" />
      </Form>
      <p className="mt-4">
        <Link className="underline" to={`/${locale}/forgot-password`}>
          {translate(locale, 'login.forgot')}
        </Link>
      </p>
      <p className="mt-2">
        {translate(locale, 'login.noAccount')}{' '}
        <Link className="underline" to={`/${locale}/register`}>
          {translate(locale, 'nav.register')}
        </Link>
      </p>
    </AuthPage>
  );
}
