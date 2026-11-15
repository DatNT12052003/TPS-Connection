// /app/account: Tài khoản và cài đặt (canvas Settings), cho gia sư, phụ huynh và học sinh.
//   - Thông tin cá nhân: ảnh đại diện, tên hiển thị, họ tên (khóa khi gia sư đã xác minh, D34), email (chỉ
//     xem), số điện thoại tự khai (C12).
//   - Nơi bạn sống (chỉ phụ huynh): tỉnh, xã, địa chỉ; chỉ phụ huynh thấy.
//   - Giao diện và ngôn ngữ: lưu cookie; ngôn ngữ cũng lưu vào tài khoản (ngôn ngữ email), xem /preferences.
//   - Bảo mật: đổi mật khẩu (đăng xuất thiết bị khác), thiết bị đang đăng nhập.
// Chưa có API cho "Đã chặn", "Xóa tài khoản", "Thông báo" (xem docs/ke_hoach_trien_khai.md).
// Mỗi form gửi `intent` riêng; kết quả action mang theo intent để hiện thông báo đúng thẻ.
import { AccountProfile, ActiveSession, ParentProfile } from '@tps/shared';
import { Laptop, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, useNavigation } from 'react-router';
import { z } from 'zod';
import { AvatarField } from '~/components/account/avatar-field';
import { LocationFields } from '~/components/forms/location-fields';
import { PageContainer } from '~/components/layout/page';
import { PreferencesControls } from '~/components/layout/preferences-controls';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { type CatalogOption, catalogIdFrom } from '~/lib/catalog';
import { communesFor, loadCommunes, loadProvinces } from '~/lib/catalog.server';
import { fieldErrorsFrom, formErrorFrom, formText, type Message } from '~/lib/form';
import { formatDateTime } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { APP_ROLES, PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import { describeUserAgent } from '~/lib/user-agent';
import type { Route } from './+types/account';

const PROFILE_FIELDS = ['displayName', 'fullName', 'phone'] as const;
const AREA_FIELDS = ['provinceId', 'communeId', 'addressLine'] as const;
const PASSWORD_FIELDS = ['currentPassword', 'newPassword'] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];
type AreaField = (typeof AREA_FIELDS)[number];
type PasswordField = (typeof PASSWORD_FIELDS)[number];

interface Failure<F extends string> {
  ok: false;
  fieldErrors: Partial<Record<F, Message>>;
  formError?: Message;
}

type ActionResult =
  | { intent: 'profile'; ok: true }
  | ({ intent: 'profile'; values: Record<ProfileField, string> } & Failure<ProfileField>)
  | { intent: 'area'; ok: true }
  | ({
      intent: 'area';
      values: Record<AreaField, string>;
      communes: CatalogOption[];
    } & Failure<AreaField>)
  | { intent: 'password'; ok: true }
  | ({ intent: 'password' } & Failure<PasswordField>)
  | { intent: 'avatar-remove'; ok: true }
  | ({ intent: 'avatar-remove' } & Failure<never>)
  | { intent: 'revoke-sessions'; ok: true }
  | ({ intent: 'revoke-sessions' } & Failure<never>);

const SessionList = z.object({ items: z.array(ActiveSession) });

/** Lỗi 4xx của API thành kết quả form; lỗi khác ném tiếp (trang lỗi). */
function failureFrom<F extends string>(error: unknown, fields: readonly F[]): Failure<F> {
  if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
  return {
    ok: false,
    fieldErrors: fieldErrorsFrom(error, fields),
    ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
  };
}

