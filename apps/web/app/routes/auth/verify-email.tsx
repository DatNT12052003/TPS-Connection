// /verify-email, theo canvas VerifyEmail / VerifyEmailMobile. Nhập mã 6 số gửi qua email (D54): đúng mã
// thì email được xác thực và đăng nhập luôn (D57). Email lấy từ cookie chờ xác thực (sau đăng ký, hoặc
// đăng nhập khi chưa xác thực); không có cookie thì hỏi email.
import { AuthSessionResponse, CodeSentResponse, OTP_RULES } from '@tps/shared';
import { MailCheck, CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  data,
  Form,
  Link,
  redirect,
  type ShouldRevalidateFunctionArgs,
  useNavigation,
} from 'react-router';
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
import {
  clearPendingVerification,
  readPendingVerification,
  serializePendingVerification,
} from '~/lib/pending-verification.server';
import { getServerApi } from '~/lib/server-api.server';
import { getCurrentUserOrNull, homePathFor } from '~/lib/session.server';
import type { Route } from './+types/verify-email';

type ActionResult =
  | { status: 'verified'; homePath: string; isTutor: boolean }
  | { status: 'resent'; email: string; resendAfterSeconds: number }
  | {
      status: 'failed';
      email: string;
      fieldErrors: Partial<Record<'email' | 'code', Message>>;
      formError?: Message;
      resendAfterSeconds?: number;
    };

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.verifyEmail.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const pending = await readPendingVerification(request);
  if (!pending) {
    // Đã đăng nhập mà không có email chờ xác thực: không có gì để làm ở đây.
    const user = await getCurrentUserOrNull(context);
    if (user) throw redirect(homePathFor(user));
  }
  const elapsed = pending?.sentAt ? (Date.now() - pending.sentAt) / 1000 : Infinity;
  return {
    email: pending?.email ?? null,
    resendAfterSeconds: Math.max(0, Math.ceil(OTP_RULES.resendCooldownSeconds - elapsed)),
  };
}

/** Sau khi xác thực xong, không chạy lại loader của trang này (sẽ chuyển hướng đi vì đã đăng nhập). */
export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  const result = actionResult as ActionResult | undefined;
  return result?.status === 'verified' ? false : defaultShouldRevalidate;
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const email = formText(form, 'email').trim().toLowerCase();
  const api = getServerApi(context);

  if (form.get('intent') === 'resend') {
    try {
      const sent = await api.call('/api/v1/auth/email-verification/resend', {
        method: 'POST',
        body: { email },
        schema: CodeSentResponse,
      });
      const cookie = await serializePendingVerification({ email, sentAt: Date.now() });
      return data<ActionResult>(
        { status: 'resent', email, resendAfterSeconds: sent.resendAfterSeconds },
        { headers: { 'Set-Cookie': cookie } },
      );
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
      const wait = error.meta.retryAfterSeconds;
      return data<ActionResult>({
        status: 'failed',
        email,
        fieldErrors: fieldErrorsFrom(error, ['email']),
        // Còn trong 45 giây chờ: chỉ hiện đồng hồ đếm ngược, không báo lỗi.
        ...(error.code === 'rate_limited' && typeof wait === 'number' && wait <= 60
          ? { resendAfterSeconds: wait }
          : error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      });
    }
  }

  try {
    const session = await api.call('/api/v1/auth/email-verification/confirm', {
      method: 'POST',
      body: { email, code: formText(form, 'code').trim() },
      schema: AuthSessionResponse,
    });
    return data<ActionResult>(
      {
        status: 'verified',
        homePath: homePathFor(session.user),
        isTutor: session.user.roles.includes('tutor'),
      },
      { headers: { 'Set-Cookie': await clearPendingVerification() } },
    );
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    const attemptsLeft = error.meta.attemptsLeft;
    if (error.code === 'invalid_code' && typeof attemptsLeft === 'number') {
      return data<ActionResult>({
        status: 'failed',
        email,
        fieldErrors: { code: { key: 'verifyEmail.wrongCode', values: { count: attemptsLeft } } },
      });
    }
    return data<ActionResult>({
      status: 'failed',
      email,
      fieldErrors: fieldErrorsFrom(error, ['email', 'code']),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
    });
  }
}

export default function VerifyEmailPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const tr = useMessage();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const result = actionData;

  if (result?.status === 'verified') {
    return (
      <AuthCenteredLayout>
        <Card className="w-full max-w-105 items-center gap-4 p-7 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-full bg-success-subtle text-success">
            <CircleCheck aria-hidden="true" className="size-8" />
          </span>
          <h1 className="text-h1" tabIndex={-1}>
            {t('verifyEmail.doneTitle')}
          </h1>
          <p className="text-muted-foreground">
            {t(result.isTutor ? 'verifyEmail.doneTutor' : 'verifyEmail.doneParent')}
          </p>
          <Link to={result.homePath} className={buttonVariants({ size: 'lg', block: true })}>
            {t('verifyEmail.doneCta')}
          </Link>
        </Card>
      </AuthCenteredLayout>
    );
  }

  const email = result && 'email' in result ? result.email || loaderData.email : loaderData.email;
  const failure = result?.status === 'failed' ? result : undefined;
  const resendSeconds =
    result?.status === 'resent'
      ? result.resendAfterSeconds
      : (failure?.resendAfterSeconds ?? loaderData.resendAfterSeconds);

  return (
    <AuthCenteredLayout>
      <Card className="w-full max-w-105 items-center gap-4 p-7 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
          <MailCheck aria-hidden="true" className="size-8" />
        </span>
        <h1 className="text-h1">{t('verifyEmail.title')}</h1>
        {email ? (
          <p className="text-muted-foreground">
            {t('verifyEmail.sentTo')}
            <br />
            <strong className="font-semibold text-foreground">{email}</strong>
            <br />
            {t('verifyEmail.validity', { minutes: OTP_RULES.ttlSeconds / 60 })}
          </p>
        ) : (
          <p className="text-muted-foreground">{t('verifyEmail.askEmail')}</p>
        )}

        {result?.status === 'resent' && (
          <Alert variant="success" role="status" className="w-full text-left">
            {t('verifyEmail.resent')}
          </Alert>
        )}
        {failure?.formError && (
          <Alert variant="danger" role="alert" className="w-full text-left">
            {tr(failure.formError)}
          </Alert>
        )}

        <Form method="post" className="flex w-full flex-col gap-4 text-left" noValidate>
          {email ? (
            <input type="hidden" name="email" value={email} />
          ) : (
            <TextField
              name="email"
              type="email"
              autoComplete="email"
              required
              label={t('verifyEmail.email')}
              error={tr(failure?.fieldErrors.email)}
            />
          )}
          <CodeField
            label={t('verifyEmail.code')}
            hint={t('verifyEmail.codeHint')}
            error={tr(failure?.fieldErrors.code)}
          />
          <Button
            type="submit"
            name="intent"
            value="verify"
            size="lg"
            block
            disabled={submitting}
            aria-busy={submitting}
          >
            {t('verifyEmail.submit')}
          </Button>
          <ResendButton seconds={resendSeconds} resetKey={result} disabled={submitting} />
        </Form>

        {email && (
          <Link to={PATHS.register} className={buttonVariants({ variant: 'ghost' })}>
            {t('verifyEmail.changeEmail')}
          </Link>
        )}
        <p className="text-small text-muted-foreground">{t('verifyEmail.spamHint')}</p>
        <p className="text-small text-muted-foreground">{t('verifyEmail.limitNote')}</p>
      </Card>
    </AuthCenteredLayout>
  );
}
