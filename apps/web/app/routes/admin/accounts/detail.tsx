// /admin/accounts/:userId: chi tiết một tài khoản (canvas AdminAccounts, ô bên phải).
//   - Khóa kèm lý do (intent `lock`), mở khóa (intent `unlock`): không với chính mình hay Admin khác.
//   - Gỡ vai trò Manager (intent `revoke-manager`). Vai trò Admin chỉ đổi bằng dòng lệnh.
//   ?notice=locked|unlocked|revoked|granted|grantedNew báo kết quả vừa làm.
import { AdminAccountDetail } from '@tps/shared';
import { ArrowLeft, Lock, LockOpen, UserMinus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useLocation, useNavigation } from 'react-router';
import { Alert } from '~/components/ui/alert';
import { AvatarImage } from '~/components/account/avatar-field';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { TextAreaField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { type FormFailure, fieldErrorsFrom, formErrorFrom, formText } from '~/lib/form';
import { formatDateTime } from '~/lib/format';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import { STATUS_BADGE } from './list';
import type { Route } from './+types/detail';

const NOTICES = ['locked', 'unlocked', 'revoked', 'granted', 'grantedNew'] as const;
type Notice = (typeof NOTICES)[number];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['admin'] });
  const account = await getServerApi(context).call(
    `/api/v1/admin/accounts/${encodeURIComponent(params.userId)}`,
    { schema: AdminAccountDetail },
  );
  const notice = new URL(request.url).searchParams.get('notice');
  return { account, notice: NOTICES.find((n) => n === notice) ?? null };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['admin'] });
  const form = await request.formData();
  const intent = formText(form, 'intent');
  const api = getServerApi(context);
  const base = `/api/v1/admin/accounts/${encodeURIComponent(params.userId)}`;
  const calls: Record<string, { path: string; method: 'POST' | 'DELETE'; notice: Notice }> = {
    lock: { path: `${base}/lock`, method: 'POST', notice: 'locked' },
    unlock: { path: `${base}/unlock`, method: 'POST', notice: 'unlocked' },
    'revoke-manager': { path: `${base}/roles/manager`, method: 'DELETE', notice: 'revoked' },
  };
  const call = calls[intent];
  if (!call) throw data(null, { status: 400 });
  const reason = formText(form, 'reason');
  try {
    await api.call(call.path, {
      method: call.method,
      ...(intent === 'lock' && { body: { reason } }),
      schema: AdminAccountDetail,
    });
    // Giữ bộ lọc của danh sách (gửi kèm trong ô ẩn `search`).
    const search = new URLSearchParams(formText(form, 'search'));
    search.set('notice', call.notice);
    return redirect(`/admin/accounts/${params.userId}?${search.toString()}`);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    return data<FormFailure<'reason'>>({
      ok: false,
      fieldErrors: fieldErrorsFrom(error, ['reason']),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      values: { reason },
    });
  }
}

export default function AdminAccountPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const { account, notice } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const location = useLocation();
  const listSearch = new URLSearchParams(location.search);
  listSearch.delete('notice');
  const search = listSearch.toString();
  const name = account.fullName ?? account.displayName;
  const confirm = (message: string) => (event: { preventDefault(): void }) => {
    if (!window.confirm(message)) event.preventDefault();
  };

  return (
    <Card className="gap-4 sm:p-6">
      <Link
        to={`/admin/accounts${search ? `?${search}` : ''}`}
        className={buttonVariants({ variant: 'ghost', className: 'self-start lg:hidden' })}
      >
        <ArrowLeft aria-hidden="true" />
        {t('adminAccounts.back')}
      </Link>
      {notice && (
        <Alert variant="success" role="status">
          {t(`adminAccounts.${notice}`)}
        </Alert>
      )}
      {actionData?.formError && (
        <Alert variant="danger" role="alert">
          {tr(actionData.formError)}
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <AvatarImage avatarUrl={null} displayName={name} className="size-11 text-body" />
        <div className="flex min-w-0 flex-col">
          <h2 className="text-h3">{name}</h2>
          <span className="truncate text-small text-muted-foreground">{account.email}</span>
        </div>
      </div>

      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-small">
        <dt className="text-muted-foreground">{t('adminAccounts.status')}</dt>
        <dd>
          {account.deleted ? (
            <Badge variant="neutral">{t('adminAccounts.deletedStatus')}</Badge>
          ) : (
            <Badge variant={STATUS_BADGE[account.status]}>
              {t(`userStatus.${account.status}`)}
            </Badge>
          )}
          {!account.emailVerified && (
            <span className="ml-2 text-muted-foreground">
              {t('adminAccounts.emailNotVerified')}
            </span>
          )}
        </dd>
        <dt className="text-muted-foreground">{t('adminAccounts.roles')}</dt>
        <dd>
          {account.roles.length > 0
            ? account.roles.map((r) => t(`role.${r}`)).join(', ')
            : t('adminAccounts.noRoles')}
        </dd>
        {account.lock && (
          <>
            <dt className="text-muted-foreground">{t('adminAccounts.lockReason')}</dt>
            <dd className="break-words">{account.lock.reason}</dd>
            <dt className="text-muted-foreground">{t('adminAccounts.lockedBy')}</dt>
            <dd>
              {[account.lock.lockedByName, formatDateTime(account.lock.lockedAt, i18n.language)]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </>
        )}
      </dl>

      {account.roles.includes('manager') && (
        <Form method="post" onSubmit={confirm(t('adminAccounts.confirmRevoke'))}>
          <input type="hidden" name="intent" value="revoke-manager" />
          <input type="hidden" name="search" value={search} />
          <Button type="submit" variant="secondary" block disabled={busy}>
            <UserMinus aria-hidden="true" />
            {t('adminAccounts.revokeManager')}
          </Button>
        </Form>
      )}

      {!account.canLock ? (
        !account.deleted && (
          <p className="text-small text-muted-foreground">
            {account.roles.includes('admin')
              ? t('adminAccounts.adminRoleNote')
              : t('adminAccounts.cannotLock')}
          </p>
        )
      ) : account.status === 'locked' ? (
        <Form method="post" onSubmit={confirm(t('adminAccounts.confirmUnlock'))}>
          <input type="hidden" name="intent" value="unlock" />
          <input type="hidden" name="search" value={search} />
          <Button type="submit" variant="secondary" block disabled={busy}>
            <LockOpen aria-hidden="true" />
            {t('adminAccounts.unlock')}
          </Button>
        </Form>
      ) : (
        <Form
          method="post"
          noValidate
          className="flex flex-col gap-3 border-t border-border pt-4"
          onSubmit={confirm(t('adminAccounts.confirmLock'))}
        >
          <input type="hidden" name="intent" value="lock" />
          <input type="hidden" name="search" value={search} />
          <TextAreaField
            name="reason"
            rows={2}
            maxLength={500}
            required
            label={t('adminAccounts.lockReasonLabel')}
            hint={t('adminAccounts.lockReasonHint')}
            defaultValue={actionData?.values?.reason ?? ''}
            error={tr(actionData?.fieldErrors.reason)}
          />
          <Button type="submit" variant="danger" disabled={busy} className="self-start">
            <Lock aria-hidden="true" />
            {t('adminAccounts.lock')}
          </Button>
        </Form>
      )}
      <p className="text-small text-muted-foreground">{t('adminAccounts.auditNote')}</p>
    </Card>
  );
}