/** Form chỉ có một nút (không có ô nhập): mọi lỗi 4xx là lỗi chung. */
function buttonFailure(error: unknown): Failure<never> {
  const failure = failureFrom<never>(error, []);
  return { ...failure, formError: failure.formError ?? formErrorFrom(error) };
}

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.account.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context, { roles: APP_ROLES });
  const api = getServerApi(context);
  const { locale } = await readPreferences(request);

  const loadArea = async () => {
    const profile = await api.call('/api/v1/me/parent-profile', { schema: ParentProfile });
    const [provinces, communes] = await Promise.all([
      loadProvinces(context, locale),
      loadCommunes(context, locale, profile.provinceId),
    ]);
    return { profile, provinces, communes };
  };

  const [account, sessions, area] = await Promise.all([
    api.call('/api/v1/me', { schema: AccountProfile }),
    api.call('/api/v1/auth/sessions', { schema: SessionList }),
    user.roles.includes('parent') ? loadArea() : Promise.resolve(null),
  ]);
  return { account, sessions: sessions.items, area };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context, { roles: APP_ROLES });
  const form = await request.formData();
  const api = getServerApi(context);
  const intent = formText(form, 'intent');

  switch (intent) {
    case 'profile': {
      const values = {
        displayName: formText(form, 'displayName'),
        fullName: formText(form, 'fullName'),
        phone: formText(form, 'phone'),
      };
      try {
        await api.call('/api/v1/me', {
          method: 'PATCH',
          body: {
            displayName: values.displayName,
            // Ô họ tên bị khóa (gia sư đã xác minh) không được gửi; để trống thì giữ nguyên.
            ...(form.has('fullName') && values.fullName.trim() && { fullName: values.fullName }),
            phone: values.phone,
          },
          schema: AccountProfile,
        });
        return data<ActionResult>({ intent, ok: true });
      } catch (error) {
        return data<ActionResult>({ intent, values, ...failureFrom(error, PROFILE_FIELDS) });
      }
    }

    case 'area': {
      if (!user.roles.includes('parent')) throw data(null, { status: 404 });
      const values = {
        provinceId: formText(form, 'provinceId'),
        communeId: formText(form, 'communeId'),
        addressLine: formText(form, 'addressLine'),
      };
      try {
        await api.call('/api/v1/me/parent-profile', {
          method: 'PUT',
          body: {
            provinceId: catalogIdFrom(values.provinceId),
            communeId: catalogIdFrom(values.communeId),
            addressLine: values.addressLine,
          },
          schema: ParentProfile,
        });
        return data<ActionResult>({ intent, ok: true });
      } catch (error) {
        const failure = failureFrom(error, AREA_FIELDS);
        return data<ActionResult>({
          intent,
          values,
          ...failure,
          communes: await communesFor(request, context, values.provinceId),
        });
      }
    }

    case 'password':
      try {
        await api.call('/api/v1/auth/password/change', {
          method: 'POST',
          body: {
            currentPassword: formText(form, 'currentPassword'),
            newPassword: formText(form, 'newPassword'),
          },
        });
        return data<ActionResult>({ intent, ok: true });
      } catch (error) {
        return data<ActionResult>({ intent, ...failureFrom(error, PASSWORD_FIELDS) });
      }

    case 'avatar-remove':
      try {
        await api.call('/api/v1/me/avatar', { method: 'DELETE' });
        return data<ActionResult>({ intent, ok: true });
      } catch (error) {
        return data<ActionResult>({ intent, ...buttonFailure(error) });
      }

    case 'revoke-sessions':
      try {
        await api.call('/api/v1/auth/sessions/revoke-others', { method: 'POST' });
        return data<ActionResult>({ intent, ok: true });
      } catch (error) {
        return data<ActionResult>({ intent, ...buttonFailure(error) });
      }

    default:
      throw data(null, { status: 400 });
  }
}

const SECTIONS = [
  { id: 'profile', label: 'account.profileTitle' },
  { id: 'area', label: 'account.areaTitle' },
  { id: 'display', label: 'account.displayTitle' },
  { id: 'security', label: 'account.securityTitle' },
] as const;

