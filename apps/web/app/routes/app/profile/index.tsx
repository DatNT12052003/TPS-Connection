// /app/profile: Hồ sơ và xác minh của gia sư (canvas Verification).
//   - Trạng thái hồ sơ và bốn bước tới khi hiển thị công khai (D5, D34).
//   - Bước 1: các trường bắt buộc còn thiếu (`missingForVerification`), nút sửa hồ sơ.
//   - Bước 2: nộp giấy tờ danh tính, hủy yêu cầu đang chờ (G3; intent `identity-submit`, `identity-cancel`).
//   - Bằng cấp, chứng chỉ tự khai: thêm, sửa, xóa (intent `credential-save`, `credential-delete`); nộp ảnh
//     để xác minh, hủy yêu cầu (intent `credential-verify`, `credential-verify-cancel`).
import {
  isValidationCode,
  OwnIdentityVerification,
  OwnTutorProfile,
  TutorCredential,
  type TutorRequiredField,
} from '@tps/shared';
import { Check, Clock, Lock, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link, redirect } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import {
  CREDENTIAL_FIELDS,
  type CredentialFailure,
  CredentialsCard,
} from '~/components/tutor/credentials-card';
import {
  type IdentityFailure,
  IdentityVerificationCard,
} from '~/components/tutor/identity-verification-card';
import { Alert } from '~/components/ui/alert';
import { Badge, type BadgeProps } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ApiError } from '~/lib/api';
import { fieldErrorsFrom, formErrorFrom, formText, type Message } from '~/lib/form';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { cn } from '~/lib/utils';
import type { Route } from './+types/index';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.tutorProfile.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  const api = getServerApi(context);
  const [profile, verification] = await Promise.all([
    api.call('/api/v1/me/tutor-profile', { schema: OwnTutorProfile }),
    api.call('/api/v1/me/tutor-profile/verification', { schema: OwnIdentityVerification }),
  ]);
  const url = new URL(request.url);
  return {
    profile,
    verification,
    saved: url.searchParams.get('saved') === '1',
    notice: url.searchParams.get('notice'),
    editingCredential: url.searchParams.get('credential'),
    verifyingCredential: url.searchParams.get('verify'),
  };
}

/** Lỗi 4xx của API thành một thông điệp: mã lỗi của ô đầu tiên nếu có (giấy tờ thiếu, tệp chưa tải xong…). */
function messageOf(error: ApiError): Message {
  const code = error.details[0]?.code;
  return code && isValidationCode(code) ? { key: `validation.${code}` } : formErrorFrom(error);
}

const isClientError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status > 0 && error.status < 500;

