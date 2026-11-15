// Trang chủ công khai (SSR; canvas Main, MainMobile). Hành động chính: tìm gia sư (form GET tới /tutors với môn,
// khối, tỉnh). Bên dưới: gia sư phù hợp nhất và bài tuyển mới nhất (dữ liệu thật từ API; API lỗi thì ẩn khối đó),
// rồi "vì sao yên tâm" lấy từ quy tắc nghiệp vụ (§3.2 xác minh, §7 xác nhận buổi học, bảo vệ thông tin trẻ).
import { TutorPostSearchResult, TutorSearchResult } from '@tps/shared';
import { CalendarCheck, LockKeyhole, type LucideIcon, Search, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Form, Link } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { TutorCard } from '~/components/marketplace/tutor-card';
import { TutorPostCard } from '~/components/marketplace/tutor-post-card';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { SelectField } from '~/components/ui/field';
import { loadCatalogs } from '~/lib/catalog.server';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import type { Route } from './+types/home';

export function meta({ matches }: Route.MetaArgs) {
  const { home } = messagesFromMatches(matches);
  return [{ title: home.metaTitle }, { name: 'description', content: home.metaDescription }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const api = getServerApi(context);
  const { locale } = await readPreferences(request);
  const [catalogs, tutors, posts] = await Promise.all([
    loadCatalogs(context, locale).catch(() => null),
    api
      .call('/api/v1/tutors?pageSize=6', { schema: TutorSearchResult })
      .then((r) => r.items)
      .catch(() => []),
    api
      .call('/api/v1/tutor-posts?pageSize=4', { schema: TutorPostSearchResult })
      .then((r) => r.items)
      .catch(() => []),
  ]);
  return { catalogs, tutors, posts };
}

const TRUST_POINTS = [
  { icon: ShieldCheck, title: 'home.trustVerifiedTitle', body: 'home.trustVerifiedBody' },
  { icon: CalendarCheck, title: 'home.trustLessonsTitle', body: 'home.trustLessonsBody' },
  { icon: LockKeyhole, title: 'home.trustPrivacyTitle', body: 'home.trustPrivacyBody' },
] as const satisfies readonly { icon: LucideIcon; title: string; body: string }[];

export default function HomePage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { catalogs, tutors, posts } = loaderData;
  return (
    <>
      <section className="border-b border-border bg-surface">
        <PageContainer className="items-start gap-6 py-12 md:py-16 lg:py-16">
          <h1 className="max-w-3xl text-display">{t('home.heroTitle')}</h1>
          <p className="max-w-[70ch] text-body-lg text-muted-foreground">{t('home.heroLead')}</p>
          {catalogs ? (
            <Form
              method="get"
              action={PATHS.findTutors}
              aria-label={t('tutorSearch.filtersLabel')}
              className="grid w-full gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4"
            >
              <SelectField name="subjectId" label={t('marketplace.subject')} defaultValue="">
                <option value="">{t('marketplace.all')}</option>
                {catalogs.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </SelectField>
              <SelectField name="gradeLevelId" label={t('marketplace.grade')} defaultValue="">
                <option value="">{t('marketplace.all')}</option>
                {catalogs.grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </SelectField>
              <SelectField name="provinceId" label={t('location.province')} defaultValue="">
                <option value="">{t('marketplace.all')}</option>
                {catalogs.provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </SelectField>
              <div className="flex items-end">
                <Button type="submit" size="lg" block>
                  <Search aria-hidden="true" />
                  {t('home.ctaFindTutors')}
                </Button>
              </div>
            </Form>
          ) : (
            <Link to={PATHS.findTutors} className={buttonVariants({ size: 'lg' })}>
              {t('home.ctaFindTutors')}
            </Link>
          )}
          <Link
            to={PATHS.forTutors}
            className="text-small font-semibold text-primary hover:text-primary-hover"
          >
            {t('home.ctaForTutors')}
          </Link>
        </PageContainer>
      </section>

      {catalogs && tutors.length > 0 && (
        <PageContainer className="pb-0 lg:pb-0">
          <CardHeader>
            <h2 className="text-h2">{t('home.tutorsTitle')}</h2>
            <Link to={PATHS.findTutors} className={buttonVariants({ variant: 'ghost' })}>
              {t('home.seeAllTutors')}
            </Link>
          </CardHeader>
          <ul className="grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
            {tutors.map((tutor) => (
              <li key={tutor.id}>
                <TutorCard tutor={tutor} catalogs={catalogs} />
              </li>
            ))}
          </ul>
        </PageContainer>
      )}

      {catalogs && posts.length > 0 && (
        <PageContainer className="pb-0 lg:pb-0">
          <CardHeader>
            <h2 className="text-h2">{t('home.postsTitle')}</h2>
            <Link to={PATHS.tutorPosts} className={buttonVariants({ variant: 'ghost' })}>
              {t('home.seeAllPosts')}
            </Link>
          </CardHeader>
          <ul className="grid gap-4 md:grid-cols-2 md:gap-5">
            {posts.map((post) => (
              <li key={post.id}>
                <TutorPostCard post={post} catalogs={catalogs} />
              </li>
            ))}
          </ul>
        </PageContainer>
      )}

      <PageContainer className="py-12 lg:py-12">
        <h2 className="text-h2">{t('home.trustTitle')}</h2>
        <ul className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {TRUST_POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex">
              <Card className="flex-1">
                <Icon aria-hidden="true" className="size-6 text-primary" />
                <h3 className="text-h3">{t(title)}</h3>
                <p className="text-muted-foreground">{t(body)}</p>
              </Card>
            </li>
          ))}
        </ul>
      </PageContainer>
    </>
  );
}
