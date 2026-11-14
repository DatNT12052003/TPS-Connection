// /admin/verifications: hàng chờ xác minh của Manager (canvas ManagerQueue), là layout của màn duyệt
// /admin/verifications/:requestId. Từ 1024 px: hàng chờ bên trái, màn duyệt bên phải; nhỏ hơn: một trong hai.
//   ?kind=identity|credential lọc theo loại, ?page= phân trang, ?done=approved|rejected báo vừa xử lý xong.
// Hạn xử lý tính theo `now` của loader để HTML của server và trình duyệt giống nhau.
import { VerificationQueue, type VerificationQueueItem } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import {
  Link,
  NavLink,
  Outlet,
  type ShouldRevalidateFunctionArgs,
  useLocation,
  useParams,
} from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { formatDate, formatDateTime } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { cn } from '~/lib/utils';
import type { Route } from './+types/queue';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.review.title} – ${m.common.appName}` }];
}

const KINDS = ['identity', 'credential'] as const;
type Kind = (typeof KINDS)[number];
const HOUR_MS = 60 * 60 * 1000;

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['manager'] });
  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');
  const kind = KINDS.find((k) => k === kindParam) ?? null;
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const query = new URLSearchParams({ page: String(page) });
  if (kind) query.set('kind', kind);
  const queue = await getServerApi(context).call(
    `/api/v1/admin/verification-requests?${query.toString()}`,
    { schema: VerificationQueue },
  );
  const done = url.searchParams.get('done');
  return {
    queue,
    kind,
    now: new Date().toISOString(),
    done: done === 'approved' || done === 'rejected' ? done : null,
  };
}

/** Xem ảnh giấy tờ (intent `view`) không làm đổi hàng chờ: không tải lại. */
export function shouldRevalidate({
  formData,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return formData?.get('intent') === 'view' ? false : defaultShouldRevalidate;
}

export default function VerificationQueuePage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { queue, kind, now, done } = loaderData;
  const { requestId } = useParams();
  const pages = Math.max(1, Math.ceil(queue.total / queue.pageSize));
  const filterTo = (value: Kind | null) => (value ? `?kind=${value}` : '?');

  return (
    <PageContainer>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('review.title')}</h1>
        <p className="text-small text-muted-foreground">{t('review.intro')}</p>
      </div>
      {done && (
        <Alert variant="success" role="status">
          {t(done === 'approved' ? 'review.approvedNotice' : 'review.rejectedNotice')}
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <section className={cn('flex min-w-0 flex-col gap-4', requestId && 'hidden lg:flex')}>
          <nav aria-label={t('review.filterLabel')} className="flex flex-wrap gap-2">
            {(
              [
                [null, t('review.filterAll', { count: queue.counts.all })],
                ['identity', t('review.filterIdentity', { count: queue.counts.identity })],
                ['credential', t('review.filterCredential', { count: queue.counts.credential })],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={label}
                to={filterTo(value)}
                aria-current={kind === value ? 'page' : undefined}
                className={cn(
                  buttonVariants({ variant: 'secondary' }),
                  'aria-[current=page]:border-primary aria-[current=page]:bg-primary-subtle aria-[current=page]:text-primary-subtle-foreground',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          {queue.items.length === 0 ? (
            <Card className="p-6 text-muted-foreground">{t('review.empty')}</Card>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
              {queue.items.map((item) => (
                <QueueRow key={item.id} item={item} now={now} kind={kind} />
              ))}
            </ul>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between gap-2">
              <PageLink page={queue.page - 1} kind={kind} disabled={queue.page <= 1}>
                {t('review.previous')}
              </PageLink>
              <span className="text-small text-muted-foreground">
                {t('review.pageOf', { page: queue.page, pages })}
              </span>
              <PageLink page={queue.page + 1} kind={kind} disabled={queue.page >= pages}>
                {t('review.next')}
              </PageLink>
            </div>
          )}
        </section>

        <div className={cn('min-w-0', !requestId && 'hidden lg:block')}>
          <Outlet />
        </div>
      </div>
    </PageContainer>
  );
}

function QueueRow({
  item,
  now,
  kind,
}: {
  item: VerificationQueueItem;
  now: string;
  kind: Kind | null;
}) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const kindLabel =
    item.kind === 'credential'
      ? t('review.kindCredential', { title: item.credentialTitle ?? '' })
      : item.occupation === 'university_student'
        ? t('review.kindIdentityStudent')
        : t('review.kindIdentity');

  return (
    <li>
      <NavLink
        to={{ pathname: item.id, search: kind ? `?kind=${kind}` : '' }}
        state={{ from: location.search }}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-sunken aria-[current=page]:bg-primary-subtle"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{item.tutorName}</span>
          <span className="text-small text-muted-foreground">
            {kindLabel} ·{' '}
            {t('review.submittedAt', { time: formatDateTime(item.submittedAt, i18n.language) })}
            {item.attempt > 1 && ` · ${t('review.attempt', { n: item.attempt })}`}
          </span>
        </span>
        <DueBadge due={item.reviewDueAt} now={now} />
      </NavLink>
    </li>
  );
}

/** Hạn xử lý: quá hạn (đỏ), còn dưới 24 giờ (vàng), còn lại hiện ngày. */
export function DueBadge({ due, now }: { due: string; now: string }) {
  const { t, i18n } = useTranslation();
  const left = new Date(due).getTime() - new Date(now).getTime();
  if (left < 0) return <Badge variant="danger">{t('review.overdue')}</Badge>;
  if (left < 24 * HOUR_MS) {
    return (
      <Badge variant="warning">
        {t('review.dueInHours', { count: Math.max(1, Math.ceil(left / HOUR_MS)) })}
      </Badge>
    );
  }
  return (
    <span className="text-small text-muted-foreground">
      {t('review.dueOn', { date: formatDate(due, i18n.language) })}
    </span>
  );
}

function PageLink({
  page,
  kind,
  disabled,
  children,
}: {
  page: number;
  kind: Kind | null;
  disabled: boolean;
  children: string;
}) {
  if (disabled) return <span />;
  const search = new URLSearchParams({ page: String(page) });
  if (kind) search.set('kind', kind);
  return (
    <Link to={`?${search.toString()}`} className={buttonVariants({ variant: 'ghost' })}>
      {children}
    </Link>
  );
}
