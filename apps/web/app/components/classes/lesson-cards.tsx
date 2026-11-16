// Khối buổi học trên trang tổng quan (G6, canvas TutorHome, ParentHome, StudentHome): việc cần làm (gia sư: buổi chưa
// điểm danh; phụ huynh: buổi chờ xác nhận) và lịch 7 ngày tới. Mỗi khối tối đa 5 dòng, kèm liên kết xem tất cả.
import type { Lesson } from '@tps/shared';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { CountBadge } from '~/components/ui/count-badge';
import type { CatalogOption } from '~/lib/catalog';
import { classTitle, lessonBadge, lessonWhen } from '~/lib/classes';
import { PATHS } from '~/lib/navigation';

export interface LessonActivity {
  /** Buổi đang chờ người xem làm gì đó. */
  todo: Lesson[];
  /** Buổi trong 7 ngày tới. */
  upcoming: Lesson[];
}

const SHOWN = 5;

function LessonRow({ lesson, subjects }: { lesson: Lesson; subjects: readonly CatalogOption[] }) {
  const { t } = useTranslation();
  const badge = lessonBadge(lesson);
  return (
    <li>
      <Link
        to={`${PATHS.classes}/${lesson.classId}/lessons/${lesson.id}`}
        className="flex flex-wrap items-center gap-3 rounded-md px-2 py-2 text-foreground no-underline hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">
            {classTitle(
              {
                name: lesson.className,
                subjectId: lesson.subjectId,
                learnerName: lesson.learnerNames.join(', '),
              },
              subjects,
            )}
          </span>
          <span className="text-small text-muted-foreground">
            {lessonWhen(t, lesson)}
            {lesson.myRole !== 'tutor' && ` · ${lesson.tutorName}`}
          </span>
        </span>
        <Badge variant={badge.variant}>{t(badge.key)}</Badge>
        <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
      </Link>
    </li>
  );
}

export function LessonCards({
  activity,
  role,
  subjects,
}: {
  activity: LessonActivity;
  role: 'tutor' | 'parent' | 'student';
  subjects: readonly CatalogOption[];
}) {
  const { t } = useTranslation();
  const showTodo = role !== 'student';
  return (
    <div className={showTodo ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4'}>
      {showTodo && (
        <Card className="gap-3 sm:p-6">
          <CardHeader>
            <h2 className="flex items-center gap-2 text-h3">
              {role === 'tutor' ? t('lessonHome.todoTutor') : t('lessonHome.todoParent')}
              {activity.todo.length > 0 && (
                <CountBadge count={activity.todo.length} label={String(activity.todo.length)} />
              )}
            </h2>
          </CardHeader>
          <p className="text-small text-muted-foreground">
            {role === 'tutor' ? t('lessonHome.todoTutorLead') : t('lessonHome.todoParentLead')}
          </p>
          {activity.todo.length > 0 && (
            <ul className="flex flex-col">
              {activity.todo.slice(0, SHOWN).map((l) => (
                <LessonRow key={l.id} lesson={l} subjects={subjects} />
              ))}
            </ul>
          )}
        </Card>
      )}
      <Card className="gap-3 sm:p-6">
        <CardHeader>
          <h2 className="text-h3">
            {role === 'tutor' ? t('lessonHome.upcomingTutorTitle') : t('lessonHome.upcomingTitle')}
          </h2>
          <Link to={PATHS.schedule} className={buttonVariants({ variant: 'ghost' })}>
            {t('lessonHome.viewSchedule')}
          </Link>
        </CardHeader>
        {activity.upcoming.length === 0 ? (
          <p className="text-small text-muted-foreground">{t('lessonHome.upcomingEmpty')}</p>
        ) : (
          <ul className="flex flex-col">
            {activity.upcoming.slice(0, SHOWN).map((l) => (
              <LessonRow key={l.id} lesson={l} subjects={subjects} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
