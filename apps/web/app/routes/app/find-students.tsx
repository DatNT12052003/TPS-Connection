// /app/find-students: gia sư tìm nhu cầu của phụ huynh (canvas FindStudents, FindStudentsMobile). Chỉ gia sư đã duyệt
// danh tính và đã đăng nhập mới xem được (C8). Danh sách bên trái, bài đang chọn (`?post=<id>`) bên phải. Không bao
// giờ có hồ sơ con, người đăng hay danh tính của trẻ (§16.7): API không trả các thông tin đó. Ứng tuyển (G5, §5.2):
// form lời nhắn dưới bài đang chọn (intent `apply`); đã có ứng tuyển đang mở thì hiện "Đã ứng tuyển" và liên kết.
import {
  CONNECTION_LIMITS,
  ConnectionRequestDetail,
  ConnectionRequestList,
  OwnTutorProfile,
  RequestPostForTutor,
  RequestPostSearchResult,
  RequestPostSearchSort,
  SEARCH_MAX_PAGE,
} from '@tps/shared';
import { Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation, useSubmit } from 'react-router';
import { LocationFields } from '~/components/forms/location-fields';
import { PageContainer } from '~/components/layout/page';
import { KeyValue, KeyValueList } from '~/components/marketplace/key-value';
import { Pagination } from '~/components/marketplace/pagination';
import { Alert } from '~/components/ui/alert';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, cardVariants } from '~/components/ui/card';
import { CheckboxField, SelectField, TextAreaField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { type AreaRef, labelOf } from '~/lib/catalog';
import { loadAreaRefs, loadCatalogs, loadCommunes } from '~/lib/catalog.server';
import { fieldErrorsFrom, formErrorFrom, formText } from '~/lib/form';
import { formatDate } from '~/lib/format';
import {
  areaLabel,
  budgetLabel,
  type Catalogs,
  pickQuery,
  sortKey,
  summarizeSlots,
} from '~/lib/marketplace';
import { emptyPage, searchOrEmpty } from '~/lib/marketplace.server';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import { cn } from '~/lib/utils';
import type { Route } from './+types/find-students';

const API_KEYS = [
  'subjectId',
  'gradeLevelId',
  'goal',
  'mode',
  'provinceId',
  'communeId',
  'matchProfile',
  'sort',
  'page',
] as const;

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.findStudents.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  const api = getServerApi(context);
  const url = new URL(request.url);
  const filters = Object.fromEntries(
    API_KEYS.map((key) => [key, url.searchParams.get(key) ?? '']),
  ) as Record<(typeof API_KEYS)[number], string>;
  const profile = await api.call('/api/v1/me/tutor-profile', { schema: OwnTutorProfile });
  if (profile.profileStatus !== 'verified') return { verified: false as const, filters };

  const { locale } = await readPreferences(request);
  const selectedId = url.searchParams.get('post');
  const provinceId = Number(filters.provinceId) || null;
  const [catalogs, communes, search, selected] = await Promise.all([
    loadCatalogs(context, locale),
    loadCommunes(context, locale, provinceId).catch(() => []),
    searchOrEmpty(
      api,
      '/api/v1/request-posts',
      pickQuery(url, API_KEYS),
      RequestPostSearchResult,
      emptyPage(),
    ),
    selectedId
      ? api
          .call(`/api/v1/request-posts/${encodeURIComponent(selectedId)}`, {
            schema: RequestPostForTutor,
          })
          .catch((error: unknown) => {
            if (error instanceof ApiError && error.status < 500) return null;
            throw error;
          })
      : Promise.resolve(null),
  ]);
  // Tên xã của các bài trong trang (tỉnh đã có trong danh mục).
  const communeIds = [
    ...new Set(
      [...search.result.items, ...(selected ? [selected] : [])]
        .map((p) => p.communeId)
        .filter((id): id is number => id !== null),
    ),
  ];
  const [areas, application] = await Promise.all([
    loadAreaRefs(context, locale, communeIds).catch(() => []),
    // Ứng tuyển đang mở của tôi vào bài đang chọn (nếu có).
    selected
      ? api
          .call(
            `/api/v1/connection-requests?as=tutor&state=open&pageSize=1&requestPostId=${selected.id}`,
            { schema: ConnectionRequestList },
          )
          .then((list) => list.items[0]?.id ?? null)
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    verified: true as const,
    filters,
    ...search,
    catalogs,
    communes,
    areas,
    selected,
    selectedMissing: Boolean(selectedId) && !selected,
    applicationId: application,
    applied: url.searchParams.get('applied') === '1',
  };
}

/** Gia sư ứng tuyển vào bài đang chọn (§5.2). Thành công: quay lại bài với thông báo "Đã gửi ứng tuyển". */
export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  const form = await request.formData();
  if (formText(form, 'intent') !== 'apply') throw data(null, { status: 400 });
  const postId = formText(form, 'requestPostId');
  try {
    await getServerApi(context).call('/api/v1/connection-requests', {
      method: 'POST',
      body: {
        direction: 'tutor_to_client',
        requestPostId: postId,
        message: formText(form, 'message'),
      },
      schema: ConnectionRequestDetail,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    const fields = fieldErrorsFrom(error, ['message']);
    return data({
      message: formText(form, 'message'),
      error: fields.message ?? formErrorFrom(error),
    });
  }
  const url = new URL(request.url);
  url.searchParams.set('applied', '1');
  throw redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

/** "Hà Nội, Phường Ba Đình" hoặc "Trực tuyến". */
function placeOf(
  t: (key: 'teachingMode.online') => string,
  post: RequestPostForTutor,
  catalogs: Catalogs,
  areas: readonly AreaRef[],
): string {
  const commune = areas.find((a) => a.id === post.communeId);
  if (commune) return areaLabel(commune, catalogs.provinces);
  return labelOf(catalogs.provinces, post.provinceId) ?? t('teachingMode.online');
}

export default function FindStudentsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const submit = useSubmit();
  const navigation = useNavigation();
  const tr = useMessage();

  if (!loaderData.verified) {
    return (
      <PageContainer>
        <h1 className="text-h1">{t('findStudents.title')}</h1>
        <Card className="max-w-2xl items-start">
          <h2 className="text-h3">{t('findStudents.notVerifiedTitle')}</h2>
          <p className="text-muted-foreground">{t('findStudents.notVerifiedBody')}</p>
          <Link to={PATHS.tutorProfile} className={buttonVariants()}>
            {t('findStudents.goVerify')}
          </Link>
        </Card>
      </PageContainer>
    );
  }

  const { filters, result, invalidFilters, catalogs, communes, areas, selected } = loaderData;
  const params = new URLSearchParams(
    Object.entries(filters).filter(([key, value]) => value && key !== 'page'),
  );
  const postHref = (id: string) => {
    const next = new URLSearchParams(params);
    if (result.page > 1) next.set('page', String(result.page));
    next.set('post', id);
    return `${PATHS.findStudents}?${next.toString()}`;
  };
  const headline = (post: RequestPostForTutor) =>
    t('findStudents.headline', {
      subject: labelOf(catalogs.subjects, post.subjectId) ?? '',
      grade: labelOf(catalogs.grades, post.gradeLevelId) ?? '',
    });

  return (
    <PageContainer>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('findStudents.title')}</h1>
        <p className="text-muted-foreground">{t('findStudents.lead')}</p>
      </div>

      <Form
        id="find-students"
        method="get"
        aria-label={t('findStudents.filtersLabel')}
        className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4"
      >
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
        <LocationFields
          provinces={catalogs.provinces}
          communes={communes}
          provinceId={filters.provinceId}
          communeId={filters.communeId}
        />
        <SelectField name="mode" label={t('marketplace.mode')} defaultValue={filters.mode}>
          <option value="">{t('marketplace.anyMode')}</option>
          <option value="in_person">{t('teachingMode.in_person')}</option>
          <option value="online">{t('teachingMode.online')}</option>
        </SelectField>
        <SelectField
          name="sort"
          label={t('marketplace.sort')}
          defaultValue={filters.sort || 'newest'}
          onChange={(event) => {
            const form = event.currentTarget.form;
            if (form) void submit(form);
          }}
        >
          {RequestPostSearchSort.options.map((s) => (
            <option key={s} value={s}>
              {t(`findStudents.${sortKey(s)}` as 'findStudents.sortNewest')}
            </option>
          ))}
        </SelectField>
        <CheckboxField
          name="matchProfile"
          value="true"
          defaultChecked={filters.matchProfile === 'true'}
          className="self-end"
        >
          {t('findStudents.matchProfile')}
        </CheckboxField>
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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <section aria-label={t('findStudents.listLabel')} className="flex flex-col gap-3">
          <span aria-live="polite" className="text-small text-muted-foreground">
            {t('findStudents.count', { count: result.total })}
          </span>
          {result.items.length === 0 ? (
            <Card>
              <p className="text-muted-foreground">{t('findStudents.empty')}</p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {result.items.map((post) => {
                const current = selected?.id === post.id;
                return (
                  <li key={post.id}>
                    <Link
                      to={postHref(post.id)}
                      preventScrollReset
                      aria-current={current ? 'true' : undefined}
                      className={cn(
                        cardVariants({ variant: 'interactive' }),
                        'gap-1.5',
                        current && 'border-primary ring-1 ring-primary',
                      )}
                    >
                      <span className="font-semibold">{headline(post)}</span>
                      <span className="text-small text-muted-foreground">
                        {[
                          t(`requestPostGoal.${post.goal}`),
                          t(`teachingMode.${post.teachingMode}`),
                          post.teachingMode !== 'online' && placeOf(t, post, catalogs, areas),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="flex flex-wrap items-center justify-between gap-2 text-small">
                        <span className="font-semibold">
                          {post.budget
                            ? budgetLabel(t, i18n.language, post.budget)
                            : t('findStudents.noBudget')}
                        </span>
                        <span className="text-muted-foreground">
                          {formatDate(post.publishedAt, i18n.language)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Pagination
            pathname={PATHS.findStudents}
            params={params}
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            maxPage={SEARCH_MAX_PAGE}
          />
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          {selected ? (
            <>
              <Card className="gap-4 sm:p-6">
                <div className="flex flex-col gap-1">
                  <span className="text-small text-muted-foreground">
                    {t('findStudents.postedOn', {
                      date: formatDate(selected.publishedAt, i18n.language),
                    })}
                  </span>
                  <h2 className="text-h2">{headline(selected)}</h2>
                </div>
                <KeyValueList>
                  <KeyValue label={t('requestEditor.goal')}>
                    {t(`requestPostGoal.${selected.goal}`)}
                    {selected.goalNote && ` · ${selected.goalNote}`}
                  </KeyValue>
                  <KeyValue label={t('marketplace.mode')}>
                    {t(`teachingMode.${selected.teachingMode}`)}
                    {selected.teachingMode !== 'online' &&
                      ` · ${placeOf(t, selected, catalogs, areas)}`}
                  </KeyValue>
                  {(selected.slots.length > 0 || selected.desiredStartDate) && (
                    <KeyValue label={t('findStudents.schedule')}>
                      {[
                        summarizeSlots(t, selected.slots),
                        selected.desiredStartDate &&
                          t('marketplace.startsOn', {
                            date: formatDate(selected.desiredStartDate, i18n.language),
                          }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </KeyValue>
                  )}
                  {selected.budget && (
                    <KeyValue label={t('requestEditor.budget')}>
                      {budgetLabel(t, i18n.language, selected.budget)}
                    </KeyValue>
                  )}
                  {selected.tutorRequirements && (
                    <KeyValue label={t('requestEditor.requirements')}>
                      {selected.tutorRequirements}
                    </KeyValue>
                  )}
                  {selected.description && (
                    <KeyValue label={t('requestEditor.description')}>
                      {selected.description}
                    </KeyValue>
                  )}
                </KeyValueList>
              </Card>
              <Card className="gap-3">
                <h2 className="text-h3">{t('findStudents.applyTitle')}</h2>
                {loaderData.applied && (
                  <Alert variant="success">{t('findStudents.appliedDone')}</Alert>
                )}
                {loaderData.applicationId ? (
                  <>
                    <p className="text-muted-foreground">{t('findStudents.applied')}</p>
                    <Link
                      to={`${PATHS.connections}/${loaderData.applicationId}`}
                      className={buttonVariants({ variant: 'secondary' })}
                    >
                      {t('findStudents.appliedView')}
                    </Link>
                  </>
                ) : (
                  <Form method="post" className="flex flex-col gap-3">
                    <input type="hidden" name="intent" value="apply" />
                    <input type="hidden" name="requestPostId" value={selected.id} />
                    <p className="text-small text-muted-foreground">
                      {t('findStudents.applyLead')}
                    </p>
                    {actionData && 'error' in actionData && (
                      <Alert variant="danger">{tr(actionData.error)}</Alert>
                    )}
                    <TextAreaField
                      name="message"
                      label={t('findStudents.applyMessage')}
                      defaultValue={actionData?.message ?? ''}
                      maxLength={CONNECTION_LIMITS.messageLength}
                      rows={5}
                      required
                    />
                    <div>
                      <Button type="submit" disabled={navigation.state !== 'idle'}>
                        {t('findStudents.applySubmit')}
                      </Button>
                    </div>
                  </Form>
                )}
              </Card>
            </>
          ) : (
            <Card>
              <p className="text-muted-foreground">
                {loaderData.selectedMissing ? t('findStudents.postGone') : t('findStudents.choose')}
              </p>
            </Card>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
