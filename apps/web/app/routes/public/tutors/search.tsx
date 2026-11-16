// /tutors: tìm gia sư (canvas Main, MainMobile, TabletSearch). Khách xem được (C8); render phía server cho SEO.
// Bộ lọc là form GET: mọi trạng thái nằm trong đường dẫn, chia sẻ và quay lại được, dùng được khi chưa tải
// JavaScript. Chỉ gia sư đã xác minh danh tính, đang hoạt động (API lọc sẵn).
import { SEARCH_MAX_PAGE, TutorSearchResult, TutorSearchSort } from '@tps/shared';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Form, useNavigation, useSubmit } from 'react-router';
import { LocationFields } from '~/components/forms/location-fields';
import { PageContainer } from '~/components/layout/page';
import { Pagination } from '~/components/marketplace/pagination';
import { TutorCard } from '~/components/marketplace/tutor-card';
import { Alert } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { CheckboxField, SelectField, TextField } from '~/components/ui/field';
import { labelOf } from '~/lib/catalog';
import { loadCatalogs, loadCommunes } from '~/lib/catalog.server';
import { pickQuery, sortKey } from '~/lib/marketplace';
import { emptyPage, searchOrEmpty } from '~/lib/marketplace.server';
import { messagesFromMatches } from '~/lib/meta';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { formatMoney } from '~/lib/tutor-profile';
import type { Route } from './+types/search';

/** Khóa query gửi thẳng cho API (cùng tên với TutorSearchQuery). */
const API_KEYS = [
  'q',
  'subjectId',
  'gradeLevelId',
  'mode',
  'provinceId',
  'communeId',
  'weekday',
  'verifiedDegree',
  'acceptingOnly',
  'sort',
  'page',
] as const;

/** Mức học phí trong ô chọn: `<đơn vị>:<tối đa>`, tách thành `rateUnit` + `maxRate` khi gọi API. */
const RATE_PRESETS = [
  ['session', 150_000],
  ['session', 200_000],
  ['session', 300_000],
  ['session', 500_000],
  ['hour', 100_000],
  ['hour', 200_000],
] as const;

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [
    { title: `${m.tutorSearch.metaTitle} – ${m.common.appName}` },
    { name: 'description', content: m.tutorSearch.metaDescription },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { locale } = await readPreferences(request);
  const query = pickQuery(url, API_KEYS);
  const rate = url.searchParams.get('rate')?.split(':');
  if (rate?.length === 2) {
    query.set('rateUnit', rate[0]!);
    query.set('maxRate', rate[1]!);
  }
  const provinceId = Number(url.searchParams.get('provinceId')) || null;
  const [catalogs, communes, search] = await Promise.all([
    loadCatalogs(context, locale),
    loadCommunes(context, locale, provinceId).catch(() => []),
    searchOrEmpty(getServerApi(context), '/api/v1/tutors', query, TutorSearchResult, emptyPage()),
  ]);
  return {
    ...search,
    catalogs,
    communes,
    /** Giá trị đang chọn của bộ lọc (để điền lại form). */
    filters: Object.fromEntries(
      [...API_KEYS, 'rate'].map((key) => [key, url.searchParams.get(key) ?? '']),
    ) as Record<(typeof API_KEYS)[number] | 'rate', string>,
  };
}

export default function TutorSearchPage({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const submit = useSubmit();
  const navigation = useNavigation();
  const searching = navigation.state === 'loading' && navigation.location.pathname === '/tutors';
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
    <>
      <section className="border-b border-border bg-surface">
        <PageContainer className="gap-6 py-8 lg:py-12">
          <div className="flex max-w-3xl flex-col gap-3">
            <h1 className="text-display">{t('tutorSearch.title')}</h1>
            <p className="text-body-lg text-muted-foreground">{t('tutorSearch.lead')}</p>
          </div>

          <Form
            id="tutor-search"
            method="get"
            action="/tutors"
            aria-label={t('tutorSearch.filtersLabel')}
            className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4"
          >
            <TextField
              name="q"
              type="search"
              maxLength={100}
              label={t('tutorSearch.keyword')}
              placeholder={t('tutorSearch.keywordPlaceholder')}
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
            <SelectField name="rate" label={t('tutorSearch.rate')} defaultValue={filters.rate}>
              <option value="">{t('marketplace.all')}</option>
              {RATE_PRESETS.map(([unit, max]) => (
                <option key={`${unit}:${max}`} value={`${unit}:${max}`}>
                  {t('tutorSearch.rateUpTo', {
                    amount: formatMoney(max, i18n.language),
                    unit: t(unit === 'hour' ? 'tutorProfile.perHour' : 'tutorProfile.perSession'),
                  })}
                </option>
              ))}
            </SelectField>
            <SelectField
              name="weekday"
              label={t('tutorSearch.availability')}
              defaultValue={filters.weekday}
            >
              <option value="">{t('marketplace.anyDay')}</option>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  {t(`weekday.${d}` as 'weekday.1')}
                </option>
              ))}
            </SelectField>
            <CheckboxField
              name="verifiedDegree"
              value="true"
              defaultChecked={filters.verifiedDegree === 'true'}
              className="self-end"
            >
              {t('tutorProfile.degreeVerified')}
            </CheckboxField>
            <CheckboxField
              name="acceptingOnly"
              value="true"
              defaultChecked={filters.acceptingOnly === 'true'}
              className="self-end"
            >
              {t('tutorSearch.acceptingOnly')}
            </CheckboxField>
            <div className="flex items-end sm:col-span-2 lg:col-start-4 lg:col-span-1">
              <Button type="submit" block aria-busy={searching || undefined}>
                <Search aria-hidden="true" />
                {t('tutorSearch.submit')}
              </Button>
            </div>
          </Form>
        </PageContainer>
      </section>

      <PageContainer>
        {invalidFilters && (
          <Alert variant="warning" role="status">
            {t('marketplace.invalidFilters')}
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite">
            <span className="font-semibold">{t('tutorSearch.count', { count: result.total })}</span>
            {summary && <span className="text-muted-foreground"> · {summary}</span>}
          </p>
          <SelectField
            form="tutor-search"
            name="sort"
            label={t('marketplace.sort')}
            className="w-full sm:w-56"
            defaultValue={filters.sort || 'relevance'}
            onChange={(event) => {
              const form = event.currentTarget.form;
              if (form) void submit(form);
            }}
          >
            {TutorSearchSort.options.map((s) => (
              <option key={s} value={s}>
                {t(`tutorSearch.${sortKey(s)}` as 'tutorSearch.sortRelevance')}
              </option>
            ))}
          </SelectField>
        </div>

        {result.items.length > 0 ? (
          <ul className="grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
            {result.items.map((tutor) => (
              <li key={tutor.id}>
                <TutorCard tutor={tutor} catalogs={catalogs} />
              </li>
            ))}
          </ul>
        ) : (
          <Card className="items-start">
            <h2 className="text-h3">{t('tutorSearch.emptyTitle')}</h2>
            <p className="text-muted-foreground">{t('tutorSearch.emptyBody')}</p>
          </Card>
        )}

        <Pagination
          pathname="/tutors"
          params={params}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          maxPage={SEARCH_MAX_PAGE}
        />
      </PageContainer>
    </>
  );
}
