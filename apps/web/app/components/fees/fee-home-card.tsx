// Khối học phí trên trang tổng quan của phụ huynh và gia sư (G7; canvas ParentHome, TutorHome): khoản chờ người xem
// xác nhận, tạm tính tháng này, số còn chưa trả / chưa nhận của các tháng trước.
import type { FeeOverview } from '@tps/shared';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { buttonVariants } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { vnd } from '~/lib/classes';
import { PATHS } from '~/lib/navigation';
import { cn } from '~/lib/utils';

export function FeeHomeCard({
  overview,
  role,
}: {
  overview: FeeOverview | null;
  role: 'tutor' | 'client';
}) {
  const { t, i18n } = useTranslation();
  if (!overview) return null;
  const money = (amount: number) => vnd(i18n.language, amount);
  const { totals, unpaidOtherMonths, awaitingMe } = overview;
  const thisMonth = totals.totalVnd + totals.provisionalVnd;
  const lines = [
    thisMonth > 0 && t('fees.homeProvisional', { amount: money(thisMonth) }),
    unpaidOtherMonths.count > 0 &&
      t(role === 'tutor' ? 'fees.homeOutstandingTutor' : 'fees.homeOutstandingClient', {
        amount: money(unpaidOtherMonths.balanceVnd),
      }),
  ].filter((line): line is string => Boolean(line));
  const attention = awaitingMe.length > 0;

  return (
    <Card className={cn('gap-3 sm:p-6', attention && 'border-primary ring-1 ring-primary')}>
      <CardHeader>
        <h2 className="text-h3">{t('fees.homeTitle')}</h2>
        <Link to={PATHS.fees} className={buttonVariants({ variant: 'ghost' })}>
          {t('fees.homeOpen')}
          <ChevronRight aria-hidden="true" />
        </Link>
      </CardHeader>
      {attention && (
        <p className="font-semibold">{t('fees.homeAwaiting', { count: awaitingMe.length })}</p>
      )}
      {lines.map((line) => (
        <p key={line} className="text-small">
          {line}
        </p>
      ))}
      {!attention && lines.length === 0 && (
        <p className="text-small text-muted-foreground">{t('fees.homeNothing')}</p>
      )}
    </Card>
  );
}
