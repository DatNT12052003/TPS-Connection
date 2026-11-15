// /admin/accounts: danh sách tài khoản của Admin (canvas AdminAccounts), là layout của /admin/accounts/:userId.
// Từ 1024 px: danh sách bên trái, chi tiết bên phải; nhỏ hơn: một trong hai.
//   ?q=&role=&status=&page= lọc (form GET, chạy được khi chưa tải JavaScript).
//   ?add=manager mở form "Thêm Manager" (intent `grant-manager`); xong chuyển tới chi tiết tài khoản đó.
import {
  AccountStateFilter,
  AdminAccountDetail,
  AdminAccountList,
  type AdminAccountSummary,
  Role,
} from '@tps/shared';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  data,
  Form,
  Link,
  NavLink,
  Outlet,
  redirect,
  useNavigation,
  useParams,
  useSearchParams,
} from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Alert } from '~/components/ui/alert';
import { Badge, type BadgeProps } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { SelectField, TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { type FormFailure, fieldErrorsFrom, formErrorFrom, formText } from '~/lib/form';
import { formatDate } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import { cn } from '~/lib/utils';
import type { Route } from './+types/list';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.adminAccounts.title} – ${m.common.appName}` }];
}

const BASE = '/admin/accounts';
const GRANT_FIELDS = ['email', 'fullName'] as const;
type GrantField = (typeof GRANT_FIELDS)[number];

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['admin'] });
  const url = new URL(request.url);
  const filters = {
    q: url.searchParams.get('q')?.trim().slice(0, 100) ?? '',
    role: Role.safeParse(url.searchParams.get('role')).data ?? '',
    status: AccountStateFilter.safeParse(url.searchParams.get('status')).data ?? '',
  };
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const query = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const list = await getServerApi(context).call(`/api/v1/admin/accounts?${query.toString()}`, {
    schema: AdminAccountList,
  });
  return { list, filters, adding: url.searchParams.get('add') === 'manager' };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['admin'] });
  const form = await request.formData();
  if (formText(form, 'intent') !== 'grant-manager') throw data(null, { status: 400 });
  const values = { email: formText(form, 'email'), fullName: formText(form, 'fullName') };
  try {
    const result = await getServerApi(context).call('/api/v1/admin/managers', {
      method: 'POST',
      body: values,
      schema: AdminAccountDetail,
    });
    // Email chưa xác thực (tài khoản vừa tạo hoặc đăng ký dở): nhắc người được cấp đặt mật khẩu.
    const notice = result.emailVerified ? 'granted' : 'grantedNew';
    return redirect(`${BASE}/${result.id}?notice=${notice}`);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    return data<FormFailure<GrantField>>({
      ok: false,
      fieldErrors: fieldErrorsFrom(error, GRANT_FIELDS),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      values,
    });
  }
}

export const STATUS_BADGE: Record<AdminAccountSummary['status'], BadgeProps['variant']> = {
  active: 'success',
  restricted: 'warning',
  locked: 'danger',
};

export default function AdminAccountsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { list, filters, adding } = loaderData;
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const pageLink = (page: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    next.delete('add');
    return `?${next.toString()}`;
  };

  return (
    <PageContainer>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">{t('adminAccounts.title')}</h1>
        {!adding && (
          <Link to={`${BASE}?add=manager`} className={buttonVariants()}>
            <Plus aria-hidden="true" />
            {t('adminAccounts.addManager')}
          </Link>
        )}
      </div>

      {adding && <AddManagerCard failure={actionData ?? undefined} />}

      <Form method="get" action={BASE} className="flex flex-wrap items-end gap-3" role="search">
        <TextField
          name="q"
          type="search"
          label={t('adminAccounts.search')}
          placeholder={t('adminAccounts.searchPlaceholder')}
          defaultValue={filters.q}
          className="min-w-60 flex-1"
        />
        <SelectField
          name="role"
          label={t('adminAccounts.roleFilter')}
          defaultValue={filters.role}
          className="w-44"
        >
          <option value="">{t('adminAccounts.allRoles')}</option>
          {Role.options.map((role) => (
            <option key={role} value={role}>
              {t(`role.${role}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="status"
          label={t('adminAccounts.statusFilter')}
          defaultValue={filters.status}
          className="w-52"
        >
          <option value="">{t('adminAccounts.allStatuses')}</option>
          {AccountStateFilter.options.map((status) => (
            <option key={status} value={status}>
              {status === 'deleted' ? t('adminAccounts.deletedStatus') : t(`userStatus.${status}`)}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          {t('adminAccounts.apply')}
        </Button>
      </Form>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <section className={cn('flex min-w-0 flex-col gap-3', userId && 'hidden lg:flex')}>
          {list.items.length === 0 ? (
            <Card className="p-6 text-muted-foreground">{t('adminAccounts.empty')}</Card>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
              {list.items.map((account) => (
                <AccountRow key={account.id} account={account} search={searchParams} />
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-small text-muted-foreground">
            <span>
              {t('adminAccounts.showing', { shown: list.items.length, total: list.total })}
            </span>
            {pages > 1 && (
              <span className="flex gap-2">
                {list.page > 1 && (
                  <Link
                    to={pageLink(list.page - 1)}
                    className={buttonVariants({ variant: 'ghost' })}
                  >
                    {t('review.previous')}
                  </Link>
                )}
                {list.page < pages && (
                  <Link
                    to={pageLink(list.page + 1)}
                    className={buttonVariants({ variant: 'ghost' })}
                  >
                    {t('review.next')}
                  </Link>
                )}
              </span>
            )}
          </div>
        </section>
        <div className={cn('min-w-0', !userId && 'hidden lg:block')}>
          <Outlet />
        </div>
      </div>
    </PageContainer>
  );
}

function AccountRow({
  account,
  search,
}: {
  account: AdminAccountSummary;
  search: URLSearchParams;
}) {
  const { t, i18n } = useTranslation();
  const keep = new URLSearchParams(search);
  keep.delete('add');
  keep.delete('notice');
  const name = account.fullName ?? account.displayName;
  return (
    <li>
      <NavLink
        to={{ pathname: account.id, search: keep.toString() }}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-sunken aria-[current=page]:bg-primary-subtle"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{name}</span>
          <span className="truncate text-small text-muted-foreground">
            {[
              account.email,
              account.roles.map((r) => t(`role.${r}`)).join(', '),
              t('adminAccounts.createdOn', { date: formatDate(account.createdAt, i18n.language) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        {account.deleted ? (
          <Badge variant="neutral">{t('adminAccounts.deletedStatus')}</Badge>
        ) : (
          <Badge variant={STATUS_BADGE[account.status]} dot>
            {t(`userStatus.${account.status}`)}
          </Badge>
        )}
      </NavLink>
    </li>
  );
}

function AddManagerCard({ failure }: { failure: FormFailure<GrantField> | undefined }) {
  const { t } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const errors = failure?.fieldErrors ?? {};
  return (
    <Card className="gap-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{t('adminAccounts.addManagerTitle')}</h2>
        <p className="text-small text-muted-foreground">{t('adminAccounts.addManagerIntro')}</p>
      </div>
      {failure?.formError && (
        <Alert variant="danger" role="alert">
          {tr(failure.formError)}
        </Alert>
      )}
      <Form method="post" noValidate className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="grant-manager" />
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            name="email"
            type="email"
            autoComplete="off"
            required
            label={t('adminAccounts.email')}
            defaultValue={failure?.values?.email ?? ''}
            error={tr(errors.email)}
          />
          <TextField
            name="fullName"
            autoComplete="off"
            maxLength={100}
            label={t('adminAccounts.fullName')}
            defaultValue={failure?.values?.fullName ?? ''}
            error={tr(errors.fullName)}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link to={BASE} className={buttonVariants({ variant: 'secondary' })}>
            {t('common.cancel')}
          </Link>
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {t('adminAccounts.grant')}
          </Button>
        </div>
      </Form>
    </Card>
  );
}
