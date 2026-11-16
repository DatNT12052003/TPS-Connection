// Hiển thị lớp học, lịch và buổi học (G6). Giờ luôn theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè) để HTML do server
// dựng và trình duyệt dựng lại giống nhau.
import type {
  AttendanceConfirmationStatus,
  ClassSchedule,
  ClassSummary,
  Lesson,
  TutoringClassStatus,
} from '@tps/shared';
import type { TFunction } from 'i18next';
import type { BadgeProps } from '~/components/ui/badge';
import { type CatalogOption, labelOf } from './catalog';

export const CLASS_STATUS_BADGE: Record<TutoringClassStatus, BadgeProps['variant']> = {
  active: 'success',
  paused: 'warning',
  ended: 'neutral',
};

export const CONFIRMATION_BADGE: Record<AttendanceConfirmationStatus, BadgeProps['variant']> = {
  pending: 'warning',
  confirmed: 'success',
  auto_confirmed: 'success',
  disputed: 'danger',
  resolved: 'neutral',
};

/** Tên lớp: tên riêng của gia sư, không có thì "Môn – tên học sinh". */
export function classTitle(
  cls: Pick<ClassSummary, 'name' | 'subjectId'> & { learnerName: string },
  subjects: readonly CatalogOption[],
): string {
  if (cls.name) return cls.name;
  return [labelOf(subjects, cls.subjectId), cls.learnerName].filter(Boolean).join(' – ');
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad = (value: number) => String(value).padStart(2, '0');

/** Ngày theo giờ Việt Nam (`YYYY-MM-DD`) của một thời điểm. */
export function vnDate(instant: string | Date): string {
  return new Date(new Date(instant).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Giờ theo giờ Việt Nam (`HH:MM`) của một thời điểm. */
export function vnTime(instant: string | Date): string {
  return new Date(new Date(instant).getTime() + VN_OFFSET_MS).toISOString().slice(11, 16);
}

/** Thời điểm ISO từ ngày `YYYY-MM-DD` và giờ `HH:MM` theo giờ Việt Nam. */
export const vnInstant = (date: string, time: string) => `${date}T${time}:00+07:00`;

/** Thứ ISO (1 = thứ Hai … 7 = Chủ nhật) của ngày `YYYY-MM-DD`. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Cộng số ngày vào ngày `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

/** Thứ Hai của tuần chứa ngày `YYYY-MM-DD`. */
export const mondayOf = (date: string) => addDays(date, 1 - isoWeekday(date));

/** "dd/mm" của ngày `YYYY-MM-DD`. */
export const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** "Thứ Tư 12/11 · 19:00–20:30". */
export function lessonWhen(t: TFunction, lesson: Pick<Lesson, 'startsAt' | 'endsAt'>): string {
  const date = vnDate(lesson.startsAt);
  return `${t(`weekday.${isoWeekday(date)}` as 'weekday.1')} ${dayMonth(date)} · ${vnTime(lesson.startsAt)}–${vnTime(lesson.endsAt)}`;
}

/** "Thứ Hai, Thứ Tư · 18:00 · 90 phút". */
export function scheduleSummary(t: TFunction, schedule: ClassSchedule): string {
  const days = schedule.weekdays.map((d) => t(`weekday.${d}` as 'weekday.1')).join(', ');
  return `${days} · ${schedule.startTime} · ${t('classes.minutes', { count: schedule.durationMinutes })}`;
}

/** Tình trạng một buổi để hiện nhãn: theo trạng thái và việc đang chờ người xem. */
export function lessonBadge(lesson: Lesson): {
  variant: BadgeProps['variant'];
  key:
    | 'lessons.badgeUpcoming'
    | 'lessons.badgeNeedsAttendance'
    | 'lessons.badgeAwaitingRecord'
    | 'lessons.badgeHeld'
    | 'lessons.badgeTutorAbsent'
    | 'lessons.badgeCancelled';
} {
  switch (lesson.status) {
    case 'held':
      return { variant: 'success', key: 'lessons.badgeHeld' };
    case 'tutor_absent':
      return { variant: 'neutral', key: 'lessons.badgeTutorAbsent' };
    case 'cancelled':
      return { variant: 'neutral', key: 'lessons.badgeCancelled' };
    case 'scheduled':
      if (Date.parse(lesson.startsAt) > Date.now()) {
        return { variant: 'verified', key: 'lessons.badgeUpcoming' };
      }
      return lesson.myRole === 'tutor'
        ? { variant: 'warning', key: 'lessons.badgeNeedsAttendance' }
        : { variant: 'neutral', key: 'lessons.badgeAwaitingRecord' };
  }
}

/** Số tiền VND theo ngôn ngữ ("250.000 ₫"). */
export function vnd(language: string, amount: number): string {
  return new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

/** Giờ chọn được cho lịch và buổi lẻ: 06:00 đến 22:00, mỗi 15 phút. */
export const LESSON_TIMES = Array.from({ length: 65 }, (_, i) => {
  const minutes = 6 * 60 + i * 15;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
});

/** Thời lượng chọn được (phút). */
export const LESSON_DURATIONS = [45, 60, 75, 90, 105, 120, 150, 180] as const;
