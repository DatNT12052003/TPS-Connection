// Thẻ "Người đã chặn" ở trang Tài khoản (G5, §13): danh sách và nút Bỏ chặn (intent `unblock`). Chặn ai thì làm ở
// trang yêu cầu kết nối hoặc cuộc trò chuyện.
import type { BlockList } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { Form } from 'react-router';
import { AvatarImage } from '~/components/account/avatar-field';
import { Alert } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import type { Message } from '~/lib/form';
import { formatDate } from '~/lib/format';
import { useMessage } from '~/lib/use-message';

export function BlockedUsersCard({
  blocks,
  result,
  pendingUserId,
}: {
  blocks: BlockList;
  result?: { ok: true; name: string } | { ok: false; formError: Message } | undefined;
  pendingUserId: string | null;
}) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  return (
    <Card id="blocked" className="scroll-mt-24 gap-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{t('blockedUsers.title')}</h2>
        <p className="text-small text-muted-foreground">{t('blockedUsers.lead')}</p>
      </div>
      {result?.ok === true && (
        <Alert variant="success">{t('blockedUsers.unblocked', { name: result.name })}</Alert>
      )}
      {result?.ok === false && <Alert variant="danger">{tr(result.formError)}</Alert>}
      {blocks.items.length === 0 ? (
        <p className="text-muted-foreground">{t('blockedUsers.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {blocks.items.map((b) => (
            <li key={b.userId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <AvatarImage
                avatarUrl={b.avatarUrl}
                displayName={b.displayName}
                className="size-10"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{b.displayName}</span>
                <span className="text-small text-muted-foreground">
                  {t('blockedUsers.blockedOn', { date: formatDate(b.blockedAt, i18n.language) })}
                </span>
              </div>
              <Form method="post">
                <input type="hidden" name="intent" value="unblock" />
                <input type="hidden" name="userId" value={b.userId} />
                <input type="hidden" name="name" value={b.displayName} />
                <Button type="submit" variant="ghost" disabled={pendingUserId === b.userId}>
                  {t('blockedUsers.unblock')}
                </Button>
              </Form>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
