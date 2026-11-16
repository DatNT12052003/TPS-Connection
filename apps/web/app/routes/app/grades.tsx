// /app/grades: điểm, nhận xét và mục tiêu học tập của học sinh qua mọi lớp (G6, §9; canvas StudentHome "Điểm và nhận
// xét"). Học sinh xem của mình, phụ huynh xem của con. Điểm luôn đi kèm nhận xét của gia sư; không xếp hạng, không so
// sánh giữa các học sinh.
import { ClassDetail, ClassList } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Badge } from '~/components/ui/badge';
import { Card, CardHeader } from '~/components/ui/card';
import { loadSubjects } from '~/lib/catalog.server';
import { classTitle } from '~/lib/classes';
import { formatDate } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import type { Route } from './+types/grades';

/** Số lớp đọc chi tiết tối đa (mỗi lớp một lần gọi API). */
const MAX_CLASSES = 20;

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.nav.grades} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['student', 'parent'] });
  const api = getServerApi(context);
  const { locale } = await readPreferences(request);
  const [list, subjects] = await Promise.all([
    api.call(`/api/v1/classes?pageSize=${MAX_CLASSES}`, { schema: ClassList }),
    loadSubjects(context, locale),
  ]);
  const ids = [...new Set(list.items.filter((c) => c.myRole !== 'tutor').map((c) => c.id))];
  const classes = await Promise.all(
    ids.map((id) => api.call(`/api/v1/classes/${id}`, { schema: ClassDetail })),
  );
  return { classes, subjects };
}

export default function GradesPage({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const { classes, subjects } = loaderData;
  const withResults = classes.filter((c) =>
    c.enrollments.some((e) => e.assessments.length > 0 || e.goals.length > 0),
  );

  return (
    <PageContainer>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('nav.grades')}</h1>
        <p className="text-muted-foreground">{t('grades.lead')}</p>
      </div>
      {withResults.length === 0 && (
        <Card>
          <p className="text-muted-foreground">{t('grades.empty')}</p>
        </Card>
      )}
      {withResults.map((cls) => (
        <Card key={cls.id} className="gap-4 sm:p-6">
          <CardHeader>
            <h2 className="text-h3">
              <Link to={`${PATHS.classes}/${cls.id}?tab=results`}>
                {classTitle({ ...cls, learnerName: cls.learner.name }, subjects)}
              </Link>
            </h2>
            <span className="text-small text-muted-foreground">
              {t('classes.withTutor', { name: cls.tutor.displayName })}
            </span>
          </CardHeader>
          {cls.enrollments.map((e) => (
            <div key={e.id} className="flex flex-col gap-4">
              {e.assessments.length > 0 && (
                <ul className="flex flex-col divide-y divide-border">
                  {e.assessments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-start gap-3 py-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-semibold">
                          {a.title}
                          <span className="font-normal text-muted-foreground">
                            {' · '}
                            {formatDate(a.assessedOn, i18n.language)}
                          </span>
                        </span>
                        <p className="whitespace-pre-line">{a.comment}</p>
                      </div>
                      {a.score !== null && (
                        <span className="text-h3">
                          {a.score}
                          <span className="text-small text-muted-foreground">/{a.maxScore}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {e.goals.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-label">{t('classes.tab_goals')}</h3>
                  <ul className="flex flex-col gap-2">
                    {e.goals.map((g) => (
                      <li key={g.id} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1">{g.description}</span>
                        <Badge variant={g.status === 'active' ? 'verified' : 'neutral'}>
                          {t(`learningGoalStatus.${g.status}`)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </Card>
      ))}
      <p className="text-small text-muted-foreground">{t('classes.noRanking')}</p>
    </PageContainer>
  );
}