export default function AccountPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const pendingIntent =
    navigation.state !== 'idle' && navigation.formMethod === 'POST'
      ? formText(navigation.formData ?? new FormData(), 'intent')
      : null;
  const { account, sessions, area } = loaderData;
  const sections = SECTIONS.filter((section) => section.id !== 'area' || area);
  const [activeSection, setActiveSection] = useActiveSection(sections.map((s) => s.id));

  return (
    <PageContainer>
      {/* Tiêu đề chỉ cho trình đọc màn hình; trên màn hình menu bên trái đã đủ rõ. */}
      <h1 className="sr-only">{t('account.title')}</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav
          aria-label={t('account.sections')}
          className="sticky top-24 hidden flex-col gap-0.5 rounded-lg border border-border bg-surface p-2 lg:flex"
        >
          {sections.map((section) => {
            const active = section.id === activeSection;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                aria-current={active ? 'location' : undefined}
                onClick={() => setActiveSection(section.id)}
                className="flex min-h-control-md items-center rounded-md px-3 font-semibold text-foreground hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-ring aria-[current=location]:bg-primary-subtle aria-[current=location]:text-primary-subtle-foreground"
              >
                {t(section.label)}
              </a>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <ProfileCard
            account={account}
            result={actionData?.intent === 'profile' ? actionData : undefined}
            removeResult={actionData?.intent === 'avatar-remove' ? actionData : undefined}
            pendingIntent={pendingIntent}
          />
          {area && (
            <AreaCard
              area={area}
              result={actionData?.intent === 'area' ? actionData : undefined}
              submitting={pendingIntent === 'area'}
            />
          )}
          <Card id="display" className="scroll-mt-24 gap-4 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3">{t('account.displayTitle')}</h2>
              <p className="text-small text-muted-foreground">{t('account.displayIntro')}</p>
            </div>
            <PreferencesControls layout="stacked" />
          </Card>
          <SecurityCard
            sessions={sessions}
            result={
              actionData?.intent === 'password' || actionData?.intent === 'revoke-sessions'
                ? actionData
                : undefined
            }
            pendingIntent={pendingIntent}
          />
        </div>
      </div>
    </PageContainer>
  );
}

/** Khoảng cách từ đỉnh màn hình (dưới thanh điều hướng) mà thẻ chạm tới thì coi là đang xem. */
const SCROLL_SPY_OFFSET = 120;

/**
 * Mục đang xem trên menu bên trái: theo ô đang được focus (Tab hoặc bấm vào) và theo vị trí cuộn.
 * Focus thắng cuộn: khi focus nằm trong một thẻ thì thẻ đó được đánh dấu.
 */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? '');
  const key = ids.join(',');

  useEffect(() => {
    const list = key.split(',');
    const sectionOf = (node: EventTarget | null) =>
      node instanceof Node
        ? list.find((id) => document.getElementById(id)?.contains(node))
        : undefined;

    const onFocusIn = (event: FocusEvent) => {
      const id = sectionOf(event.target);
      if (id) setActive(id);
    };

    const onScroll = () => {
      // Đang gõ trong một thẻ thì giữ thẻ đó, không để cuộn đổi mục.
      if (sectionOf(document.activeElement)) return;
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom) {
        setActive(list[list.length - 1] ?? '');
        return;
      }
      let current = list[0] ?? '';
      for (const id of list) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= SCROLL_SPY_OFFSET) current = id;
      }
      setActive(current);
    };

    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('scroll', onScroll);
    };
  }, [key]);

  return [active, setActive] as const;
}

type ResultOf<I extends ActionResult['intent']> = Extract<ActionResult, { intent: I }>;

function SavedOrError({ result, saved }: { result: ActionResult | undefined; saved: string }) {
  const tr = useMessage();
  if (!result) return null;
  if (result.ok) {
    return (
      <Alert variant="success" role="status">
        {saved}
      </Alert>
    );
  }
  return result.formError ? (
    <Alert variant="danger" role="alert">
      {tr(result.formError)}
    </Alert>
  ) : null;
}

