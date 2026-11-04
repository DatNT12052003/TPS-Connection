import { Form, Link } from 'react-router';
import type { Route } from './+types/verify-email';
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
  privatePageMeta(localeOf(params.lang), 'verify.title');

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();

  if (form.get('intent') === 'resend') {
    const { error, response } = await publicApi().POST('/api/v1/auth/email-verification/resend', {
      body: { email: String(form.get('email') ?? '') },
    });
    if (response.ok) return { ok: true as const, step: 'resent' as const };
    return { ...toFormResult(error), step: 'resend' as const };
  }

  const { response } = await publicApi().POST('/api/v1/auth/email-verification/confirm', {
    body: { token: String(form.get('token') ?? '') },
  });
  if (response.ok) return { ok: true as const, step: 'verified' as const };
  return { ok: false as const, fieldErrors: {}, step: 'invalid' as const };
}

export default function VerifyEmail({ params, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  const token = useFragmentToken();

  if (actionData?.ok && actionData.step === 'verified') {
    return (
      <AuthPage locale={locale} title="verify.title">
        <Notice>{translate(locale, 'verify.done')}</Notice>
        <p className="mt-4">
          <Link className="underline" to={`/${locale}/account`}>
            {translate(locale, 'verify.continue')}
          </Link>
        </p>
      </AuthPage>
    );
  }
  if (actionData?.ok && actionData.step === 'resent') {
    return (
      <AuthPage locale={locale} title="verify.title">
        <Notice>{translate(locale, 'verify.resent')}</Notice>
      </AuthPage>
    );
  }

  // Waits for a press rather than verifying on load: mail scanners open links too.
  if (token && actionData?.step !== 'invalid' && actionData?.step !== 'resend') {
    return (
      <AuthPage locale={locale} title="verify.title">
        <p className="mt-4">{translate(locale, 'verify.intro')}</p>
        <Form method="post">
          <input type="hidden" name="token" value={token} />
          <SubmitButton locale={locale} label="verify.submit" />
        </Form>
      </AuthPage>
    );
  }
  // Nothing to show until the fragment has been read in the browser.
  if (token === undefined)
    return (
      <AuthPage locale={locale} title="verify.title">
        {null}
      </AuthPage>
    );

  return (
    <AuthPage locale={locale} title="verify.title">
      <p role="alert" className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-red-800">
        {translate(locale, 'verify.invalid')}
      </p>
      <FormAlert locale={locale} result={actionData} />
      <p className="mt-4">{translate(locale, 'verify.resendIntro')}</p>
      <Form method="post">
        <input type="hidden" name="intent" value="resend" />
        <TextField
          locale={locale}
          name="email"
          label="field.email"
          type="email"
          autoComplete="email"
          result={actionData}
        />
        <SubmitButton locale={locale} label="verify.resend" />
      </Form>
    </AuthPage>
  );
}
