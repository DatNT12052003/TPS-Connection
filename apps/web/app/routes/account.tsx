import { Form, Link } from 'react-router';
import type { Route } from './+types/account';
import { AuthPage, FormAlert, Notice, privatePageMeta, SubmitButton } from '~/components/auth-ui';
import { publicApi } from '~/lib/api.server';
import { toFormResult } from '~/lib/form-errors';
import { localeOf, translate } from '~/lib/i18n';
import { requireAccount } from '~/lib/session.server';

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'account.title');

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': 'private, no-store' });

export async function loader({ request }: Route.LoaderArgs) {
  return { account: await requireAccount(request) };
}

export async function action({ request }: Route.ActionArgs) {
  const { email } = await requireAccount(request);
  const { error, response } = await publicApi().POST('/api/v1/auth/email-verification/resend', {
    body: { email },
  });
  if (response.ok) return { ok: true as const };
  return toFormResult(error);
}

export default function Account({ params, loaderData, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  const { account } = loaderData;
  return (
    <AuthPage locale={locale} title="account.title">
      {!account.emailVerified && (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">
          <p>{translate(locale, 'account.unverified')}</p>
          {actionData?.ok ? (
            <Notice>{translate(locale, 'verify.resent')}</Notice>
          ) : (
            <Form method="post">
              <FormAlert locale={locale} result={actionData} />
              <SubmitButton locale={locale} label="verify.resend" />
            </Form>
          )}
        </div>
      )}
      <p className="mt-4">
        {translate(locale, 'account.greeting')}, {account.displayName}
      </p>
      <p className="text-slate-600">{account.email}</p>
      <ul className="mt-6 space-y-2">
        <li>
          <Link className="underline" to={`/${locale}/account/profile`}>
            {translate(locale, 'account.profile')}
          </Link>
        </li>
        <li>
          <Link className="underline" to={`/${locale}/account/security`}>
            {translate(locale, 'account.security')}
          </Link>
        </li>
        {account.role === 'tutor' && (
          <li>
            <Link className="underline" to={`/${locale}/account/tutor-profile`}>
              {translate(locale, 'account.tutorProfile')}
            </Link>
          </li>
        )}
        {account.role === 'admin' && (
          <li>
            <Link className="underline" to={`/${locale}/admin/catalog`}>
              {translate(locale, 'account.adminCatalog')}
            </Link>
          </li>
        )}
        {account.role === 'parent' && (
          <li>
            <Link className="underline" to={`/${locale}/account/students`}>
              {translate(locale, 'account.students')}
            </Link>
          </li>
        )}
      </ul>
      {/* A full page post, so that the browser includes the refresh cookie and takes the reply. */}
      <form method="post" action="/api/v1/auth/logout" className="mt-6">
        <input type="hidden" name="lang" value={locale} />
        <button type="submit" className="underline">
          {translate(locale, 'account.logout')}
        </button>
      </form>
    </AuthPage>
  );
}
