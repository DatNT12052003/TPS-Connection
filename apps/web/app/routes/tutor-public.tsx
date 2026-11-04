import { Link } from 'react-router';
import type { Route } from './+types/tutor-public';
import { publicApi } from '~/lib/api.server';
import { localeOf, LOCALES, translate, type Locale } from '~/lib/i18n';
import { formatVnd, shortDescription } from '~/lib/tutor-form';

export const headers: Route.HeadersFunction = () => ({
  // Short, because the signed avatar URL in the page runs out after 15 minutes.
  'Cache-Control': 'public, max-age=60',
});

export async function loader({ params }: Route.LoaderArgs) {
  // Sends no cookie, so a page that may be cached can never hold one visitor's data.
  const { data } = await publicApi().GET('/api/v1/public/tutors/{id}', {
    params: { path: { id: params.id } },
  });
  // Covers unknown, unverified, revoked and deleted tutors, and malformed IDs alike.
  if (!data) throw new Response('Not found', { status: 404 });
  return { tutor: data };
}

export const meta: Route.MetaFunction = ({ loaderData, params }) => {
  const locale = localeOf(params.lang);
  if (!loaderData) return [{ title: translate(locale, 'error.notFound') }];
  const { tutor } = loaderData;
  const subjects = tutor.subjects.map((s) => (locale === 'vi' ? s.nameVi : s.nameEn)).join(', ');
  return [
    { title: `${tutor.displayName} - ${subjects} | TPS-Connection` },
    { name: 'description', content: shortDescription(tutor.introduction) },
    ...LOCALES.map((hrefLang) => ({
      tagName: 'link',
      rel: 'alternate',
      hrefLang,
      href: `/${hrefLang}/tutors/${tutor.id}`,
    })),
  ];
};

const names = (items: { nameVi: string; nameEn: string }[], locale: Locale) =>
  items.map((item) => (locale === 'vi' ? item.nameVi : item.nameEn)).join(', ');

export default function TutorPublic({ params, loaderData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  const { tutor } = loaderData;
  const otherLocale: Locale = locale === 'vi' ? 'en' : 'vi';
  const facts: [string, string][] = [
    [translate(locale, 'tutor.subjects'), names(tutor.subjects, locale)],
    [translate(locale, 'tutor.grades'), names(tutor.grades, locale)],
    [translate(locale, 'public.province'), names(tutor.provinces, locale)],
    [
      translate(locale, 'tutor.modes'),
      tutor.teachingModes
        .map((mode) =>
          translate(locale, mode === 'online' ? 'tutor.modeOnline' : 'tutor.modeOffline'),
        )
        .join(', '),
    ],
    [
      translate(locale, 'public.price'),
      `${formatVnd(tutor.pricePerLessonVnd, locale)} / ${tutor.lessonMinutes} ${translate(locale, 'public.minutes')}`,
    ],
  ];
  const sections: [string, string | null][] = [
    [translate(locale, 'tutor.introduction'), tutor.introduction],
    [translate(locale, 'tutor.experience'), tutor.experience],
    [translate(locale, 'tutor.method'), tutor.teachingMethod],
  ];

  return (
    <main className="mx-auto w-full max-w-2xl p-4">
      <nav className="flex justify-between">
        <Link className="font-semibold" to={`/${locale}`}>
          TPS-Connection
        </Link>
        <Link
          className="underline"
          to={`/${otherLocale}/tutors/${tutor.id}`}
          hrefLang={otherLocale}
          reloadDocument
        >
          {translate(locale, 'language.switch')}
        </Link>
      </nav>
      <header className="mt-6 flex items-center gap-4">
        {tutor.avatarUrl && (
          <img
            className="h-24 w-24 rounded-full object-cover"
            src={tutor.avatarUrl}
            alt=""
            width={96}
            height={96}
          />
        )}
        <div>
          <h1 className="text-2xl font-semibold">{tutor.displayName}</h1>
          <p className="mt-1 inline-block rounded bg-green-100 px-2 py-0.5 text-sm text-green-900">
            ✓ {translate(locale, 'public.identityVerified')}
          </p>
        </div>
      </header>
      {!tutor.acceptingStudents && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">
          {translate(locale, 'public.notAccepting')}
        </p>
      )}
      <p className="mt-4 text-sm text-slate-600">{translate(locale, 'public.selfDeclared')}</p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="font-medium">{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {sections.map(
        ([heading, body]) =>
          body && (
            <section key={heading} className="mt-4">
              <h2 className="text-xl font-medium">{heading}</h2>
              <p className="mt-1 whitespace-pre-line">{body}</p>
            </section>
          ),
      )}
    </main>
  );
}
