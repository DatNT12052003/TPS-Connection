// /tutor-posts: bài tuyển học sinh đang mở (canvas PostList, PostListMobile). Khách xem được (C8); SSR cho SEO.
// Bộ lọc là form GET như trang tìm gia sư.
import { SEARCH_MAX_PAGE, TutorPostSearchResult, TutorPostSearchSort } from '@tps/shared';
import { Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Form, useSubmit } from 'react-router';
import { LocationFields } from '~/components/forms/location-fields';
import { PageContainer } from '~/components/layout/page';
import { Pagination } from '~/components/marketplace/pagination';
import { TutorPostCard } from '~/components/marketplace/tutor-post-card';
import { Alert } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { SelectField, TextField } from '~/components/ui/field';
import { labelOf } from '~/lib/catalog';
import { loadCatalogs, loadCommunes } from '~/lib/catalog.server';
import { pickQuery, sortKey } from '~/lib/marketplace';
import { emptyPage, searchOrEmpty } from '~/lib/marketplace.server';
import { messagesFromMatches } from '~/lib/meta';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import type { Route } from './+types/search';

const API_KEYS = [
  'q',
  'subjectId',
  'gradeLevelId',
  'mode',
  'provinceId',
  'communeId',
  'sort',
  'page',
] as const;

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [
    { title: `${m.postSearch.title} – ${m.common.appName}` },
    { name: 'description', content: m.postSearch.lead },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { locale } = await readPreferences(request);
  const provinceId = Number(url.searchParams.get('provinceId')) || null;
  const [catalogs, communes, search] = await Promise.all([
    loadCatalogs(context, locale),
    loadCommunes(context, locale, provinceId).catch(() => []),
    searchOrEmpty(
      getServerApi(context),
      '/api/v1/tutor-posts',
      pickQuery(url, API_KEYS),
      TutorPostSearchResult,
      emptyPage(),
    ),
  ]);
  return {
    ...search,
    catalogs,
    communes,
    filters: Object.fromEntries(
      API_KEYS.map((key) => [key, url.searchParams.get(key) ?? '']),
    ) as Record<(typeof API_KEYS)[number], string>,
  };
}

export default function TutorPostSearchPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const submit = useSubmit();
  const { result, invalidFilters, catalogs, communes, filters } = loaderData;
  const params = new URLSearchParams(
    Object.entries(filters).filter(([key, value]) => value && key !== 'page'),
  );
  const summary = [
    labelOf(catalogs.subjects, Number(filters.subjectId)),
    labelOf(catalogs.grades, Number(filters.gradeLevelId)),
    labelOf(catalogs.provinces, Number(filters.provinceId)),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <PageContainer>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('postSearch.title')}</h1>
        <p className="text-muted-foreground">{t('postSearch.lead')}</p>
      </div>

      <Form
        id="post-search"
        method="get"
        action="/tutor-posts"
        aria-label={t('postSearch.filtersLabel')}
        className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4"
      >
        <TextField
          name="q"
          type="search"
          maxLength={100}
          className="sm:col-span-2"
          label={t('tutorSearch.keyword')}
          placeholder={t('postSearch.keywordPlaceholder')}
          defaultValue={filters.q}
        />
        <SelectField
          name="subjectId"
          label={t('marketplace.subject')}
          defaultValue={filters.subjectId}
        >
          <option value="">{t('marketplace.all')}</option>
          {catalogs.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="gradeLevelId"
          label={t('marketplace.grade')}
          defaultValue={filters.gradeLevelId}
        >
          <option value="">{t('marketplace.all')}</option>
          {catalogs.grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </SelectField>
        <SelectField name="mode" label={t('marketplace.mode')} defaultValue={filters.mode}>
          <option value="">{t('marketplace.anyMode')}</option>
          <option value="in_person">{t('teachingMode.in_person')}</option>
          <option value="online">{t('teachingMode.online')}</option>
        </SelectField>
        <LocationFields
          provinces={catalogs.provinces}
          communes={communes}
          provinceId={filters.provinceId}
          communeId={filters.communeId}
        />
        <div className="flex items-end">
          <Button type="submit" block>
            <Filter aria-hidden="true" />
            {t('postSearch.submit')}
          </Button>
        </div>
      </Form>

      {invalidFilters && (
        <Alert variant="warning" role="status">
          {t('marketplace.invalidFilters')}
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite">
          <span className="font-semibold">{t('postSearch.count', { count: result.total })}</span>
          {summary && <span className="text-muted-foreground"> · {summary}</span>}
        </p>
        <SelectField
          form="post-search"
          name="sort"
          label={t('marketplace.sort')}
          className="w-full sm:w-56"
          defaultValue={filters.sort || 'newest'}
          onChange={(event) => {
            const form = event.currentTarget.form;
            if (form) void submit(form);
          }}
        >
          {TutorPostSearchSort.options.map((s) => (
            <option key={s} value={s}>
              {t(`postSearch.${sortKey(s)}` as 'postSearch.sortNewest')}
            </option>
          ))}
        </SelectField>
      </div>

      {result.items.length > 0 ? (
        <ul className="grid gap-4 md:grid-cols-2 md:gap-5">
          {result.items.map((post) => (
            <li key={post.id}>
              <TutorPostCard post={post} catalogs={catalogs} />
            </li>
          ))}
        </ul>
      ) : (
        <Card className="items-start">
          <h2 className="text-h3">{t('postSearch.emptyTitle')}</h2>
          <p className="text-muted-foreground">{t('postSearch.emptyBody')}</p>
        </Card>
      )}

      <Pagination
        pathname="/tutor-posts"
        params={params}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        maxPage={SEARCH_MAX_PAGE}
      />
    </PageContainer>
  );
}
