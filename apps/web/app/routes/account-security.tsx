import { Form, Link } from 'react-router';
import type { Route } from './+types/account-security';
import {
  AuthPage,
  CsrfField,
  FormAlert,
  Notice,
  privatePageMeta,
  SubmitButton,
  TextField,
} from '~/components/auth-ui';
import { formApi } from '~/lib/api.server';
import { toFormResult, type FormResult } from '~/lib/form-errors';
import { localeOf, translate } from '~/lib/i18n';
import { csrfTokenOf, redirectToRefresh, requireAccount } from '~/lib/session.server';

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'security.title');

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': 'private, no-store' });

export async function loader({ request }: Route.LoaderArgs) {
  return { account: await requireAccount(request), csrf: csrfTokenOf(request) };
}

type Result = (FormResult & { intent: string }) | { ok: true; intent: string };

export async function action({ request }: Route.ActionArgs): Promise<Result> {
  const form = await request.formData();
  const api = formApi(request, form);
  const currentPassword = String(form.get('currentPassword') ?? '');

  if (form.get('intent') === 'email') {
    const { error, response } = await api.POST('/api/v1/me/email-change', {
      body: { newEmail: String(form.get('newEmail') ?? ''), currentPassword },
    });
    if (response.status === 401) throw redirectToRefresh(request);
    if (response.ok) return { ok: true, intent: 'email' };
    return { ...toFormResult(error), intent: 'email' };
  }

  const { error, response } = await api.POST('/api/v1/me/password', {
    body: { currentPassword, newPassword: String(form.get('newPassword') ?? '') },
  });
  if (response.status === 401) throw redirectToRefresh(request);
  if (response.ok) return { ok: true, intent: 'password' };
  return { ...toFormResult(error), intent: 'password' };
}

export default function Security({ params, loaderData, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  const { account, csrf } = loaderData;
  const passwordResult = actionData?.intent === 'password' ? actionData : undefined;
  const emailResult = actionData?.intent === 'email' ? actionData : undefined;

  return (
    <AuthPage locale={locale} title="security.title">
      <p className="mt-2">
        <Link className="underline" to={`/${locale}/account`}>
          {translate(locale, 'nav.back')}
        </Link>
      </p>

      <h2 className="mt-6 text-xl font-medium">{translate(locale, 'security.passwordHeading')}</h2>
      {passwordResult?.ok && <Notice>{translate(locale, 'security.passwordDone')}</Notice>}
      <FormAlert locale={locale} result={passwordResult as FormResult | undefined} />
      <Form method="post" id="password-form">
        <CsrfField token={csrf} />
        <input type="hidden" name="intent" value="password" />
        <TextField
          locale={locale}
          name="currentPassword"
          label="security.currentPassword"
          type="password"
          autoComplete="current-password"
          result={passwordResult as FormResult | undefined}
        />
        <TextField
          locale={locale}
          name="newPassword"
          label="field.newPassword"
          type="password"
          autoComplete="new-password"
          hint="field.passwordHint"
          result={passwordResult as FormResult | undefined}
        />
        <SubmitButton locale={locale} label="security.passwordSubmit" />
      </Form>

      <h2 className="mt-8 text-xl font-medium">{translate(locale, 'security.emailHeading')}</h2>
      <p className="mt-2 text-slate-600">
        {translate(locale, 'security.emailCurrent')}: {account.email}
      </p>
      {emailResult?.ok && <Notice>{translate(locale, 'security.emailDone')}</Notice>}
      <FormAlert locale={locale} result={emailResult as FormResult | undefined} />
      <Form method="post" id="email-form">
        <CsrfField token={csrf} />
        <input type="hidden" name="intent" value="email" />
        <TextField
          locale={locale}
          name="newEmail"
          label="security.newEmail"
          type="email"
          autoComplete="email"
          result={emailResult as FormResult | undefined}
        />
        <TextField
          locale={locale}
          idSuffix="email"
          name="currentPassword"
          label="security.currentPassword"
          type="password"
          autoComplete="current-password"
          result={emailResult as FormResult | undefined}
        />
        <SubmitButton locale={locale} label="security.emailSubmit" />
      </Form>
    </AuthPage>
  );
}
