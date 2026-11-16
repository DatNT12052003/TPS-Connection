// /tutor-posts/:postRef: một bài tuyển học sinh (canvas PostDetail, PostDetailMobile). Khách xem được (C8); SSR.
// Slug `<tiêu-đề-không-dấu>-<mã>` (D56); vào bằng slug cũ hoặc id thì chuyển hướng 301 về slug đúng. Đăng ký học từ
// bài: phụ huynh gửi yêu cầu kết nối từ bài (G5).
import { PublicTutorPost } from '@tps/shared';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Link, redirect } from 'react-router';
import { AvatarImage } from '~/components/account/avatar-field';
import { ConnectCta } from '~/components/connections/connect-cta';
import { PageContainer } from '~/components/layout/page';
import { Breadcrumbs } from '~/components/marketplace/breadcrumbs';
import { KeyValue, KeyValueList } from '~/components/marketplace/key-value';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Card, cardVariants } from '~/components/ui/card';
import { ApiError } from '~/lib/api';
import { loadAreaRefs, loadCatalogs } from '~/lib/catalog.server';
import { formatDate } from '~/lib/format';
import { areaLabel, rateLabel, summarizeSlots, summarizeSubjects } from '~/lib/marketplace';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { cn } from '~/lib/utils';
import type { Route } from './+types/detail';

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  if (!loaderData) return [{ title: `${m.notFound.title} – ${m.common.appName}` }];
  const { post } = loaderData;
  return [
    { title: `${post.title} – ${m.common.appName}` },
    { name: 'description', content: post.description.slice(0, 160) },
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const post = await getServerApi(context)
    .call(`/api/v1/tutor-posts/${encodeURIComponent(params.postRef)}`, { schema: PublicTutorPost })
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) throw data(null, { status: 404 });
      throw error;
    });
  if (params.postRef !== post.slug) throw redirect(`/tutor-posts/${post.slug}`, 301);
  const { locale } = await readPreferences(request);
  const [catalogs, areas] = await Promise.all([
    loadCatalogs(context, locale),
    loadAreaRefs(context, locale, post.areaIds),
  ]);
  return { post, catalogs, areas };
}

export default function TutorPostDetailPage({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const { post, catalogs, areas } = loaderData;

  return (
    <PageContainer>
      <Breadcrumbs
        items={[{ label: t('nav.tutorPosts'), to: PATHS.tutorPosts }, { label: post.title }]}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0 gap-5 sm:p-7">
          <div className="flex flex-col gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="success" dot>
                {t('tutorPostStatus.open')}
              </Badge>
              <span className="text-small text-muted-foreground">
                {t('postPublic.publishedOn', { date: formatDate(post.publishedAt, i18n.language) })}
              </span>
            </span>
            <h1 className="text-h1">{post.title}</h1>
          </div>
          <div className="grid gap-4 rounded-md bg-surface-sunken p-4 sm:grid-cols-3">
            <div className="flex flex-col">
              <span className="text-small text-muted-foreground">{t('postPublic.rate')}</span>
              <span className="text-body-strong">
                {post.rate ? rateLabel(t, i18n.language, post.rate) : t('marketplace.rateUnset')}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-small text-muted-foreground">{t('postPublic.start')}</span>
              <span className="text-body-strong">
                {post.availableFrom
                  ? formatDate(post.availableFrom, i18n.language)
                  : t('marketplace.startsNow')}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-small text-muted-foreground">{t('postPublic.capacity')}</span>
              <span className="text-body-strong">
                {post.capacity !== null
                  ? t('marketplace.capacity', { count: post.capacity })
                  : t('postPublic.capacityUnset')}
              </span>
            </div>
          </div>
          <KeyValueList>
            <KeyValue label={t('marketplace.subjectsGrades')}>
              {summarizeSubjects(post.subjects, catalogs.subjects, catalogs.grades) ||
                t('marketplace.noSubjects')}
            </KeyValue>
            {post.teachingMode && (
              <KeyValue label={t('marketplace.mode')}>
                {t(`teachingMode.${post.teachingMode}`)}
              </KeyValue>
            )}
            {areas.length > 0 && (
              <KeyValue label={t('tutorPublic.areas')}>
                {areas.map((a) => areaLabel(a, catalogs.provinces)).join('; ')}
              </KeyValue>
            )}
            {post.slots.length > 0 && (
              <KeyValue label={t('postPublic.schedule')}>{summarizeSlots(t, post.slots)}</KeyValue>
            )}
          </KeyValueList>
          <div className="flex flex-col gap-2">
            <h2 className="text-h3">{t('postPublic.description')}</h2>
            <p className="max-w-[70ch] whitespace-pre-line">{post.description}</p>
          </div>
        </Card>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <Link
            to={`/tutors/${post.tutor.slug}`}
            className={cn(
              cardVariants({ variant: 'interactive' }),
              'flex-row items-center gap-3.5',
            )}
          >
            <AvatarImage
              avatarUrl={post.tutor.avatarUrl}
              displayName={post.tutor.displayName}
              className="size-13 text-h3"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-semibold">{post.tutor.displayName}</span>
              <span className="flex flex-wrap gap-1.5">
                <Badge variant="verified">{t('tutorProfile.identityVerified')}</Badge>
                {post.tutor.hasVerifiedDegree && (
                  <Badge variant="verified">{t('tutorProfile.degreeVerified')}</Badge>
                )}
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
          </Link>
          <Card className="gap-4 sm:p-6">
            <h2 className="text-h3">{t('postPublic.applyTitle')}</h2>
            <Alert variant="info">{t('tutorPublic.childPrivacy')}</Alert>
            <ConnectCta
              tutorSlug={post.tutor.slug}
              postSlug={post.slug}
              returnTo={`/tutor-posts/${post.slug}`}
            />
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}
