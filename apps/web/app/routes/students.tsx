import { Link } from 'react-router';
import type { Route } from './+types/students';
import { AuthPage, privatePageMeta } from '~/components/auth-ui';
import { userApi } from '~/lib/api.server';
import { localeOf, translate } from '~/lib/i18n';
import { redirectToRefresh } from '~/lib/session.server';

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'students.title');

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': 'private, no-store' });

export async function loader({ request }: Route.LoaderArgs) {
  const requested = Number(new URL(request.url).searchParams.get('page'));
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const { data, error, response } = await userApi(request).GET('/api/v1/students', {
    params: { query: { page, limit: 20 } },
  });
  if (response.status === 401) throw redirectToRefresh(request);
  if (data) return { refused: null, students: data.data, page: data.page };
  if (response.status === 403) {
    return {
      refused: error?.code === 'EMAIL_NOT_VERIFIED' ? 'email' : 'role',
      students: [],
      page: null,
    };
  }
  throw new Response('Unavailable', { status: 503 });
}

export default function Students({ params, loaderData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  const { refused, students, page } = loaderData;
  const hasNext = page ? page.number * page.limit < page.total : false;

  return (
    <AuthPage locale={locale} title="students.title">
      <p className="mt-2">
        <Link className="underline" to={`/${locale}/account`}>
          {translate(locale, 'nav.back')}
        </Link>
      </p>
      {refused ? (
        <p role="alert" className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">
          {translate(locale, refused === 'email' ? 'students.verifyFirst' : 'students.parentsOnly')}
        </p>
      ) : (
        <>
          <p className="mt-4">{translate(locale, 'students.intro')}</p>
          {students.length === 0 ? (
            <p className="mt-4 text-slate-600">{translate(locale, 'students.empty')}</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-200">
              {students.map((student) => (
                <li key={student.id} className="py-2">
                  <Link className="underline" to={`/${locale}/account/students/${student.id}`}>
                    {student.nickname}
                  </Link>{' '}
                  <span className="text-slate-600">
                    {locale === 'vi' ? student.gradeNameVi : student.gradeNameEn}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <nav className="mt-4 flex justify-between">
            {page && page.number > 1 ? (
              <Link className="underline" to={`?page=${page.number - 1}`}>
                {translate(locale, 'students.prevPage')}
              </Link>
            ) : (
              <span />
            )}
            {hasNext && page && (
              <Link className="underline" to={`?page=${page.number + 1}`}>
                {translate(locale, 'students.nextPage')}
              </Link>
            )}
          </nav>
          <Link
            className="mt-6 block rounded bg-slate-900 p-2 text-center font-medium text-white"
            to={`/${locale}/account/students/new`}
          >
            {translate(locale, 'students.add')}
          </Link>
        </>
      )}
    </AuthPage>
  );
}
