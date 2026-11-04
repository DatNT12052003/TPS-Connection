import { Form, Link } from 'react-router';
import type { Route } from './+types/register';
import {
  AuthPage,
  FieldError,
  FormAlert,
  Notice,
  privatePageMeta,
  SubmitButton,
  TextField,
} from '~/components/auth-ui';
import { publicApi } from '~/lib/api.server';
import { toFormResult } from '~/lib/form-errors';
import { DEFAULT_LOCALE, isLocale, translate, type Locale } from '~/lib/i18n';

const localeOf = (lang: string | undefined): Locale => (isLocale(lang) ? lang : DEFAULT_LOCALE);

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'register.title');

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const { error, response } = await publicApi().POST('/api/v1/auth/register', {
    // The API checks every value, including the role, so these casts decide nothing.
    body: {
      role: String(form.get('role')) as 'tutor' | 'parent',
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      displayName: String(form.get('displayName') ?? ''),
      locale: localeOf(params.lang),
      acceptedTerms: (form.get('acceptedTerms') === 'on') as true,
    },
  });
  if (response.ok) return { ok: true as const };
  return toFormResult(error);
}

export default function Register({ params, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  if (actionData?.ok) {
    return (
      <AuthPage locale={locale} title="register.done">
        <Notice>{translate(locale, 'register.doneBody')}</Notice>
      </AuthPage>
    );
  }
  const errors = actionData && !actionData.ok ? actionData.fieldErrors : {};
  return (
    <AuthPage locale={locale} title="register.title">
      <FormAlert locale={locale} result={actionData} />
      <Form method="post">
        <fieldset className="mt-4">
          <legend className="font-medium">{translate(locale, 'register.role')}</legend>
          <label className="mt-1 mr-6 inline-flex items-center gap-2">
            <input type="radio" name="role" value="parent" required />
            {translate(locale, 'register.roleParent')}
          </label>
          <label className="mt-1 inline-flex items-center gap-2">
            <input type="radio" name="role" value="tutor" required />
            {translate(locale, 'register.roleTutor')}
          </label>
          <FieldError id="role-error" locale={locale} message={errors.role} />
        </fieldset>
        <TextField
          locale={locale}
          name="displayName"
          label="field.displayName"
          autoComplete="nickname"
          result={actionData}
        />
        <TextField
          locale={locale}
          name="email"
          label="field.email"
          type="email"
          autoComplete="email"
          result={actionData}
        />
        <TextField
          locale={locale}
          name="password"
          label="field.password"
          type="password"
          autoComplete="new-password"
          hint="field.passwordHint"
          result={actionData}
        />
        <label className="mt-4 flex items-start gap-2">
          <input className="mt-1" type="checkbox" name="acceptedTerms" required />
          <span>{translate(locale, 'register.terms')}</span>
        </label>
        <FieldError id="terms-error" locale={locale} message={errors.acceptedTerms} />
        <SubmitButton locale={locale} label="register.submit" />
      </Form>
      <p className="mt-4">
        {translate(locale, 'register.haveAccount')}{' '}
        <Link className="underline" to={`/${locale}/login`}>
          {translate(locale, 'nav.login')}
        </Link>
      </p>
    </AuthPage>
  );
}
