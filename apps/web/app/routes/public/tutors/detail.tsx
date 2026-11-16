// /tutors/:tutorRef: hồ sơ gia sư công khai (canvas TutorDetail, TutorDetailMobile). Khách xem được (C8); SSR cho
// SEO. Đường dẫn là slug `<tên-không-dấu>-<mã>` (D56); vào bằng slug cũ hoặc id thì chuyển hướng 301 về slug đúng.
// Chỉ tên hiển thị, không email, số điện thoại, họ tên thật (D16). Phụ huynh gửi yêu cầu kết nối từ đây (G5).
import { PublicTutorProfile, TutorPostSearchResult } from '@tps/shared';
import { Award, ExternalLink, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Link, redirect } from 'react-router';
import { AvatarImage } from '~/components/account/avatar-field';
import { ConnectCta } from '~/components/connections/connect-cta';
import { PageContainer } from '~/components/layout/page';
import { Breadcrumbs } from '~/components/marketplace/breadcrumbs';
import { KeyValue, KeyValueList } from '~/components/marketplace/key-value';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { ApiError } from '~/lib/api';
import { loadAreaRefs, loadCatalogs } from '~/lib/catalog.server';
import { areaLabel, rateLabel, summarizeSlots, summarizeSubjects } from '~/lib/marketplace';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import type { Route } from './+types/detail';

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  if (!loaderData) return [{ title: `${m.notFound.title} – ${m.common.appName}` }];
  const { tutor } = loaderData;
  return [
    { title: `${tutor.displayName} – ${m.tutorPublic.metaTitleSuffix}` },
    { name: 'description', content: tutor.headline ?? m.tutorPublic.metaDescription },
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const api = getServerApi(context);
  const tutor = await api
    .call(`/api/v1/tutors/${encodeURIComponent(params.tutorRef)}`, { schema: PublicTutorProfile })
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) throw data(null, { status: 404 });
      throw error;
    });
  if (params.tutorRef !== tutor.slug) throw redirect(`/tutors/${tutor.slug}`, 301);

  const { locale } = await readPreferences(request);
  const [catalogs, areas, posts] = await Promise.all([
    loadCatalogs(context, locale),
    loadAreaRefs(context, locale, tutor.serviceAreaIds),
    api.call(`/api/v1/tutor-posts?tutorId=${tutor.id}&pageSize=10`, {
      schema: TutorPostSearchResult,
    }),
  ]);
  return { tutor, catalogs, areas, posts: posts.items };
}

