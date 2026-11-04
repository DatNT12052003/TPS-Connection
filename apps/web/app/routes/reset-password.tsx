import { Form, Link } from 'react-router';
import type { Route } from './+types/reset-password';
import {
  AuthPage,
  FormAlert,
  Notice,
  privatePageMeta,
  SubmitButton,
  TextField,
  useFragmentToken,
} from '~/components/auth-ui';
import { publicApi } from '~/lib/api.server';
import { toFormResult } from '~/lib/form-errors';
import { localeOf, translate } from '~/lib/i18n';

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'reset.title');

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const { error, response } = await publicApi().POST('/api/v1/auth/password/reset', {
    body: {
      token: String(form.get('token') ?? ''),
      newPassword: String(form.get('newPassword') ?? ''),
    },
  });
  if (response.ok) return { ok: true as const };
  if (response.status === 422) return { ...toFormResult(error), invalidLink: true as const };
  return toFormResult(error);
}

export default function ResetPassword({ params, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  const token = useFragmentToken();

  if (actionData?.ok) {
    return (
      <AuthPage locale={locale} title="reset.title">
        <Notice>{translate(locale, 'reset.done')}</Notice>
        <p className="mt-4">
          <Link className="underline" to={`/${locale}/login`}>
            {translate(locale, 'nav.login')}
          </Link>
        </p>
      </AuthPage>
    );
  }
  // Nothing to show until the fragment has been read in the browser.
  if (token === undefined)
    return (
      <AuthPage locale={locale} title="reset.title">
        {null}
      </AuthPage>
    );

  if (!token || (actionData && 'invalidLink' in actionData)) {
    return (
      <AuthPage locale={locale} title="reset.title">
        <p role="alert" className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-red-800">
          {translate(locale, 'reset.invalid')}
        </p>
        <p className="mt-4">
          <Link className="underline" to={`/${locale}/forgot-password`}>
            {translate(locale, 'reset.requestAgain')}
          </Link>
        </p>
      </AuthPage>
    );
  }
  return (
    <AuthPage locale={locale} title="reset.title">
      <FormAlert locale={locale} result={actionData} />
      <Form method="post">
        <input type="hidden" name="token" value={token} />
        <TextField
          locale={locale}
          name="newPassword"
          label="field.newPassword"
          type="password"
          autoComplete="new-password"
          hint="field.passwordHint"
          result={actionData}
        />
        <SubmitButton locale={locale} label="reset.submit" />
      </Form>
    </AuthPage>
  );
}
