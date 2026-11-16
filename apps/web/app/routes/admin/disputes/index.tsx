// /admin/disputes: hàng chờ tranh chấp buổi học của Manager (G6, B.8; canvas Disputes). Khiếu nại được chuyển đến khi
// hai bên chưa thống nhất sau 3 ngày, hoặc khi một bên yêu cầu (D38). `?status=escalated|resolved_by_manager`,
// `?page=`, `?done=1` báo vừa quyết định xong. Không có danh tính của trẻ.
import { AdminDisputeList } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { labelOf } from '~/lib/catalog';
import { loadSubjects } from '~/lib/catalog.server';
import { lessonWhen } from '~/lib/classes';
import { formatDate } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { cn } from '~/lib/utils';
import type { Route } from './+types/index';

const STATUSES = ['escalated', 'resolved_by_manager'] as const;

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.nav.disputes} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['manager'] });
  const url = new URL(request.url);
  const status =
    url.searchParams.get('status') === 'resolved_by_manager' ? 'resolved_by_manager' : 'escalated';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const { locale } = await readPreferences(request);
  const [list, subjects] = await Promise.all([
    getServerApi(context).call(`/api/v1/admin/attendance-disputes?status=${status}&page=${page}`, {
      schema: AdminDisputeList,
    }),
    loadSubjects(context, locale),
  ]);
  return { list, subjects, status, done: url.searchParams.get('done') === '1' };
}

export default function DisputesQueuePage({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const { list, subjects, status, done } = loaderData;
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const tab = (active: boolean) =>
    cn(
      'inline-flex min-h-control-md items-center border-b-2 px-3 font-semibold no-underline',
      active
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    );

  return (
    <PageContainer>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('nav.disputes')}</h1>
        <p className="text-small text-muted-foreground">{t('disputesAdmin.lead')}</p>
      </div>
      {done && (
        <Alert variant="success" role="status">
          {t('disputesAdmin.doneNotice')}
        </Alert>
      )}
      <nav aria-label={t('disputesAdmin.filter')} className="flex gap-1 border-b border-border">
        {STATUSES.map((s) => (
          <Link
            key={s}
            to={`${PATHS.adminDisputes}?status=${s}`}
            aria-current={s === status ? 'page' : undefined}
            className={tab(s === status)}
          >
            {t(`attendanceDisputeStatus.${s}`)}
          </Link>
        ))}
      </nav>
      {list.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground">{t('disputesAdmin.empty')}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((d) => (
            <li key={d.id}>
              <Card className="flex-row flex-wrap items-center gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    to={`${PATHS.adminDisputes}/${d.id}`}
                    className="font-semibold text-foreground hover:text-primary"
                  >
                    {labelOf(subjects, d.subjectId)} · {lessonWhen(t, d.lesson)}
                  </Link>
                  <span className="text-small text-muted-foreground">
                    {t('disputesAdmin.parties', { tutor: d.tutorName, client: d.clientName })}
                    {' · '}
                    {t('disputesAdmin.openedOn', { date: formatDate(d.createdAt, i18n.language) })}
                  </span>
                  <span className="line-clamp-2 text-small">{d.reason}</span>
                </div>
                <Badge variant={d.status === 'escalated' ? 'danger' : 'neutral'}>
                  {t(`attendanceDisputeStatus.${d.status}`)}
                </Badge>
                <Link
                  to={`${PATHS.adminDisputes}/${d.id}`}
                  className={buttonVariants({ variant: 'secondary' })}
                >
                  {t('disputesAdmin.open')}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label={t('disputesAdmin.pages')} className="flex flex-wrap gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              to={`${PATHS.adminDisputes}?status=${status}&page=${p}`}
              aria-current={p === list.page ? 'page' : undefined}
              className={buttonVariants({ variant: p === list.page ? 'secondary' : 'ghost' })}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </PageContainer>
  );
}
