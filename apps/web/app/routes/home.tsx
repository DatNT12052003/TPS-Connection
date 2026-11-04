import { Link } from 'react-router';
import type { Route } from './+types/home';
import { publicApi } from '~/lib/api.server';
import { DEFAULT_LOCALE, isLocale, LOCALES, translate, type Locale } from '~/lib/i18n';

export async function loader({ params }: Route.LoaderArgs) {
  const locale: Locale = isLocale(params.lang) ? params.lang : DEFAULT_LOCALE;
  const { data, error } = await publicApi().GET('/api/v1/catalog/subjects');
  if (error || !data) throw new Response('Unavailable', { status: 503 });
  return { locale, subjects: data.data };
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
  const locale = loaderData?.locale ?? DEFAULT_LOCALE;
  return [
    { title: translate(locale, 'meta.title') },
    { name: 'description', content: translate(locale, 'meta.description') },
    ...LOCALES.map((hrefLang) => ({
      tagName: 'link',
      rel: 'alternate',
      hrefLang,
      href: `/${hrefLang}`,
    })),
  ];
};

export default function Home({ loaderData }: Route.ComponentProps) {
  const { locale, subjects } = loaderData;
  const otherLocale: Locale = locale === 'vi' ? 'en' : 'vi';
  return (
    <main className="mx-auto max-w-2xl p-4">
      <nav className="flex justify-end gap-4">
        <Link className="underline" to={`/${locale}/login`}>
          {translate(locale, 'nav.login')}
        </Link>
        <Link className="underline" to={`/${locale}/register`}>
          {translate(locale, 'nav.register')}
        </Link>
        <Link className="underline" to={`/${otherLocale}`} hrefLang={otherLocale}>
          {translate(locale, 'language.switch')}
        </Link>
      </nav>
      <h1 className="mt-4 text-3xl font-semibold">{translate(locale, 'home.heading')}</h1>
      <h2 className="mt-8 text-xl font-medium">{translate(locale, 'home.subjects')}</h2>
      {subjects.length === 0 ? (
        <p className="mt-2">{translate(locale, 'home.subjectsEmpty')}</p>
      ) : (
        <ul className="mt-2 list-disc pl-5">
          {subjects.map((subject) => (
            <li key={subject.id}>{locale === 'vi' ? subject.nameVi : subject.nameEn}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
