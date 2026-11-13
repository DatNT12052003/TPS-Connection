// /forgot-password, theo canvas ForgotPassword / ForgotPasswordMobile: hai bước trên một trang (D54).
// Bước 1 nhập email (luôn báo "đã gửi" dù email có tài khoản hay không). Bước 2 nhập mã và mật khẩu mới;
// đổi xong thì mọi thiết bị bị đăng xuất (D50), người dùng đăng nhập lại.
import { OTP_RULES } from '@tps/shared';
import { ChevronLeft, CircleCheck } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { data, Form, Link, useNavigation } from 'react-router';
import { CodeField } from '~/components/auth/code-field';
import { ResendButton } from '~/components/auth/resend-button';
import { AuthCenteredLayout } from '~/components/layout/auth-layout';
import { Alert } from '~/components/ui/alert';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { fieldErrorsFrom, formErrorFrom, formText, type Message } from '~/lib/form';
import { messagesFromMatches } from '~/lib/meta';
import { useMessage } from '~/lib/use-message';
import { PATHS } from '~/lib/navigation';
import { getServerApi } from '~/lib/server-api.server';
import { cn } from '~/lib/utils';
import type { Route } from './+types/forgot-password';

type ResetField = 'email' | 'code' | 'newPassword' | 'confirmPassword';

