// /app/connections: hộp yêu cầu kết nối của gia sư và phụ huynh (G5, §5). Tab "Đang mở" (chờ phản hồi, đang trao
// đổi) và "Đã kết thúc"; lọc đã nhận / đã gửi. Mỗi yêu cầu: bên kia, nhu cầu, trạng thái, "Chờ bạn" khi người xem
// phải làm gì đó, liên kết tới chi tiết và cuộc trò chuyện. Gia sư không thấy tên con hay tên phụ huynh khi yêu cầu
// chưa được chấp nhận (D16): API không trả.
import { ConnectionRequestList } from '@tps/shared';
import { MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AvatarImage } from '~/components/account/avatar-field';
import { PageContainer } from '~/components/layout/page';
import { Pagination } from '~/components/marketplace/pagination';
import { Badge } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { loadCatalogs } from '~/lib/catalog.server';
import { CONNECTION_STATUS_BADGE, counterpartName, needSummary } from '~/lib/connections';
import { formatDate, formatDateTime } from '~/lib/format';
import { pageCount } from '~/lib/marketplace';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { cn } from '~/lib/utils';
import type { Route } from './+types/index';

const PAGE_SIZE = 20;
const STATES = ['open', 'closed'] as const;
const BOXES = ['all', 'received', 'sent'] as const;
type State = (typeof STATES)[number];
type Box = (typeof BOXES)[number];

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.connections.title} – ${m.common.appName}` }];
}

const oneOf = <T extends string>(values: readonly T[], value: string | null, fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback;

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const url = new URL(request.url);
  const state = oneOf(STATES, url.searchParams.get('state'), 'open');
  const box = oneOf(BOXES, url.searchParams.get('box'), 'all');
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const query = new URLSearchParams({ state, page: String(page), pageSize: String(PAGE_SIZE) });
  if (box !== 'all') query.set('box', box);
  const { locale } = await readPreferences(request);
  const [list, catalogs] = await Promise.all([
    getServerApi(context).call(`/api/v1/connection-requests?${query.toString()}`, {
      schema: ConnectionRequestList,
    }),
    loadCatalogs(context, locale),
  ]);
  return { list, catalogs, state, box, isTutor: user.roles.includes('tutor') };
}

export default function ConnectionsPage({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const { list, catalogs, state, box, isTutor } = loaderData;
  const href = (next: { state?: State; box?: Box }) => {
    const params = new URLSearchParams({ state: next.state ?? state });
    const nextBox = next.box ?? box;
    if (nextBox !== 'all') params.set('box', nextBox);
    return `${PATHS.connections}?${params.toString()}`;
  };
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
          <h1 className="text-h1">{t('connections.title')}</h1>
          <p className="text-muted-foreground">
            {isTutor ? t('connections.leadTutor') : t('connections.leadParent')}
          </p>
        </div>
        <Link to={PATHS.messages} className={buttonVariants({ variant: 'secondary' })}>
          <MessageSquare aria-hidden="true" />
          {t('chat.allConversations')}
        </Link>
      </div>

      <nav aria-label={t('connections.stateFilter')} className="flex gap-1 border-b border-border">
        {STATES.map((s) => (
          <Link
            key={s}
            to={href({ state: s })}
            aria-current={s === state ? 'page' : undefined}
            className={tab(s === state)}
          >
            {t(s === 'open' ? 'connections.tabOpen' : 'connections.tabClosed')}
          </Link>
        ))}
      </nav>
      <nav aria-label={t('connections.boxFilter')} className="flex flex-wrap gap-2">
        {BOXES.map((b) => (
          <Link
            key={b}
            to={href({ box: b })}
            aria-current={b === box ? 'page' : undefined}
            className={buttonVariants({ variant: b === box ? 'secondary' : 'ghost' })}
          >
            {t(`connections.box_${b}`)}
          </Link>
        ))}
      </nav>

      {list.items.length === 0 ? (
        <Card className="items-start">
          <h2 className="text-h3">{t('connections.emptyTitle')}</h2>
          <p className="text-muted-foreground">
            {isTutor ? t('connections.emptyTutor') : t('connections.emptyParent')}
          </p>
          <Link
            to={isTutor ? PATHS.findStudents : PATHS.findTutors}
            className={buttonVariants({ variant: 'secondary' })}
          >
            {isTutor ? t('nav.findStudents') : t('nav.findTutors')}
          </Link>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((r) => {
            const name = counterpartName(t, r);
            return (
              <li key={r.id}>
                <Card className="flex-row flex-wrap items-start gap-4">
                  <AvatarImage
                    avatarUrl={r.myRole === 'client' ? r.tutor.avatarUrl : null}
                    displayName={name}
                    className="size-12"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`${PATHS.connections}/${r.id}`}
                        className="font-semibold text-foreground hover:text-primary"
                      >
                        {name}
                      </Link>
                      <Badge variant={CONNECTION_STATUS_BADGE[r.status]}>
                        {t(`connectionRequestStatus.${r.status}`)}
                      </Badge>
                      {r.awaitingMe && (
                        <Badge variant="new" dot>
                          {t('connections.awaitingYou')}
                        </Badge>
                      )}
                    </div>
                    <span className="text-small text-muted-foreground">
                      {needSummary(t, r.need, catalogs)}
                      {r.learner && ` · ${t('connections.forChild', { name: r.learner.name })}`}
                    </span>
                    <span className="text-small text-muted-foreground">
                      {r.isSender
                        ? t('connections.sentOn', { date: formatDate(r.createdAt, i18n.language) })
                        : t('connections.receivedOn', {
                            date: formatDate(r.createdAt, i18n.language),
                          })}
                      {r.expiresAt &&
                        ` · ${t('connections.expiresAt', {
                          date: formatDateTime(r.expiresAt, i18n.language),
                        })}`}
                      {r.cancelReason && ` · ${t(`connectionCancelReason.${r.cancelReason}`)}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.conversationId && (
                      <Link
                        to={`${PATHS.messages}/${r.conversationId}`}
                        className={buttonVariants({ variant: 'ghost' })}
                      >
                        <MessageSquare aria-hidden="true" />
                        {t('connections.openChat')}
                      </Link>
                    )}
                    <Link
                      to={`${PATHS.connections}/${r.id}`}
                      className={buttonVariants({ variant: 'secondary' })}
                    >
                      {t('connections.view')}
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount(list.total, PAGE_SIZE) > 1 && (
        <Pagination
          pathname={PATHS.connections}
          params={new URLSearchParams(box === 'all' ? { state } : { state, box })}
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          maxPage={Number.MAX_SAFE_INTEGER}
        />
      )}
    </PageContainer>
  );
}
