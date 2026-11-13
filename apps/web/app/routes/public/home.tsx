// Trang chủ công khai (SSR). Hành động chính: Tìm gia sư. Nội dung "vì sao yên tâm" lấy từ quy tắc nghiệp vụ
// (§3.2 xác minh, §7 xác nhận buổi học, quy tắc bảo vệ thông tin trẻ), không phải dữ liệu mẫu.
import { CalendarCheck, LockKeyhole, type LucideIcon, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import type { Route } from './+types/home';

export function meta({ matches }: Route.MetaArgs) {
  const { home } = messagesFromMatches(matches);
  return [{ title: home.metaTitle }, { name: 'description', content: home.metaDescription }];
}

const TRUST_POINTS = [
  { icon: ShieldCheck, title: 'home.trustVerifiedTitle', body: 'home.trustVerifiedBody' },
  { icon: CalendarCheck, title: 'home.trustLessonsTitle', body: 'home.trustLessonsBody' },
  { icon: LockKeyhole, title: 'home.trustPrivacyTitle', body: 'home.trustPrivacyBody' },
] as const satisfies readonly { icon: LucideIcon; title: string; body: string }[];

export default function HomePage() {
  const { t } = useTranslation();
  return (
    <>
      <section className="border-b border-border bg-surface">
        <PageContainer className="items-start gap-6 py-12 md:py-16 lg:py-16">
          <h1 className="max-w-3xl text-display">{t('home.heroTitle')}</h1>
          <p className="max-w-[70ch] text-body-lg text-muted-foreground">{t('home.heroLead')}</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link to={PATHS.findTutors} className={buttonVariants({ size: 'lg' })}>
              {t('home.ctaFindTutors')}
            </Link>
            <Link
              to={PATHS.forTutors}
              className={buttonVariants({ variant: 'secondary', size: 'lg' })}
            >
              {t('home.ctaForTutors')}
            </Link>
          </div>
        </PageContainer>
      </section>

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
