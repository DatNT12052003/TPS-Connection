// /app/messages: các cuộc trò chuyện của gia sư hoặc phụ huynh (G5, §5.4), hoạt động gần nhất trước: bên kia, môn,
// tin cuối, số tin chưa đọc. Cuộc trò chuyện mở khi yêu cầu kết nối được chấp nhận (D14); yêu cầu đã hủy thì chỉ còn
// xem (D32).
import { ConversationList } from '@tps/shared';
import { MessageSquareOff, Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AvatarImage } from '~/components/account/avatar-field';
import { PageContainer } from '~/components/layout/page';
import { Pagination } from '~/components/marketplace/pagination';
import { Badge } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { CountBadge } from '~/components/ui/count-badge';
import { labelOf } from '~/lib/catalog';
import { loadSubjects } from '~/lib/catalog.server';
import { lastMessagePreview } from '~/lib/chat';
import { formatDateTime } from '~/lib/format';
import { pageCount } from '~/lib/marketplace';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { cn } from '~/lib/utils';
import type { Route } from './+types/index';

const PAGE_SIZE = 20;

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.chat.listTitle} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const page = Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1);
  const { locale } = await readPreferences(request);
  const [list, subjects] = await Promise.all([
    getServerApi(context).call(`/api/v1/conversations?page=${page}&pageSize=${PAGE_SIZE}`, {
      schema: ConversationList,
    }),
    loadSubjects(context, locale),
  ]);
  return { list, subjects };
}

export default function ConversationsPage({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const { list, subjects } = loaderData;

  return (
    <PageContainer className="max-w-3xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('chat.listTitle')}</h1>
        <p className="text-muted-foreground">{t('chat.listLead')}</p>
      </div>

      {list.items.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <MessageSquareOff aria-hidden="true" className="size-8 text-muted-foreground" />
          <p className="text-muted-foreground">{t('chat.emptyList')}</p>
          <Link to={PATHS.connections} className={buttonVariants({ variant: 'secondary' })}>
            {t('connections.title')}
          </Link>
        </Card>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
          {list.items.map((c) => {
            const unread = c.unreadCount > 0;
            return (
              <li key={c.id} className="border-b border-border last:border-b-0">
                <Link
                  to={`${PATHS.messages}/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 text-foreground no-underline hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <AvatarImage
                    avatarUrl={c.counterpart.avatarUrl}
                    displayName={c.counterpart.displayName}
                    className="size-11"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cn('truncate', unread ? 'font-bold' : 'font-semibold')}>
                        {c.counterpart.displayName}
                      </span>
                      <span className="text-small text-muted-foreground">
                        {[labelOf(subjects, c.subjectId), c.learner?.name]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {!c.canSend && <Badge variant="neutral">{t('chat.readOnlyBadge')}</Badge>}
                    </span>
                    <span
                      className={cn(
                        'flex items-center gap-1 truncate text-small',
                        unread ? 'font-semibold text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {c.lastMessage?.hasAttachments && (
                        <Paperclip aria-hidden="true" className="size-3.5 shrink-0" />
                      )}
                      <span className="truncate">{lastMessagePreview(t, c)}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {c.lastMessageAt && (
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(c.lastMessageAt, i18n.language)}
                      </span>
                    )}
                    <CountBadge
                      count={c.unreadCount}
                      label={t('chat.unreadCount', { count: c.unreadCount })}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount(list.total, PAGE_SIZE) > 1 && (
        <Pagination
          pathname={PATHS.messages}
          params={new URLSearchParams()}
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          maxPage={Number.MAX_SAFE_INTEGER}
        />
      )}
    </PageContainer>
  );
}
