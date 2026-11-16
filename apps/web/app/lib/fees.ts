// Hiển thị học phí (G7). Tháng luôn theo giờ Việt Nam, dạng `YYYY-MM`, để HTML do server dựng và trình duyệt dựng lại
// giống nhau.
import type { FeeLine, FeeStatement } from '@tps/shared';
import type { TFunction } from 'i18next';
import type { BadgeProps } from '~/components/ui/badge';
import { vnDate } from './classes';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Tháng hiện tại theo giờ Việt Nam (`YYYY-MM`) của thời điểm `now`. */
export const currentMonth = (now: number | Date = Date.now()) => vnDate(new Date(now)).slice(0, 7);

/** Tháng từ tham số URL; sai dạng hoặc không có thì tháng hiện tại. */
export function monthFromUrl(url: URL, now: number): string {
  const value = url.searchParams.get('month') ?? '';
  return MONTH.test(value) ? value : currentMonth(now);
}

/** Cộng `delta` tháng vào tháng `YYYY-MM`. */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** "Tháng 10/2026" / "10/2026". */
export const monthLabel = (t: TFunction, month: string) =>
  t('fees.monthLabel', { month: month.slice(5, 7), year: month.slice(0, 4) });

/** "10/2026": tháng trong câu ("Bảng học phí tháng 10/2026"). */
export const shortMonth = (month: string) => `${month.slice(5, 7)}/${month.slice(0, 4)}`;

/** Nhãn tình trạng một bảng học phí theo góc nhìn người xem; null: chưa lập bảng. */
export function statementBadge(statement: FeeStatement | null): {
  variant: BadgeProps['variant'];
  label: { key: string } | { status: FeeStatement['status'] };
} {
  if (!statement) return { variant: 'neutral', label: { key: 'fees.badgeProvisional' } };
  if (statement.awaitingMe) return { variant: 'warning', label: { key: 'fees.badgeAwaitingMe' } };
  if (statement.overdue) return { variant: 'danger', label: { key: 'fees.badgeOverdue' } };
  switch (statement.status) {
    case 'paid':
      return { variant: 'success', label: { status: 'paid' } };
    case 'partially_paid':
      return { variant: 'warning', label: { status: 'partially_paid' } };
    case 'void':
      return { variant: 'neutral', label: { status: 'void' } };
    default:
      return { variant: 'verified', label: { status: statement.status } };
  }
}

/** Chữ của nhãn `statementBadge`. */
export function statementBadgeText(t: TFunction, badge: ReturnType<typeof statementBadge>): string {
  return 'key' in badge.label
    ? t(badge.label.key as 'fees.badgeOverdue')
    : t(`feeStatementStatus.${badge.label.status}`);
}

export const FEE_LINE_BADGE: Record<FeeLine['state'], BadgeProps['variant']> = {
  billed: 'success',
  billable: 'success',
  pending_confirmation: 'warning',
  disputed: 'danger',
  not_billable: 'neutral',
  cancelled: 'neutral',
  not_recorded: 'warning',
  upcoming: 'neutral',
};

/** Cột "Điểm danh" của một buổi: buổi hủy / gia sư vắng theo trạng thái buổi, còn lại theo điểm danh học sinh. */
export function attendanceText(t: TFunction, line: FeeLine): string {
  if (line.lessonStatus === 'cancelled') {
    const base = t('lessonStatus.cancelled');
    return line.isLateCancellation ? `${base} · ${t('fees.lateCancel')}` : base;
  }
  if (line.lessonStatus === 'tutor_absent') return t('lessonStatus.tutor_absent');
  if (line.attendanceStatus) return t(`attendanceStatus.${line.attendanceStatus}`);
  return '—';
}
