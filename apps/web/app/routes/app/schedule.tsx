// /app/schedule: lịch dạy (gia sư) / lịch học (phụ huynh, học sinh) theo tuần hoặc tháng (G6, canvas TeachSchedule).
// `?view=week|month&date=YYYY-MM-DD` (ngày bất kỳ trong tuần / tháng cần xem). Mọi buổi của các lớp người xem thấy;
// chữ và màu của từng buổi theo trạng thái (chưa điểm danh, học bù, đã hủy). Điện thoại: danh sách theo ngày.
import { LessonList } from '@tps/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Badge } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { loadSubjects } from '~/lib/catalog.server';
import {
  addDays,
  classTitle,
  dayMonth,
  isoWeekday,
  lessonBadge,
  mondayOf,
  vnDate,
  vnInstant,
  vnTime,
} from '~/lib/classes';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { cn } from '~/lib/utils';
import type { Route } from './+types/schedule';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.schedule.title} – ${m.common.appName}` }];
}

/** Ngày đầu và ngày sau ngày cuối của khung đang xem (tháng: đủ các tuần chứa tháng đó, tối đa 42 ngày). */
function frame(view: 'week' | 'month', date: string) {
  if (view === 'week') {
    const start = mondayOf(date);
    return { start, end: addDays(start, 7) };
  }
  const first = `${date.slice(0, 8)}01`;
  const nextMonth = addDays(`${date.slice(0, 8)}28`, 4).slice(0, 8) + '01';
  const start = mondayOf(first);
  const end = addDays(mondayOf(addDays(nextMonth, -1)), 7);
  return { start, end };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context, { roles: ['tutor', 'parent', 'student'] });
  const url = new URL(request.url);
  const view = url.searchParams.get('view') === 'month' ? 'month' : 'week';
  const today = vnDate(new Date());
  const requested = url.searchParams.get('date') ?? '';
  const date = ISO_DATE.test(requested) ? requested : today;
  const { start, end } = frame(view, date);
  const query = new URLSearchParams({
    from: vnInstant(start, '00:00'),
    to: vnInstant(end, '00:00'),
  });
  const { locale } = await readPreferences(request);
  const [lessons, subjects] = await Promise.all([
    getServerApi(context).call(`/api/v1/lessons?${query.toString()}`, { schema: LessonList }),
    loadSubjects(context, locale),
  ]);
  return {
    lessons: lessons.items,
    subjects,
    view,
    date,
    start,
    end,
    today,
    isTutor: user.roles.includes('tutor'),
  } as const;
}

export default function SchedulePage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { lessons, subjects, view, date, start, end, today, isTutor } = loaderData;
  const days: string[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, typeof lessons>();
  for (const lesson of lessons) {
    const key = vnDate(lesson.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), lesson]);
  }
  const step = view === 'week' ? 7 : 31;
  const href = (next: { view?: string; date?: string }) =>
    `${PATHS.schedule}?view=${next.view ?? view}&date=${next.date ?? date}`;
  const prevDate = view === 'week' ? addDays(date, -step) : addDays(`${date.slice(0, 8)}01`, -1);
  const nextDate = view === 'week' ? addDays(date, step) : addDays(`${date.slice(0, 8)}28`, 4);
  const month = date.slice(0, 7);
  const heading =
    view === 'week'
      ? `${dayMonth(start)} – ${dayMonth(addDays(end, -1))}/${addDays(end, -1).slice(0, 4)}`
      : t('schedule.monthHeading', { month: date.slice(5, 7), year: date.slice(0, 4) });

  const entry = (lesson: (typeof lessons)[number]) => {
    const badge = lessonBadge(lesson);
    const tone =
      lesson.status === 'cancelled' || lesson.status === 'tutor_absent'
        ? 'bg-surface-sunken text-muted-foreground'
        : lesson.awaitingMe
          ? 'border-warning bg-warning-subtle'
          : lesson.makeupForLessonId
            ? 'border-primary bg-primary-subtle'
            : 'bg-surface';
    return (
      <Link
        key={lesson.id}
        to={`${PATHS.classes}/${lesson.classId}/lessons/${lesson.id}`}
        className={cn(
          'flex flex-col gap-0.5 rounded-md border border-border p-2 text-small text-foreground no-underline hover:border-primary',
          tone,
        )}
      >
        <span className={cn('font-semibold', lesson.status === 'cancelled' && 'line-through')}>
          {vnTime(lesson.startsAt)}{' '}
          {classTitle(
            {
              name: lesson.className,
              subjectId: lesson.subjectId,
              learnerName: lesson.learnerNames.join(', '),
            },
            subjects,
          )}
        </span>
        {!isTutor && <span>{lesson.tutorName}</span>}
        <span className="text-muted-foreground">{t(badge.key)}</span>
      </Link>
    );
  };

  return (
    <PageContainer>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-h1">{isTutor ? t('nav.teachSchedule') : t('nav.learnSchedule')}</h1>
          <span className="text-muted-foreground">
            {heading} · {t('schedule.count', { count: lessons.length })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={href({ date: prevDate })}
            aria-label={view === 'week' ? t('schedule.prevWeek') : t('schedule.prevMonth')}
            className={buttonVariants({ variant: 'secondary', size: 'icon' })}
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
          <Link to={href({ date: today })} className={buttonVariants({ variant: 'secondary' })}>
            {view === 'week' ? t('schedule.thisWeek') : t('schedule.thisMonth')}
          </Link>
          <Link
            to={href({ date: nextDate })}
            aria-label={view === 'week' ? t('schedule.nextWeek') : t('schedule.nextMonth')}
            className={buttonVariants({ variant: 'secondary', size: 'icon' })}
          >
            <ChevronRight aria-hidden="true" />
          </Link>
          <nav aria-label={t('schedule.viewLabel')} className="flex gap-1">
            {(['week', 'month'] as const).map((v) => (
              <Link
                key={v}
                to={href({ view: v })}
                aria-current={v === view ? 'page' : undefined}
                className={buttonVariants({ variant: v === view ? 'secondary' : 'ghost' })}
              >
                {t(v === 'week' ? 'schedule.week' : 'schedule.month')}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-small" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-border bg-surface" />
          {t('schedule.legendLesson')}
        </span>
        {isTutor && (
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-warning bg-warning-subtle" />
            {t('schedule.legendAttendance')}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-primary bg-primary-subtle" />
          {t('schedule.legendMakeup')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-surface-sunken" />
          {t('schedule.legendCancelled')}
        </span>
      </div>

      {/* Máy tính: lưới 7 cột. */}
      <Card className="hidden gap-2 p-3 lg:grid lg:grid-cols-7">
        {days.map((day) => {
          const outside = view === 'month' && day.slice(0, 7) !== month;
          return (
            <div
              key={day}
              className={cn(
                'flex min-h-28 min-w-0 flex-col gap-2',
                view === 'week' && 'min-h-96',
                outside && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'flex flex-col items-center rounded-md py-1 text-small',
                  day === today && 'bg-primary text-primary-foreground',
                )}
              >
                <span>
                  {t(`schedule.weekdayShort${isoWeekday(day)}` as 'schedule.weekdayShort1')}
                </span>
                <span className="font-semibold">{dayMonth(day)}</span>
              </span>
              {(byDay.get(day) ?? []).map(entry)}
            </div>
          );
        })}
      </Card>

      {/* Điện thoại, máy tính bảng: danh sách các ngày có buổi học. */}
      <div className="flex flex-col gap-3 lg:hidden">
        {lessons.length === 0 && (
          <Card>
            <p className="text-muted-foreground">{t('schedule.empty')}</p>
          </Card>
        )}
        {days
          .filter((day) => byDay.has(day))
          .map((day) => (
            <Card key={day} className="gap-2">
              <h2 className="flex items-center gap-2 text-label">
                {t(`weekday.${isoWeekday(day)}` as 'weekday.1')} {dayMonth(day)}
                {day === today && <Badge variant="verified">{t('schedule.today')}</Badge>}
              </h2>
              {(byDay.get(day) ?? []).map(entry)}
            </Card>
          ))}
      </div>
      {lessons.length === 0 && (
        <p className="hidden text-muted-foreground lg:block">{t('schedule.empty')}</p>
      )}
    </PageContainer>
  );
}
