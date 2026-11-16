// /app/notifications: trung tâm thông báo (G5, §12) của gia sư và phụ huynh. Mới nhất trước; lọc chưa đọc
// (`?unread=1`); bấm một thông báo thì đánh dấu đã đọc rồi mở trang đích (intent `open`); đánh dấu đã đọc hết
// (intent `read-all`). Thông báo mới đến qua realtime thì layout tải lại trang. Bật/tắt theo loại ở trang Tài khoản.
import { NotificationList, notificationHref } from '@tps/shared';
import { BellOff, CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Pagination } from '~/components/marketplace/pagination';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { loadSubjects } from '~/lib/catalog.server';
import { formText } from '~/lib/form';
import { formatDateTime } from '~/lib/format';
import { pageCount } from '~/lib/marketplace';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { notificationText } from '~/lib/notifications';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { cn } from '~/lib/utils';
import type { Route } from './+types/notifications';

const PAGE_SIZE = 20;

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.notificationCenter.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const unreadOnly = url.searchParams.get('unread') === '1';
  const { locale } = await readPreferences(request);
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (unreadOnly) query.set('unread', 'true');
  const [list, subjects] = await Promise.all([
    getServerApi(context).call(`/api/v1/notifications?${query.toString()}`, {
      schema: NotificationList,
    }),
    loadSubjects(context, locale),
  ]);
  return { list, subjects, unreadOnly };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const form = await request.formData();
  const intent = formText(form, 'intent');
  const api = getServerApi(context);
  if (intent === 'read-all') {
    await api.call('/api/v1/notifications/read-all', { method: 'POST' });
    return { ok: true as const };
  }
  if (intent === 'open') {
    const id = formText(form, 'notificationId');
    // Đã bị xóa hay không còn của mình thì vẫn mở trang đích; trang đó tự kiểm tra quyền.
    await api
      .call(`/api/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' })
      .catch(() => undefined);
    const to = formText(form, 'to');
    throw redirect(to.startsWith('/app/') ? to : PATHS.notifications);
  }
  throw data(null, { status: 400 });
}

export default function NotificationsPage({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const { list, subjects, unreadOnly } = loaderData;
  const busy = navigation.state !== 'idle';
  const params = new URLSearchParams(unreadOnly ? { unread: '1' } : {});

  return (
    <PageContainer className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{t('notificationCenter.title')}</h1>
          <p className="text-muted-foreground">{t('notificationCenter.lead')}</p>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="read-all" />
          <Button type="submit" variant="secondary" disabled={busy}>
            <CheckCheck aria-hidden="true" />
            {t('notificationCenter.readAll')}
          </Button>
        </Form>
      </div>

      <nav aria-label={t('notificationCenter.filter')} className="flex gap-2">
        {[
          { to: PATHS.notifications, label: t('notificationCenter.all'), active: !unreadOnly },
          {
            to: `${PATHS.notifications}?unread=1`,
            label: t('notificationCenter.unread'),
            active: unreadOnly,
          },
        ].map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={tab.active ? 'page' : undefined}
            className={buttonVariants({ variant: tab.active ? 'secondary' : 'ghost' })}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {list.items.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <BellOff aria-hidden="true" className="size-8 text-muted-foreground" />
          <p className="text-muted-foreground">
            {unreadOnly ? t('notificationCenter.emptyUnread') : t('notificationCenter.empty')}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
          {list.items.map((n) => {
            const unread = n.readAt === null;
            return (
              <li key={n.id} className="border-b border-border last:border-b-0">
                <Form method="post">
                  <input type="hidden" name="intent" value="open" />
                  <input type="hidden" name="notificationId" value={n.id} />
                  <input type="hidden" name="to" value={notificationHref(n)} />
                  <button
                    type="submit"
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-sunken',
                      'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                      unread && 'bg-primary-subtle/40',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-2 size-2 shrink-0 rounded-full',
                        unread ? 'bg-primary' : 'bg-transparent',
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-small font-semibold text-muted-foreground">
                        {t(`notificationType.${n.type}`)}
                        {unread && (
                          <span className="sr-only"> ({t('notificationCenter.new')})</span>
                        )}
                      </span>
                      <span className={cn(unread && 'font-semibold')}>
                        {notificationText(t, i18n.language, n, subjects)}
                      </span>
                      <span className="text-small text-muted-foreground">
                        {formatDateTime(n.updatedAt, i18n.language)}
                      </span>
                    </span>
                  </button>
                </Form>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount(list.total, PAGE_SIZE) > 1 && (
        <Pagination
          pathname={PATHS.notifications}
          params={params}
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          maxPage={Number.MAX_SAFE_INTEGER}
        />
      )}
    </PageContainer>
  );
}