function ProfileCard({
  account,
  result,
  removeResult,
  pendingIntent,
}: {
  account: AccountProfile;
  result: ResultOf<'profile'> | undefined;
  removeResult: ResultOf<'avatar-remove'> | undefined;
  pendingIntent: string | null;
}) {
  const { t } = useTranslation();
  const tr = useMessage();
  const failure = result && !result.ok ? result : undefined;
  const values = failure?.values ?? {
    displayName: account.displayName,
    fullName: account.fullName ?? '',
    phone: account.phone ?? '',
  };

  return (
    <Card id="profile" className="scroll-mt-24 gap-5 sm:p-6">
      <h2 className="text-h3">{t('account.profileTitle')}</h2>
      <AvatarField
        avatarUrl={account.avatarUrl}
        displayName={account.displayName}
        removing={pendingIntent === 'avatar-remove'}
      />
      <SavedOrError result={removeResult} saved={t('account.avatarRemoved')} />

      <Form method="post" noValidate preventScrollReset className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="profile" />
        <SavedOrError result={result} saved={t('account.profileSaved')} />
        <div key={account.displayName + account.phone} className="grid gap-4 md:grid-cols-2">
          <TextField
            name="displayName"
            required
            maxLength={60}
            autoComplete="nickname"
            label={t('account.displayName')}
            hint={t('account.displayNameHint')}
            defaultValue={values.displayName}
            error={tr(failure?.fieldErrors.displayName)}
          />
          {account.fullNameLocked ? (
            <TextField
              label={t('account.fullName')}
              hint={t('account.fullNameLocked')}
              value={account.fullName ?? ''}
              readOnly
              disabled
            />
          ) : (
            <TextField
              name="fullName"
              maxLength={100}
              autoComplete="name"
              label={t('account.fullName')}
              hint={t('account.fullNameHint')}
              defaultValue={values.fullName}
              error={tr(failure?.fieldErrors.fullName)}
            />
          )}
          <TextField
            type="email"
            label={t('account.email')}
            hint={t('account.emailHint')}
            value={account.email}
            readOnly
            disabled
          />
          <TextField
            name="phone"
            type="tel"
            autoComplete="tel"
            label={
              <span className="inline-flex items-center gap-2">
                {t('account.phone')}
                <Badge variant="self">{t('account.selfDeclared')}</Badge>
              </span>
            }
            hint={t('account.phoneHint')}
            defaultValue={values.phone}
            error={tr(failure?.fieldErrors.phone)}
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={pendingIntent === 'profile'}
            aria-busy={pendingIntent === 'profile'}
          >
            {t('account.save')}
          </Button>
        </div>
      </Form>
    </Card>
  );
}

function AreaCard({
  area,
  result,
  submitting,
}: {
  area: { profile: ParentProfile; provinces: CatalogOption[]; communes: CatalogOption[] };
  result: ResultOf<'area'> | undefined;
  submitting: boolean;
}) {
  const { t } = useTranslation();
  const tr = useMessage();
  const { profile } = area;
  const failure = result && !result.ok ? result : undefined;
  const values = failure?.values ?? {
    provinceId: profile.provinceId === null ? '' : String(profile.provinceId),
    communeId: profile.communeId === null ? '' : String(profile.communeId),
    addressLine: profile.addressLine ?? '',
  };
  const communes =
    failure && catalogIdFrom(failure.values.provinceId) !== profile.provinceId
      ? failure.communes
      : area.communes;

  return (
    <Card id="area" className="scroll-mt-24 gap-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{t('account.areaTitle')}</h2>
        <p className="text-small text-muted-foreground">{t('account.areaIntro')}</p>
      </div>
      <Form method="post" noValidate preventScrollReset className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="area" />
        <SavedOrError result={result} saved={t('account.saved')} />
        <div key={profile.updatedAt ?? 'new'} className="grid gap-4 md:grid-cols-2">
          <LocationFields
            provinces={area.provinces}
            communes={communes}
            provinceId={values.provinceId}
            communeId={values.communeId}
            provinceError={tr(failure?.fieldErrors.provinceId)}
            communeError={tr(failure?.fieldErrors.communeId)}
          />
          <TextField
            name="addressLine"
            maxLength={300}
            autoComplete="street-address"
            className="md:col-span-2"
            label={t('account.address')}
            hint={t('account.addressHint')}
            defaultValue={values.addressLine}
            error={tr(failure?.fieldErrors.addressLine)}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting} aria-busy={submitting}>
            {t('account.save')}
          </Button>
        </div>
      </Form>
    </Card>
  );
}

