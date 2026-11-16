// Mảnh giao diện dùng chung của trang học phí (G7, canvas Tuition, TuitionTutor): chọn tháng, ô số liệu, khoản thanh
// toán chờ người xem xác nhận.
import type { Payment } from '@tps/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Link } from 'react-router';
import { Button, buttonVariants } from '~/components/ui/button';
import { vnd } from '~/lib/classes';
import { monthLabel, shortMonth, shiftMonth } from '~/lib/fees';
import { formatDate } from '~/lib/format';
import { cn } from '~/lib/utils';

/** Tháng trước / sau: liên kết giữ nguyên trang, đổi `?month=`. */
export function MonthNav({ month, hrefOf }: { month: string; hrefOf: (month: string) => string }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('fees.title')} className="flex items-center gap-1">
      <Link
        to={hrefOf(shiftMonth(month, -1))}
        aria-label={t('fees.prevMonth')}
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <ChevronLeft aria-hidden="true" />
      </Link>
      <span className="min-w-28 text-center font-semibold" aria-current="date">
        {monthLabel(t, month)}
      </span>
      <Link
        to={hrefOf(shiftMonth(month, 1))}
        aria-label={t('fees.nextMonth')}
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <ChevronRight aria-hidden="true" />
      </Link>
    </nav>
  );
}

/** Một ô số liệu (tổng, đã trả, còn lại). `tone="danger"`: số cần chú ý. */
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'danger' }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border border-border bg-surface p-4',
        tone === 'danger' && 'border-danger',
      )}
    >
      <span className="text-small text-muted-foreground">{label}</span>
      <span className={cn('text-h3 tabular-nums', tone === 'danger' && 'text-danger')}>
        {value}
      </span>
    </div>
  );
}

/**
 * Nút trả lời một khoản đang chờ người xem: xác nhận (hỏi lại trước khi gửi, không đổi lại được) hoặc báo không đúng /
 * chưa nhận được. Form gửi `intent` cùng `statementId`, `paymentId`.
 */
export function PaymentDecision({
  statementId,
  payment,
  role,
  busy,
}: {
  statementId: string;
  payment: Payment;
  role: 'tutor' | 'client';
  busy: boolean;
}) {
  const { t } = useTranslation();
  const confirmFirst = (event: FormEvent) => {
    if (!window.confirm(t('fees.acknowledgePrompt'))) event.preventDefault();
  };
  const hidden = (
    <>
      <input type="hidden" name="statementId" value={statementId} />
      <input type="hidden" name="paymentId" value={payment.id} />
    </>
  );
  return (
    <div className="flex flex-wrap gap-2">
      <Form method="post">
        <input type="hidden" name="intent" value="decline" />
        {hidden}
        <Button type="submit" variant="secondary" disabled={busy}>
          {t(role === 'tutor' ? 'fees.declineTutor' : 'fees.declineClient')}
        </Button>
      </Form>
      <Form method="post" onSubmit={confirmFirst}>
        <input type="hidden" name="intent" value="acknowledge" />
        {hidden}
        <Button type="submit" disabled={busy}>
          {t(role === 'tutor' ? 'fees.acknowledgeTutor' : 'fees.acknowledgeClient')}
        </Button>
      </Form>
    </div>
  );
}

/** "Chị Mai ghi nhận đã trả 1.440.000 ₫ cho Toán 8 – Bé Minh" và dòng phụ (hình thức, ngày trả, tháng). */
export function PaymentSummary({
  payment,
  className,
  month,
}: {
  payment: Payment;
  className: string;
  month: string;
}) {
  const { t, i18n } = useTranslation();
  const values = {
    name: payment.recordedByName,
    amount: vnd(i18n.language, payment.amountVnd),
    className,
  };
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-semibold">
        {payment.recordedBy === 'client'
          ? t('fees.awaitingByClient', values)
          : t('fees.awaitingByTutor', values)}
      </span>
      <span className="text-small text-muted-foreground">
        {t('fees.awaitingMeta', {
          method: t(`paymentMethod.${payment.method}`),
          date: formatDate(payment.paidOn, i18n.language),
          month: shortMonth(month),
        })}
        {payment.reference && ` · ${payment.reference}`}
      </span>
    </div>
  );
}
