// Hai khối trên trang tổng quan của gia sư và phụ huynh (G5, canvas TutorHome, ParentHome): yêu cầu kết nối đang
// chờ người xem làm gì đó, và các cuộc trò chuyện có tin chưa đọc. Mỗi khối tối đa 3 dòng, kèm "Xem tất cả".
import type { ConnectionRequestSummary, ConversationSummary } from '@tps/shared';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AvatarImage } from '~/components/account/avatar-field';
import { buttonVariants } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { CountBadge } from '~/components/ui/count-badge';
import type { CatalogOption } from '~/lib/catalog';
import { lastMessagePreview } from '~/lib/chat';
import { counterpartName, needSummary } from '~/lib/connections';
import { PATHS } from '~/lib/navigation';

export interface ConnectionsActivity {
  /** Yêu cầu đang mở mà người xem phải trả lời hoặc xác nhận. */
  awaiting: ConnectionRequestSummary[];
  /** Cuộc trò chuyện có tin chưa đọc. */
  unread: ConversationSummary[];
}

const SHOWN = 3;

export function ActivityCards({
  activity,
  subjects,
  grades,
}: {
  activity: ConnectionsActivity;
  subjects: readonly CatalogOption[];
  grades: readonly CatalogOption[];
}) {
  const { t } = useTranslation();
  const row =
    'flex items-center gap-3 rounded-md px-2 py-2 text-foreground no-underline hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-ring';
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="gap-3 sm:p-6">
        <CardHeader>
          <h2 className="text-h3">{t('connections.homeTitle')}</h2>
          <Link to={PATHS.connections} className={buttonVariants({ variant: 'ghost' })}>
            {t('connections.homeAll')}
            <ChevronRight aria-hidden="true" />
          </Link>
        </CardHeader>
        {activity.awaiting.length === 0 ? (
          <p className="text-small text-muted-foreground">{t('connections.homeNone')}</p>
        ) : (
          <>
            <p className="text-small font-semibold">
              {t('connections.homeAwaiting', { count: activity.awaiting.length })}
            </p>
            <ul className="flex flex-col">
              {activity.awaiting.slice(0, SHOWN).map((r) => (
                <li key={r.id}>
                  <Link to={`${PATHS.connections}/${r.id}`} className={row}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">{counterpartName(t, r)}</span>
                      <span className="truncate text-small text-muted-foreground">
                        {needSummary(t, r.need, { subjects, grades })}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card className="gap-3 sm:p-6">
        <CardHeader>
          <h2 className="text-h3">{t('chat.homeTitle')}</h2>
          <Link to={PATHS.messages} className={buttonVariants({ variant: 'ghost' })}>
            {t('connections.homeAll')}
            <ChevronRight aria-hidden="true" />
          </Link>
        </CardHeader>
        {activity.unread.length === 0 ? (
          <p className="text-small text-muted-foreground">{t('chat.homeNone')}</p>
        ) : (
          <ul className="flex flex-col">
            {activity.unread.slice(0, SHOWN).map((c) => (
              <li key={c.id}>
                <Link to={`${PATHS.messages}/${c.id}`} className={row}>
                  <AvatarImage
                    avatarUrl={c.counterpart.avatarUrl}
                    displayName={c.counterpart.displayName}
                    className="size-9"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{c.counterpart.displayName}</span>
                    <span className="truncate text-small text-muted-foreground">
                      {lastMessagePreview(t, c)}
                    </span>
                  </span>
                  <CountBadge
                    count={c.unreadCount}
                    label={t('chat.unreadCount', { count: c.unreadCount })}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
