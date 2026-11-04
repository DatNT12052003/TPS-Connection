import { useState } from 'react';
import { Form, Link } from 'react-router';
import type { Route } from './+types/account-profile';
import {
  AuthPage,
  CsrfField,
  FieldError,
  FormAlert,
  Notice,
  privatePageMeta,
  SubmitButton,
  TextField,
} from '~/components/auth-ui';
import { formApi } from '~/lib/api.server';
import { toFormResult, type FormResult } from '~/lib/form-errors';
import { localeOf, LOCALES, translate } from '~/lib/i18n';
import { csrfTokenOf, redirectToRefresh, requireAccount } from '~/lib/session.server';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AvatarType = (typeof AVATAR_TYPES)[number];
// The file plus the multipart wrapper around it. Checked before reading anything.
const UPLOAD_REQUEST_MAX_BYTES = AVATAR_MAX_BYTES + 64 * 1024;

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'profile.title');

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': 'private, no-store' });

export async function loader({ request }: Route.LoaderArgs) {
  return { account: await requireAccount(request), csrf: csrfTokenOf(request) };
}

type Result = (FormResult & { intent: 'profile' | 'avatar' }) | { ok: true; intent: string };

const avatarRefused = (): Result => ({
  ok: false,
  intent: 'avatar',
  fieldErrors: { avatar: 'fieldError.avatar' },
});

async function uploadAvatar(request: Request, form: FormData): Promise<Result> {
  const file = form.get('avatar');
  if (!(file instanceof File) || file.size === 0 || file.size > AVATAR_MAX_BYTES) {
    return avatarRefused();
  }
  if (!AVATAR_TYPES.includes(file.type as AvatarType)) return avatarRefused();

  const api = formApi(request, form);
  const started = await api.POST('/api/v1/files', {
    body: { purpose: 'avatar', mimeType: file.type as AvatarType, sizeBytes: file.size },
  });
  if (started.response.status === 401) throw redirectToRefresh(request);
  if (!started.data) return { ...toFormResult(started.error), intent: 'avatar' };

  const put = await fetch(started.data.uploadUrl, {
    method: 'PUT',
    headers: started.data.uploadHeaders,
    body: Buffer.from(await file.arrayBuffer()),
  });
  if (!put.ok) return avatarRefused();

  const fileId = started.data.id;
  const completed = await api.POST('/api/v1/files/{id}/complete', {
    params: { path: { id: fileId } },
  });
  if (completed.response.status === 422) return avatarRefused();
  if (!completed.data) return { ...toFormResult(completed.error), intent: 'avatar' };

  const saved = await api.PATCH('/api/v1/me', { body: { avatarFileId: fileId } });
  if (!saved.data) return { ...toFormResult(saved.error), intent: 'avatar' };
  return { ok: true, intent: 'avatar' };
}

export async function action({ request }: Route.ActionArgs): Promise<Result> {
  if (Number(request.headers.get('content-length') ?? 0) > UPLOAD_REQUEST_MAX_BYTES) {
    // Answering without this leaves the sender waiting on a body nobody will read.
    await request.body?.cancel();
    return avatarRefused();
  }
  const form = await request.formData();
  if (form.get('intent') === 'avatar') return uploadAvatar(request, form);

  const phone = String(form.get('phone') ?? '').trim();
  const { data, error, response } = await formApi(request, form).PATCH('/api/v1/me', {
    body: {
      displayName: String(form.get('displayName') ?? ''),
      phone: phone === '' ? null : phone,
      locale: localeOf(String(form.get('locale'))),
    },
  });
  if (response.status === 401) throw redirectToRefresh(request);
  if (data) return { ok: true, intent: 'profile' };
  return { ...toFormResult(error), intent: 'profile' };
}

export default function Profile({ params, loaderData, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  const { account, csrf } = loaderData;
  const profileResult = actionData?.intent === 'profile' ? actionData : undefined;
  const avatarResult = actionData?.intent === 'avatar' ? actionData : undefined;
  // Spares people the wait of sending a file that will be refused anyway.
  const [fileTooLarge, setFileTooLarge] = useState(false);
  const avatarError = fileTooLarge
    ? 'fieldError.avatar'
    : avatarResult && !avatarResult.ok
      ? avatarResult.fieldErrors.avatar
      : undefined;

  return (
    <AuthPage locale={locale} title="profile.title">
      <p className="mt-2">
        <Link className="underline" to={`/${locale}/account`}>
          {translate(locale, 'nav.back')}
        </Link>
      </p>

      <h2 className="mt-6 text-xl font-medium">{translate(locale, 'profile.avatar')}</h2>
      {account.avatarUrl ? (
        <img
          className="mt-2 h-24 w-24 rounded-full object-cover"
          src={account.avatarUrl}
          alt={translate(locale, 'profile.avatarAlt')}
        />
      ) : (
        <p className="mt-2 text-slate-600">{translate(locale, 'profile.avatarNone')}</p>
      )}
      {avatarResult?.ok && <Notice>{translate(locale, 'form.saved')}</Notice>}
      <FormAlert locale={locale} result={avatarResult as FormResult | undefined} />
      <Form
        method="post"
        encType="multipart/form-data"
        onSubmit={(event) => {
          const input = event.currentTarget.elements.namedItem('avatar') as HTMLInputElement;
          const tooLarge = (input.files?.[0]?.size ?? 0) > AVATAR_MAX_BYTES;
          setFileTooLarge(tooLarge);
          if (tooLarge) event.preventDefault();
        }}
      >
        <CsrfField token={csrf} />
        <input type="hidden" name="intent" value="avatar" />
        <input
          className="mt-3 block w-full"
          type="file"
          name="avatar"
          required
          accept={AVATAR_TYPES.join(',')}
          aria-label={translate(locale, 'profile.avatar')}
          aria-describedby="avatar-hint"
        />
        <p id="avatar-hint" className="mt-1 text-sm text-slate-600">
          {translate(locale, 'profile.avatarHint')}
        </p>
        <FieldError id="avatar-error" locale={locale} message={avatarError} />
        <SubmitButton locale={locale} label="profile.avatarUpload" />
      </Form>

      <h2 className="mt-8 text-xl font-medium">{translate(locale, 'profile.title')}</h2>
      {profileResult?.ok && <Notice>{translate(locale, 'form.saved')}</Notice>}
      <FormAlert locale={locale} result={profileResult as FormResult | undefined} />
      <Form method="post">
        <CsrfField token={csrf} />
        <input type="hidden" name="intent" value="profile" />
        <TextField
          locale={locale}
          name="displayName"
          label="field.displayName"
          autoComplete="nickname"
          defaultValue={account.displayName}
          result={profileResult as FormResult | undefined}
        />
        <TextField
          locale={locale}
          name="phone"
          label="profile.phone"
          autoComplete="tel"
          hint="profile.phoneHint"
          required={false}
          defaultValue={account.phone ?? ''}
          result={profileResult as FormResult | undefined}
        />
        <div className="mt-4">
          <label className="block font-medium" htmlFor="locale">
            {translate(locale, 'profile.locale')}
          </label>
          <select
            id="locale"
            name="locale"
            defaultValue={account.locale}
            className="mt-1 w-full rounded border border-slate-400 p-2"
          >
            {LOCALES.map((value) => (
              <option key={value} value={value}>
                {value === 'vi' ? 'Tiếng Việt' : 'English'}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton locale={locale} label="profile.save" />
      </Form>
    </AuthPage>
  );
}