export default function TutorDetailPage({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const { tutor, catalogs, areas, posts } = loaderData;
  const subline = [
    tutor.occupation && t(`tutorOccupation.${tutor.occupation}`),
    tutor.experienceYears !== null &&
      t('tutorProfile.yearsCount', { count: tutor.experienceYears }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <PageContainer>
      <Breadcrumbs
        items={[{ label: t('nav.findTutors'), to: PATHS.findTutors }, { label: tutor.displayName }]}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex-row flex-wrap items-center gap-5 sm:p-6">
            <AvatarImage
              avatarUrl={tutor.avatarUrl}
              displayName={tutor.displayName}
              className="size-24 text-h1"
            />
            <div className="flex min-w-60 flex-1 flex-col gap-2.5">
              <div className="flex flex-col gap-0.5">
                <h1 className="text-h1">{tutor.displayName}</h1>
                {tutor.headline && <p className="text-muted-foreground">{tutor.headline}</p>}
                {subline && <p className="text-small text-muted-foreground">{subline}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="verified">
                  <ShieldCheck aria-hidden="true" />
                  {t('tutorProfile.identityVerified')}
                </Badge>
                {tutor.hasVerifiedDegree && (
                  <Badge variant="verified">
                    <Award aria-hidden="true" />
                    {t('tutorProfile.degreeVerified')}
                  </Badge>
                )}
                {tutor.acceptingStudents ? (
                  <Badge variant="success" dot>
                    {t('marketplace.accepting')}
                  </Badge>
                ) : (
                  <Badge variant="neutral">{t('marketplace.notAccepting')}</Badge>
                )}
              </div>
            </div>
            {tutor.rate && (
              <div className="flex flex-col sm:items-end">
                <span className="text-h2">{rateLabel(t, i18n.language, tutor.rate)}</span>
                <span className="text-small text-muted-foreground">
                  {t('marketplace.reference')}
                </span>
              </div>
            )}
          </Card>

          {(tutor.bio || tutor.teachingMethod || tutor.achievements || tutor.introVideoUrl) && (
            <Card className="sm:p-6">
              <CardHeader>
                <h2 className="text-h2">{t('tutorPublic.about')}</h2>
                <Badge variant="self">{t('account.selfDeclared')}</Badge>
              </CardHeader>
              {tutor.bio && <p className="max-w-[70ch] whitespace-pre-line">{tutor.bio}</p>}
              {tutor.teachingMethod && (
                <>
                  <h3 className="text-h3">{t('tutorProfile.teachingMethod')}</h3>
                  <p className="max-w-[70ch] whitespace-pre-line">{tutor.teachingMethod}</p>
                </>
              )}
              {tutor.achievements && (
                <>
                  <h3 className="text-h3">{t('tutorProfile.achievements')}</h3>
                  <p className="max-w-[70ch] whitespace-pre-line">{tutor.achievements}</p>
                </>
              )}
              {tutor.introVideoUrl && (
                <a
                  href={tutor.introVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className={buttonVariants({ variant: 'secondary' })}
                >
                  <ExternalLink aria-hidden="true" />
                  {t('tutorPublic.watchVideo')}
                </a>
              )}
            </Card>
          )}

          <Card className="sm:p-6">
            <h2 className="text-h2">{t('tutorPublic.teachingInfo')}</h2>
            <KeyValueList>
              <KeyValue label={t('marketplace.subjectsGrades')}>
                {summarizeSubjects(tutor.teachingSubjects, catalogs.subjects, catalogs.grades) ||
                  t('marketplace.noSubjects')}
              </KeyValue>
              {tutor.teachingMode && (
                <KeyValue label={t('marketplace.mode')}>
                  {t(`teachingMode.${tutor.teachingMode}`)}
                </KeyValue>
              )}
              {areas.length > 0 && (
                <KeyValue label={t('tutorPublic.areas')}>
                  {areas.map((a) => areaLabel(a, catalogs.provinces)).join('; ')}
                </KeyValue>
              )}
              {tutor.availability.length > 0 && (
                <KeyValue label={t('tutorPublic.availability')}>
                  {summarizeSlots(t, tutor.availability)}
                </KeyValue>
              )}
              {(tutor.institution || tutor.major || tutor.highestEducation) && (
                <KeyValue label={t('tutorPublic.education')}>
                  {[tutor.highestEducation, tutor.major, tutor.institution]
                    .filter(Boolean)
                    .join(' · ')}
                </KeyValue>
              )}
              {tutor.credentials.length > 0 && (
                <KeyValue label={t('tutorPublic.credentials')}>
                  <ul className="flex flex-col gap-1.5">
                    {tutor.credentials.map((c) => (
                      <li
                        key={`${c.kind}-${c.title}-${c.issuedYear}`}
                        className="flex flex-wrap items-center gap-2"
                      >
                        {[c.title, c.issuer, c.issuedYear].filter(Boolean).join(' · ')}
                        {c.verified ? (
                          <Badge variant="verified">
                            {t('credentialVerificationStatus.verified')}
                          </Badge>
                        ) : (
                          <Badge variant="self">{t('account.selfDeclared')}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </KeyValue>
              )}
            </KeyValueList>
          </Card>

          <Card className="sm:p-6">
            <h2 className="text-h2">{t('tutorPublic.openPosts')}</h2>
            {posts.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border">
                {posts.map((post) => (
                  <li
                    key={post.id}
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{post.title}</span>
                      <span className="text-small text-muted-foreground">
                        {[
                          post.teachingMode && t(`teachingMode.${post.teachingMode}`),
                          post.rate && rateLabel(t, i18n.language, post.rate),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <Link
                      to={`/tutor-posts/${post.slug}`}
                      className={buttonVariants({ variant: 'ghost' })}
                    >
                      {t('tutorPublic.viewPost')}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t('tutorPublic.noPosts')}</p>
            )}
          </Card>

          <Card className="sm:p-6">
            <h2 className="text-h2">{t('tutorPublic.reviews')}</h2>
            <p className="text-muted-foreground">{t('tutorPublic.noReviews')}</p>
          </Card>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <Card className="gap-4 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-h2">{t('tutorPublic.connectTitle')}</h2>
              <p className="text-small text-muted-foreground">{t('tutorPublic.connectLead')}</p>
            </div>
            <Alert variant="info">{t('tutorPublic.childPrivacy')}</Alert>
            {!tutor.acceptingStudents && (
              <p className="text-small text-muted-foreground">{t('errors.tutor_not_accepting')}</p>
            )}
            <ConnectCta tutorSlug={tutor.slug} returnTo={`/tutors/${tutor.slug}`} showRegister />
          </Card>
          <Card className="gap-2">
            <span className="text-label">{t('tutorPublic.contact')}</span>
            <p className="flex items-start gap-2 text-small text-muted-foreground">
              <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t('tutorPublic.contactHidden')}
            </p>
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}
