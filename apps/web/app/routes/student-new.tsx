import { Link, redirect } from 'react-router';
import type { Route } from './+types/student-new';
import { AuthPage, privatePageMeta } from '~/components/auth-ui';
import { StudentForm } from '~/components/student-form';
import { formApi, publicApi } from '~/lib/api.server';
import { toFormResult } from '~/lib/form-errors';
import { localeOf, translate } from '~/lib/i18n';
import { csrfTokenOf, redirectToRefresh, requireAccount } from '~/lib/session.server';

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'students.newTitle');

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': 'private, no-store' });

export async function loader({ request, params }: Route.LoaderArgs) {
  const account = await requireAccount(request);
  if (account.role !== 'parent' || !account.emailVerified) {
    throw redirect(`/${localeOf(params.lang)}/account/students`);
  }
  const { data } = await publicApi().GET('/api/v1/catalog/grades');
  if (!data) throw new Response('Unavailable', { status: 503 });
  return { grades: data.data, csrf: csrfTokenOf(request) };
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const fullName = String(form.get('fullName') ?? '').trim();
  const { error, response } = await formApi(request, form).POST('/api/v1/students', {
    body: {
      nickname: String(form.get('nickname') ?? ''),
      ...(fullName ? { fullName } : {}),
      gradeId: String(form.get('gradeId') ?? ''),
      acceptedOnBehalf: (form.get('acceptedOnBehalf') === 'on') as true,
    },
  });
  if (response.status === 401) throw redirectToRefresh(request);
  if (response.ok) return redirect(`/${localeOf(params.lang)}/account/students`);
  return toFormResult(error);
}

export default function StudentNew({ params, loaderData, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  return (
    <AuthPage locale={locale} title="students.newTitle">
      <p className="mt-2">
        <Link className="underline" to={`/${locale}/account/students`}>
          {translate(locale, 'students.title')}
        </Link>
      </p>
      <StudentForm
        locale={locale}
        csrf={loaderData.csrf}
        grades={loaderData.grades}
        result={actionData}
      />
    </AuthPage>
  );
}
