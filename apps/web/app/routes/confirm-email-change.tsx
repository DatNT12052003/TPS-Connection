import { Form, Link } from 'react-router';
import type { Route } from './+types/confirm-email-change';
import {
  AuthPage,
  Notice,
  privatePageMeta,
  SubmitButton,
  useFragmentToken,
} from '~/components/auth-ui';
import { publicApi } from '~/lib/api.server';
import { localeOf, translate } from '~/lib/i18n';

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'emailChange.title');

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const { response } = await publicApi().POST('/api/v1/auth/email-change/confirm', {
    body: { token: String(form.get('token') ?? '') },
  });
  return { ok: response.ok };
}

export default function ConfirmEmailChange({ params, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  const token = useFragmentToken();

  if (actionData?.ok) {
    return (
      <AuthPage locale={locale} title="emailChange.title">
        <Notice>{translate(locale, 'emailChange.done')}</Notice>
        <p className="mt-4">
          <Link className="underline" to={`/${locale}/account`}>
            {translate(locale, 'verify.continue')}
          </Link>
        </p>
      </AuthPage>
    );
  }
  if (token === undefined) {
    return (
      <AuthPage locale={locale} title="emailChange.title">
        {null}
      </AuthPage>
    );
  }
  if (!token || actionData) {
    return (
      <AuthPage locale={locale} title="emailChange.title">
        <p role="alert" className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-red-800">
          {translate(locale, 'emailChange.invalid')}
        </p>
      </AuthPage>
    );
  }
  // Waits for a press rather than acting on load: mail scanners open links too.
  return (
    <AuthPage locale={locale} title="emailChange.title">
      <p className="mt-4">{translate(locale, 'emailChange.intro')}</p>
      <Form method="post">
        <input type="hidden" name="token" value={token} />
        <SubmitButton locale={locale} label="emailChange.submit" />
      </Form>
    </AuthPage>
  );
}
