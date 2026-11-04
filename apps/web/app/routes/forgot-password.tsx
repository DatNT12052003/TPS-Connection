import { Form } from 'react-router';
import type { Route } from './+types/forgot-password';
import {
  AuthPage,
  FormAlert,
  Notice,
  privatePageMeta,
  SubmitButton,
  TextField,
} from '~/components/auth-ui';
import { publicApi } from '~/lib/api.server';
import { toFormResult } from '~/lib/form-errors';
import { localeOf, translate } from '~/lib/i18n';

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'forgot.title');

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const { error, response } = await publicApi().POST('/api/v1/auth/password/forgot', {
    body: { email: String(form.get('email') ?? '') },
  });
  if (response.ok) return { ok: true as const };
  return toFormResult(error);
}

export default function ForgotPassword({ params, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  if (actionData?.ok) {
    return (
      <AuthPage locale={locale} title="forgot.title">
        <Notice>{translate(locale, 'forgot.done')}</Notice>
      </AuthPage>
    );
  }
  return (
    <AuthPage locale={locale} title="forgot.title">
      <p className="mt-4">{translate(locale, 'forgot.intro')}</p>
      <FormAlert locale={locale} result={actionData} />
      <Form method="post">
        <TextField
          locale={locale}
          name="email"
          label="field.email"
          type="email"
          autoComplete="email"
          result={actionData}
        />
        <SubmitButton locale={locale} label="forgot.submit" />
      </Form>
    </AuthPage>
  );
}