type ActionResult =
  | {
      step: 'request';
      email: string;
      fieldErrors: Partial<Record<'email', Message>>;
      formError?: Message;
    }
  | {
      step: 'reset';
      email: string;
      resendAfterSeconds: number;
      fieldErrors: Partial<Record<ResetField, Message>>;
      formError?: Message;
    }
  | { step: 'done' };

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.forgotPassword.title} – ${m.common.appName}` }];
}

const isClientError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status >= 400 && error.status < 500;

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const email = formText(form, 'email').trim().toLowerCase();
  const api = getServerApi(context);

  // Bước 1 (và "Gửi lại mã" ở bước 2): xin mã đặt lại mật khẩu.
  if (form.get('intent') !== 'reset') {
    try {
      await api.call('/api/v1/auth/password-reset/request', { method: 'POST', body: { email } });
      return data<ActionResult>({
        step: 'reset',
        email,
        resendAfterSeconds: OTP_RULES.resendCooldownSeconds,
        fieldErrors: {},
      });
    } catch (error) {
      if (!isClientError(error)) throw error;
      const wait = error.meta.retryAfterSeconds;
      if (
        error.code === 'rate_limited' &&
        typeof wait === 'number' &&
        form.get('intent') === 'resend'
      ) {
        return data<ActionResult>({
          step: 'reset',
          email,
          resendAfterSeconds: wait,
          fieldErrors: {},
        });
      }
      return data<ActionResult>({
        step: 'request',
        email,
        fieldErrors: fieldErrorsFrom(error, ['email']),
        ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      });
    }
  }

  // Bước 2: mã + mật khẩu mới.
  const newPassword = formText(form, 'newPassword');
  const failed = (fieldErrors: Partial<Record<ResetField, Message>>, formError?: Message) =>
    data<ActionResult>({
      step: 'reset',
      email,
      resendAfterSeconds: 0,
      fieldErrors,
      ...(formError && { formError }),
    });

  if (newPassword !== formText(form, 'confirmPassword')) {
    return failed({ confirmPassword: { key: 'validation.password_mismatch' } });
  }
  try {
    await api.call('/api/v1/auth/password-reset/confirm', {
      method: 'POST',
      body: { email, code: formText(form, 'code').trim(), newPassword },
    });
    return data<ActionResult>({ step: 'done' });
  } catch (error) {
    if (!isClientError(error)) throw error;
    const attemptsLeft = error.meta.attemptsLeft;
    if (error.code === 'invalid_code' && typeof attemptsLeft === 'number') {
      return failed({ code: { key: 'verifyEmail.wrongCode', values: { count: attemptsLeft } } });
    }
    return failed(
      fieldErrorsFrom(error, ['email', 'code', 'newPassword']),
      error.code === 'validation_failed' ? undefined : formErrorFrom(error),
    );
  }
}

export default function ForgotPasswordPage({ actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const tr = useMessage();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const result = actionData;

  if (result?.step === 'done') {
    return (
      <AuthCenteredLayout>
        <Card className="w-full max-w-105 items-center gap-4 p-7 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-full bg-success-subtle text-success">
            <CircleCheck aria-hidden="true" className="size-8" />
          </span>
          <h1 className="text-h1">{t('forgotPassword.doneTitle')}</h1>
          <p className="text-muted-foreground">{t('forgotPassword.doneBody')}</p>
          <Link to={PATHS.login} className={buttonVariants({ size: 'lg', block: true })}>
            {t('forgotPassword.login')}
          </Link>
        </Card>
      </AuthCenteredLayout>
    );
  }

  const step = result?.step ?? 'request';

  return (
    <AuthCenteredLayout>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-overline text-muted-foreground">{t('forgotPassword.overline')}</span>
        <h1 className="text-h1">{t('forgotPassword.title')}</h1>
      </div>
      <ol className="flex w-full max-w-105 gap-2">
        <StepBadge
          n={1}
          label={t('forgotPassword.step1')}
          state={step === 'request' ? 'now' : 'done'}
        />
        <StepBadge
          n={2}
          label={t('forgotPassword.step2')}
          state={step === 'reset' ? 'now' : 'todo'}
        />
      </ol>

      <Card className="w-full max-w-105 gap-4 p-7">
        {result?.formError && (
          <Alert variant="danger" role="alert">
            {tr(result.formError)}
          </Alert>
        )}

        {step === 'request' ? (
          <Form method="post" className="flex flex-col gap-4" noValidate>
            <p className="text-muted-foreground">{t('forgotPassword.step1Body')}</p>
            <TextField
              name="email"
              type="email"
              autoComplete="email"
              required
              label={t('forgotPassword.email')}
              defaultValue={result?.email}
              error={tr(result?.step === 'request' ? result.fieldErrors.email : undefined)}
            />
            <Button
              type="submit"
              name="intent"
              value="request"
              block
              disabled={submitting}
              aria-busy={submitting}
            >
              {t('forgotPassword.sendCode')}
            </Button>
            <Link to={PATHS.login} className={buttonVariants({ variant: 'ghost' })}>
              <ChevronLeft aria-hidden="true" />
              {t('forgotPassword.backToLogin')}
            </Link>
          </Form>
        ) : (
          result?.step === 'reset' && (
            <Form method="post" className="flex flex-col gap-4" noValidate>
              <input type="hidden" name="email" value={result.email} />
              <p className="text-small text-muted-foreground">
                <Trans
                  i18nKey="forgotPassword.step2Body"
                  values={{ email: result.email }}
                  components={{ strong: <strong className="font-semibold text-foreground" /> }}
                />
              </p>
              <CodeField label={t('forgotPassword.code')} error={tr(result.fieldErrors.code)} />
              <TextField
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                label={t('forgotPassword.newPassword')}
                hint={t('register.passwordHint')}
                error={tr(result.fieldErrors.newPassword)}
              />
              <TextField
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                label={t('forgotPassword.confirmPassword')}
                error={tr(result.fieldErrors.confirmPassword)}
              />
              <Button
                type="submit"
                name="intent"
                value="reset"
                block
                disabled={submitting}
                aria-busy={submitting}
              >
                {t('forgotPassword.save')}
              </Button>
              <ResendButton
                seconds={result.resendAfterSeconds}
                resetKey={result}
                disabled={submitting}
              />
              <Link
                to={PATHS.forgotPassword}
                reloadDocument
                className={buttonVariants({ variant: 'ghost' })}
              >
                {t('forgotPassword.otherEmail')}
              </Link>
            </Form>
          )
        )}
      </Card>
    </AuthCenteredLayout>
  );
}

function StepBadge({
  n,
  label,
  state,
}: {
  n: number;
  label: string;
  state: 'done' | 'now' | 'todo';
}) {
  return (
    <li
      aria-current={state === 'now' ? 'step' : undefined}
      className={cn(
        'flex flex-1 items-center gap-3 rounded-md px-3 py-2',
        state === 'now' ? 'bg-primary-subtle text-primary-subtle-foreground' : 'bg-surface-sunken',
      )}
    >
      <span
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-small font-bold',
          state === 'done' && 'bg-success text-surface',
          state === 'now' && 'bg-primary text-primary-foreground',
          state === 'todo' && 'text-muted-foreground ring-1 ring-border-strong ring-inset',
        )}
      >
        {n}
      </span>
      <span className="text-small font-semibold">{label}</span>
    </li>
  );
}