/** JSON trong một ô ẩn của form; sai dạng thì mảng rỗng (API báo thiếu giấy tờ). */
function jsonArray(form: FormData, name: string): unknown[] {
  try {
    const value: unknown = JSON.parse(formText(form, name));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  const form = await request.formData();
  const api = getServerApi(context);
  const intent = formText(form, 'intent');
  const credentialId = formText(form, 'credentialId');
  const base = '/api/v1/me/tutor-profile/credentials';
  const done = redirect(`${PATHS.tutorProfile}#credentials`);

  if (intent === 'identity-submit' || intent === 'identity-cancel') {
    try {
      if (intent === 'identity-submit') {
        await api.call('/api/v1/me/tutor-profile/verification', {
          method: 'POST',
          body: {
            documents: jsonArray(form, 'documents'),
            acceptDocumentProcessing: formText(form, 'acceptDocumentProcessing') === 'true',
          },
          schema: OwnIdentityVerification,
        });
      } else {
        await api.call('/api/v1/me/tutor-profile/verification', { method: 'DELETE' });
      }
      const notice = intent === 'identity-submit' ? 'submitted' : 'cancelled';
      return redirect(`${PATHS.tutorProfile}?notice=${notice}`);
    } catch (error) {
      if (!isClientError(error)) throw error;
      return data<IdentityFailure>({ intent, ok: false, formError: messageOf(error) });
    }
  }

  if (intent === 'credential-verify' || intent === 'credential-verify-cancel') {
    const path = `${base}/${encodeURIComponent(credentialId)}/verification`;
    try {
      if (intent === 'credential-verify') {
        await api.call(path, {
          method: 'POST',
          body: { fileIds: jsonArray(form, 'fileIds') },
          schema: TutorCredential,
        });
      } else {
        await api.call(path, { method: 'DELETE' });
      }
      return done;
    } catch (error) {
      if (!isClientError(error)) throw error;
      return data<CredentialFailure>({
        intent,
        ok: false,
        fieldErrors: {},
        formError: messageOf(error),
      });
    }
  }

  if (intent === 'credential-delete') {
    try {
      await api.call(`${base}/${encodeURIComponent(credentialId)}`, { method: 'DELETE' });
      return done;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
      return data<CredentialFailure>({
        intent,
        ok: false,
        fieldErrors: {},
        formError: formErrorFrom(error),
      });
    }
  }

  if (intent !== 'credential-save') throw data(null, { status: 400 });
  const values = {
    kind: formText(form, 'kind'),
    title: formText(form, 'title'),
    issuer: formText(form, 'issuer'),
    issuedYear: formText(form, 'issuedYear'),
  };
  const year = values.issuedYear.trim();
  const body = {
    kind: values.kind,
    title: values.title,
    issuer: values.issuer,
    // Gõ chữ thì gửi nguyên văn để API báo lỗi đúng ô.
    issuedYear: year === '' ? null : /^\d+$/.test(year) ? Number(year) : year,
  };
  try {
    await api.call(credentialId ? `${base}/${encodeURIComponent(credentialId)}` : base, {
      method: credentialId ? 'PATCH' : 'POST',
      body,
      schema: TutorCredential,
    });
    return done;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    return data<CredentialFailure>({
      intent,
      ok: false,
      fieldErrors: fieldErrorsFrom(error, CREDENTIAL_FIELDS),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      values,
    });
  }
}

const STATUS_BADGE: Record<OwnTutorProfile['profileStatus'], BadgeProps['variant']> = {
  incomplete: 'warning',
  pending_verification: 'verified',
  verified: 'success',
};

const REQUIRED_LABEL: Record<
  TutorRequiredField,
  `tutorProfile.required${Capitalize<TutorRequiredField>}`
> = {
  fullName: 'tutorProfile.requiredFullName',
  teachingSubjects: 'tutorProfile.requiredTeachingSubjects',
  teachingMode: 'tutorProfile.requiredTeachingMode',
  rate: 'tutorProfile.requiredRate',
};

type StepState = 'done' | 'now' | 'later';

export default function TutorProfilePage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { profile, verification, saved, notice, editingCredential, verifyingCredential } =
    loaderData;
  const identityFailure =
    actionData?.intent === 'identity-submit' || actionData?.intent === 'identity-cancel'
      ? actionData
      : undefined;
  const credentialFailure =
    actionData && !identityFailure ? (actionData as CredentialFailure) : undefined;
  const missing = profile.missingForVerification;
  const status = profile.profileStatus;
  const filled = missing.length === 0;

  const steps: { label: string; state: StepState }[] = [
    { label: t('tutorProfile.stepFill'), state: filled ? 'done' : 'now' },
    {
      label: t('tutorProfile.stepSubmit'),
      state: status !== 'incomplete' ? 'done' : filled ? 'now' : 'later',
    },
    {
      label: t('tutorProfile.stepReview'),
      state: status === 'verified' ? 'done' : status === 'pending_verification' ? 'now' : 'later',
    },
    { label: t('tutorProfile.stepPublic'), state: status === 'verified' ? 'done' : 'later' },
  ];

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{t('tutorProfile.title')}</h1>
          <p className="text-muted-foreground">{t('tutorProfile.intro')}</p>
        </div>
        <Badge variant={STATUS_BADGE[status]} className="px-3 py-1 text-body">
          {t('tutorProfile.statusLabel', { status: t(`tutorProfileStatus.${status}`) })}
        </Badge>
      </div>

      {saved && (
        <Alert variant="success" role="status">
          {t('tutorProfile.saved')}
        </Alert>
      )}
      {notice === 'submitted' && (
        <Alert variant="success" role="status">
          {t('verification.submitted')}
        </Alert>
      )}
      {notice === 'cancelled' && (
        <Alert variant="info" role="status">
          {t('verification.cancelled')}
        </Alert>
      )}

      <ol aria-label={t('tutorProfile.stepLabel')} className="grid gap-2 sm:grid-cols-4">
        {steps.map((step, index) => (
          <li
            key={step.label}
            aria-current={step.state === 'now' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-small',
              step.state === 'now'
                ? 'border-primary bg-primary-subtle font-semibold text-primary-subtle-foreground'
                : 'border-border bg-surface',
              step.state === 'later' && 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-small font-semibold',
                step.state === 'done'
                  ? 'bg-success text-primary-foreground'
                  : step.state === 'now'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-sunken',
              )}
            >
              {step.state === 'done' ? (
                <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
              ) : (
                index + 1
              )}
            </span>
            {step.label}
            {step.state === 'done' && <span className="sr-only">{t('tutorProfile.stepDone')}</span>}
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className={cn('gap-4 sm:p-6', !filled && 'border-primary ring-1 ring-primary')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-h2">{t('tutorProfile.step1Title')}</h2>
              {filled ? (
                <Badge variant="success">
                  <Check aria-hidden="true" className="size-3.5" />
                  {t('tutorProfile.complete')}
                </Badge>
              ) : (
                <Badge variant="warning">
                  {t('tutorProfile.missingCount', { count: missing.length })}
                </Badge>
              )}
            </div>
            {filled ? (
              <p className="text-small text-muted-foreground">{t('tutorProfile.step1Done')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-small">{t('tutorProfile.step1Missing')}</p>
                <ul className="flex flex-col gap-1.5">
                  {missing.map((field) => (
                    <li key={field} className="flex items-center gap-2 text-small">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
                      {t(REQUIRED_LABEL[field])}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link
              to={PATHS.tutorProfileEdit}
              className={buttonVariants({
                variant: filled ? 'secondary' : 'primary',
                className: 'self-start',
              })}
            >
              {filled ? t('tutorProfile.editProfile') : t('tutorProfile.completeProfile')}
            </Link>
          </Card>

          <IdentityVerificationCard
            verification={verification}
            identityVerifiedAt={profile.identityVerifiedAt}
            filled={filled}
            failure={identityFailure}
          />

          <CredentialsCard
            credentials={profile.credentials}
            editing={editingCredential}
            verifying={verifyingCredential}
            failure={credentialFailure}
          />
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="gap-3 p-5">
            <h2 className="text-h3">{t('tutorProfile.whyTitle')}</h2>
            <p className="text-small text-muted-foreground">{t('tutorProfile.whyIntro')}</p>
            <ul className="flex flex-col gap-3">
              <WhyItem icon={<ShieldCheck />}>{t('tutorProfile.whyPublic')}</WhyItem>
              <WhyItem icon={<Clock />}>{t('tutorProfile.whyReview')}</WhyItem>
              <WhyItem icon={<Lock />}>{t('tutorProfile.whyPrivate')}</WhyItem>
            </ul>
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}

function WhyItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-small">
      <span aria-hidden="true" className="mt-0.5 text-primary [&_svg]:size-4.5">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}
