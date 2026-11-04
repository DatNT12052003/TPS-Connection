import { Form, Link, redirect } from 'react-router';
import type { Route } from './+types/student-edit';
import { AuthPage, CsrfField, Notice, privatePageMeta } from '~/components/auth-ui';
import { StudentForm } from '~/components/student-form';
import { formApi, publicApi, userApi } from '~/lib/api.server';
import { toFormResult, type FormResult } from '~/lib/form-errors';
import { localeOf, translate } from '~/lib/i18n';
import { csrfTokenOf, redirectToRefresh } from '~/lib/session.server';

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'students.editTitle');

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': 'private, no-store' });

export async function loader({ request, params }: Route.LoaderArgs) {
  const { data: student, response } = await userApi(request).GET('/api/v1/students/{id}', {
    params: { path: { id: params.id } },
  });
  if (response.status === 401) throw redirectToRefresh(request);
  // Includes other parents' children and malformed IDs: nothing is revealed about either.
  if (!student) throw new Response('Not found', { status: 404 });

  const { data: grades } = await publicApi().GET('/api/v1/catalog/grades');
  if (!grades) throw new Response('Unavailable', { status: 503 });
  return { student, grades: grades.data, csrf: csrfTokenOf(request) };
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<FormResult | { ok: true } | Response> {
  const form = await request.formData();
  const api = formApi(request, form);
  const path = { id: params.id };

  if (form.get('intent') === 'delete') {
    const { error, response } = await api.DELETE('/api/v1/students/{id}', { params: { path } });
    if (response.status === 401) throw redirectToRefresh(request);
    if (response.ok) return redirect(`/${localeOf(params.lang)}/account/students`);
    return toFormResult(error);
  }

  const fullName = String(form.get('fullName') ?? '').trim();
  const { error, response } = await api.PATCH('/api/v1/students/{id}', {
    params: { path },
    body: {
      nickname: String(form.get('nickname') ?? ''),
      fullName: fullName === '' ? null : fullName,
      gradeId: String(form.get('gradeId') ?? ''),
    },
  });
  if (response.status === 401) throw redirectToRefresh(request);
  if (response.ok) return { ok: true };
  return toFormResult(error);
}

export default function StudentEdit({ params, loaderData, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  const { student, grades, csrf } = loaderData;
  const result = actionData && 'fieldErrors' in actionData ? actionData : undefined;
  const saved = actionData && 'ok' in actionData && actionData.ok;
  return (
    <AuthPage locale={locale} title="students.editTitle">
      <p className="mt-2">
        <Link className="underline" to={`/${locale}/account/students`}>
          {translate(locale, 'students.title')}
        </Link>
      </p>
      {saved && <Notice>{translate(locale, 'form.saved')}</Notice>}
      <StudentForm
        locale={locale}
        csrf={csrf}
        grades={grades}
        student={student}
        currentGradeName={locale === 'vi' ? student.gradeNameVi : student.gradeNameEn}
        result={result}
      />
      <Form method="post" className="mt-6">
        <CsrfField token={csrf} />
        <input type="hidden" name="intent" value="delete" />
        <button type="submit" className="text-red-700 underline">
          {translate(locale, 'students.delete')}
        </button>
      </Form>
    </AuthPage>
  );
}
