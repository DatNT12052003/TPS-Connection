// Hiển thị và tìm kiếm marketplace (G4): tóm tắt môn × khối, khu vực, học phí, lịch; query string của các trang
// tìm kiếm. Dùng được cả ở server lẫn trình duyệt.
import type { AvailabilitySlot, TeachingSubject } from '@tps/shared';
import type { TFunction } from 'i18next';
import type { CatalogOption } from './catalog';
import { formatMoney, groupBySubject, summarizeGrades } from './tutor-profile';

export interface Catalogs {
  subjects: readonly CatalogOption[];
  grades: readonly CatalogOption[];
  provinces: readonly CatalogOption[];
}

/** "Toán Lớp 6 – Lớp 9; Vật lý Lớp 8, Lớp 9" theo thứ tự danh mục. Môn đã tắt thì bỏ. */
export function summarizeSubjects(
  pairs: readonly TeachingSubject[],
  subjects: readonly CatalogOption[],
  grades: readonly CatalogOption[],
): string {
  return [...groupBySubject(pairs)]
    .map(([subjectId, gradeIds]) => {
      const name = subjects.find((s) => s.id === subjectId)?.label;
      return name && `${name} ${summarizeGrades(gradeIds, grades)}`;
    })
    .filter(Boolean)
    .join('; ');
}

/** "200.000đ / buổi" (vi) theo đơn vị giờ hoặc buổi; dùng chung khóa của hồ sơ gia sư. */
export function rateLabel(
  t: TFunction,
  language: string,
  rate: { amountVnd: number; unit: 'hour' | 'session' },
): string {
  return t('tutorProfile.rateValue', {
    amount: formatMoney(rate.amountVnd, language),
    unit: t(rate.unit === 'hour' ? 'tutorProfile.perHour' : 'tutorProfile.perSession'),
  });
}

const BUDGET_UNIT_KEY = {
  hour: 'marketplace.budgetPerHour',
  session: 'marketplace.budgetPerSession',
  month: 'marketplace.budgetPerMonth',
} as const;

/** Khóa nhãn của một cách sắp xếp: `rate_asc` -> `sortRateAsc` (khóa i18n không lồng nhiều cấp). */
export function sortKey(value: string): string {
  const words = value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return `sort${words.join('')}`;
}

/** Ngân sách của nhu cầu: "150.000 – 200.000đ / buổi", "Đến 200.000đ / tháng", "Từ 150.000đ / giờ". */
export function budgetLabel(
  t: TFunction,
  language: string,
  budget: { minVnd: number | null; maxVnd: number | null; unit: 'hour' | 'session' | 'month' },
): string {
  const money = (n: number) => formatMoney(n, language);
  const unit = t(BUDGET_UNIT_KEY[budget.unit]);
  if (budget.minVnd !== null && budget.maxVnd !== null && budget.minVnd !== budget.maxVnd) {
    return t('marketplace.budgetRange', {
      min: money(budget.minVnd),
      max: money(budget.maxVnd),
      unit,
    });
  }
  if (budget.maxVnd !== null) {
    return budget.minVnd === null
      ? t('marketplace.budgetUpTo', { amount: money(budget.maxVnd), unit })
      : t('marketplace.budgetExact', { amount: money(budget.maxVnd), unit });
  }
  return t('marketplace.budgetFrom', { amount: money(budget.minVnd ?? 0), unit });
}

/** "Thứ Hai, Thứ Tư: 18:00–20:00 · Chủ nhật: 08:00–11:00": gộp các ngày có cùng khung giờ. */
export function summarizeSlots(t: TFunction, slots: readonly AvailabilitySlot[]): string {
  const byRange = new Map<string, number[]>();
  for (const slot of slots) {
    const range = `${slot.startTime}–${slot.endTime}`;
    byRange.set(range, [...(byRange.get(range) ?? []), slot.weekday]);
  }
  return [...byRange]
    .map(
      ([range, days]) =>
        `${days.map((d) => t(`weekday.${d}` as 'weekday.1')).join(', ')}: ${range}`,
    )
    .join(' · ');
}

/** Tên khu vực đã tra (tỉnh, hoặc "Phường Ba Đình, Hà Nội"). */
export function areaLabel(
  area: { label: string; level: 'province' | 'commune'; provinceId: number },
  provinces: readonly CatalogOption[],
): string {
  if (area.level === 'province') return area.label;
  const province = provinces.find((p) => p.id === area.provinceId)?.label;
  return province ? `${area.label}, ${province}` : area.label;
}

// ---- Query string của trang tìm kiếm -------------------------------------------------------------

/**
 * Query gửi API từ query của trang: chỉ giữ các khóa cho phép và có giá trị. Giá trị sai để API báo 422, trang
 * hiện thông báo và kết quả rỗng thay vì lỗi 500.
 */
export function pickQuery(url: URL, keys: readonly string[]): URLSearchParams {
  const result = new URLSearchParams();
  for (const key of keys) {
    const value = url.searchParams.get(key)?.trim();
    if (value) result.set(key, value);
  }
  return result;
}

/** Đường dẫn trang `page` giữ nguyên các bộ lọc khác. */
export function pageHref(pathname: string, params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete('page');
  else next.set('page', String(page));
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Số trang (ít nhất 1). */
export const pageCount = (total: number, pageSize: number) =>
  Math.max(1, Math.ceil(total / pageSize));