function SecurityCard({
  sessions,
  result,
  pendingIntent,
}: {
  sessions: ActiveSession[];
  result: ResultOf<'password'> | ResultOf<'revoke-sessions'> | undefined;
  pendingIntent: string | null;
}) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const passwordResult = result?.intent === 'password' ? result : undefined;
  const passwordFailure = passwordResult && !passwordResult.ok ? passwordResult : undefined;
  const others = sessions.filter((session) => !session.current);
  // Đổi mật khẩu thành công: form được dựng lại để xóa các ô mật khẩu.
  const passwordFormKey = passwordResult?.ok ? 'done' : 'form';

  return (
    <Card id="security" className="scroll-mt-24 gap-5 sm:p-6">
      <h2 className="text-h3">{t('account.securityTitle')}</h2>

      <section aria-labelledby="password-title" className="flex flex-col gap-4">
        <h3 id="password-title" className="text-body-strong">
          {t('account.passwordTitle')}
        </h3>
        <SavedOrError result={passwordResult} saved={t('account.passwordChanged')} />
        <Form
          key={passwordFormKey}
          method="post"
          noValidate
          preventScrollReset
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="intent" value="password" />
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              label={t('account.currentPassword')}
              labelAside={
                <Link
                  to={PATHS.forgotPassword}
                  className="text-small font-semibold text-primary hover:text-primary-hover"
                >
                  {t('account.forgotPassword')}
                </Link>
              }
              error={tr(passwordFailure?.fieldErrors.currentPassword)}
            />
            <TextField
              name="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              label={t('account.newPassword')}
              hint={t('register.passwordHint')}
              error={tr(passwordFailure?.fieldErrors.newPassword)}
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              disabled={pendingIntent === 'password'}
              aria-busy={pendingIntent === 'password'}
            >
              {t('account.passwordSubmit')}
            </Button>
          </div>
        </Form>
      </section>

      <section
        aria-labelledby="sessions-title"
        className="flex flex-col gap-3 border-t border-border pt-5"
      >
        <h3 id="sessions-title" className="text-body-strong">
          {t('account.sessionsTitle')}
        </h3>
        <SavedOrError
          result={result?.intent === 'revoke-sessions' ? result : undefined}
          saved={t('account.othersRevoked')}
        />
        <ul className="flex flex-col divide-y divide-border">
          {sessions.map((session) => {
            const device = describeUserAgent(session.userAgent);
            const name =
              device.browser && device.os
                ? t('account.deviceName', { browser: device.browser, os: device.os })
                : (device.browser ?? device.os ?? t('account.unknownDevice'));
            return (
              <li key={session.id} className="flex items-center gap-3 py-3">
                <Laptop aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {name}
                    {session.current && <Badge variant="success">{t('account.thisDevice')}</Badge>}
                  </span>
                  <span className="text-small text-muted-foreground">
                    {t('account.lastActive', {
                      time: formatDateTime(session.lastActiveAt, i18n.language),
                    })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {others.length > 0 ? (
          <Form method="post" preventScrollReset className="flex justify-end">
            <input type="hidden" name="intent" value="revoke-sessions" />
            <Button
              type="submit"
              variant="secondary"
              disabled={pendingIntent === 'revoke-sessions'}
              aria-busy={pendingIntent === 'revoke-sessions'}
            >
              <LogOut aria-hidden="true" />
              {t('account.revokeOthers')}
            </Button>
          </Form>
        ) : (
          <p className="text-small text-muted-foreground">{t('account.noOtherSessions')}</p>
        )}
      </section>
    </Card>
  );
}
