// /app/classes: lớp học của gia sư, phụ huynh, học sinh (G6, canvas ClassList). Tab "Đang học" (đang học, tạm nghỉ)
// và "Đã kết thúc" (vẫn tra cứu được lịch sử). Mỗi lớp: tên, bên kia, học phí (không hiện cho học sinh), đề xuất đổi
// học phí đang chờ, trạng thái.
import { ClassList } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Badge } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { loadSubjects } from '~/lib/catalog.server';
import { CLASS_STATUS_BADGE, classTitle, vnd } from '~/lib/classes';
import { formatDate } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { cn } from '~/lib/utils';
import type { Route } from './+types/index';

const STATES = ['current', 'ended'] as const;
type State = (typeof STATES)[number];

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.classes.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context, { roles: ['tutor', 'parent', 'student'] });
  const url = new URL(request.url);
  const state: State = url.searchParams.get('state') === 'ended' ? 'ended' : 'current';
  const { locale } = await readPreferences(request);
  const [list, subjects] = await Promise.all([
    getServerApi(context).call(`/api/v1/classes?state=${state}&pageSize=100`, {
      schema: ClassList,
    }),
    loadSubjects(context, locale),
  ]);
  return {
    list,
    subjects,
    state,
    isTutor: user.roles.includes('tutor'),
    hasFees: user.roles.includes('tutor') || user.roles.includes('parent'),
  };
}

export default function ClassesPage({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const { list, subjects, state, isTutor, hasFees } = loaderData;
  const tab = (active: boolean) =>
    cn(
      'inline-flex min-h-control-md items-center border-b-2 px-3 font-semibold no-underline',
      active
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    );

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{t('classes.title')}</h1>
          <p className="text-muted-foreground">{t('classes.lead')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasFees && (
            <Link to={PATHS.fees} className={buttonVariants({ variant: 'secondary' })}>
              {t('fees.title')}
            </Link>
          )}
          <Link to={PATHS.schedule} className={buttonVariants({ variant: 'secondary' })}>
            {t('classes.openSchedule')}
          </Link>
        </div>
      </div>

      <nav aria-label={t('classes.stateFilter')} className="flex gap-1 border-b border-border">
        {STATES.map((s) => (
          <Link
            key={s}
            to={`${PATHS.classes}?state=${s}`}
            aria-current={s === state ? 'page' : undefined}
            className={tab(s === state)}
          >
            {t(s === 'current' ? 'classes.tabCurrent' : 'classes.tabEnded')}
          </Link>
        ))}
      </nav>

      {list.items.length === 0 ? (
        <Card className="items-start">
          <h2 className="text-h3">
            {state === 'current' ? t('classes.emptyTitle') : t('classes.emptyEndedTitle')}
          </h2>
          <p className="text-muted-foreground">
            {isTutor ? t('classes.emptyTutor') : t('classes.emptyOther')}
          </p>
          <Link to={PATHS.connections} className={buttonVariants({ variant: 'secondary' })}>
            {t('nav.connections')}
          </Link>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((c) => {
            const title = classTitle({ ...c, learnerName: c.learner.name }, subjects);
            const counterpart =
              c.myRole === 'tutor'
                ? t('classes.withParent', { name: c.client.displayName })
                : t('classes.withTutor', { name: c.tutor.displayName });
            return (
              <li key={c.enrollmentId}>
                <Card className="flex-row flex-wrap items-center gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`${PATHS.classes}/${c.id}`}
                        className="font-semibold text-foreground hover:text-primary"
                      >
                        {title}
                      </Link>
                      <Badge variant={CLASS_STATUS_BADGE[c.status]} dot>
                        {t(`tutoringClassStatus.${c.status}`)}
                      </Badge>
                      {c.feeChangePending && (
                        <Badge variant="warning">
                          {c.myRole === 'client'
                            ? t('classes.feeAwaitingYou')
                            : t('classes.feeAwaitingParent')}
                        </Badge>
                      )}
                    </div>
                    <span className="text-small text-muted-foreground">
                      {[
                        counterpart,
                        t(`teachingMode.${c.teachingMode}`),
                        c.endedOn
                          ? t('classes.endedOn', { date: formatDate(c.endedOn, i18n.language) })
                          : t('classes.since', { date: formatDate(c.startedOn, i18n.language) }),
                      ].join(' · ')}
                    </span>
                  </div>
                  {c.currentFee && (
                    <span className="text-small">
                      {t('classes.feeLine', {
                        price: vnd(i18n.language, c.currentFee.sessionPriceVnd),
                        minutes: c.currentFee.sessionMinutes,
                      })}
                    </span>
                  )}
                  <Link
                    to={`${PATHS.classes}/${c.id}`}
                    className={buttonVariants({ variant: 'secondary' })}
                  >
                    {t('classes.open')}
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
