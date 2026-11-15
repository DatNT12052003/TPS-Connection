// /login, theo canvas Login / LoginMobile. Đăng nhập qua API (D57): API đặt cookie httpOnly, server web
// chuyển cookie đó về trình duyệt (server-api.server.ts). Thành công: về trang đang xem dở (`redirectTo`)
// hoặc trang chính theo vai trò.
import { AuthSessionResponse } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { AuthSplitLayout } from '~/components/layout/auth-layout';
import { Alert } from '~/components/ui/alert';
import { Button, buttonVariants } from '~/components/ui/button';
import { CheckboxField, TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import {
  errorMessage,
  fieldErrorsFrom,
  type FormFailure,
  formErrorFrom,
  formText,
} from '~/lib/form';
import { messagesFromMatches } from '~/lib/meta';
import { useMessage } from '~/lib/use-message';
import { PATHS } from '~/lib/navigation';
import { serializePendingVerification } from '~/lib/pending-verification.server';
import { safeRedirectPath } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { getCurrentUserOrNull, homePathFor } from '~/lib/session.server';
import type { Route } from './+types/login';

const FIELDS = ['email', 'password'] as const;
type LoginFailure = FormFailure<(typeof FIELDS)[number]> & { needsVerification?: boolean };

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.login.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const redirectTo = safeRedirectPath(new URL(request.url).searchParams.get('redirectTo'), '');
  const user = await getCurrentUserOrNull(context);
  if (user) throw redirect(redirectTo || homePathFor(user));
  return { redirectTo };
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const email = formText(form, 'email');
  const redirectTo = safeRedirectPath(formText(form, 'redirectTo'), '');
  try {
    const session = await getServerApi(context).call('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email,
        password: formText(form, 'password'),
        rememberMe: form.get('rememberMe') === 'on',
      },
      schema: AuthSessionResponse,
    });
    return redirect(redirectTo || homePathFor(session.user));
  } catch (error) {
    const failure: LoginFailure = { ok: false, fieldErrors: {}, values: { email } };
    if (error instanceof ApiError && error.code === 'email_not_verified') {
      // Đúng mật khẩu nhưng chưa xác thực email: mở màn nhập mã cho email này.
      const cookie = await serializePendingVerification({ email, sentAt: null });
      return data<LoginFailure>(
        { ...failure, formError: errorMessage('email_not_verified'), needsVerification: true },
        { headers: { 'Set-Cookie': cookie } },
      );
    }
    if (error instanceof ApiError && error.code === 'validation_failed') {
      return data<LoginFailure>({ ...failure, fieldErrors: fieldErrorsFrom(error, FIELDS) });
    }
    if (error instanceof ApiError && error.status > 0 && error.status < 500) {
      return data<LoginFailure>({ ...failure, formError: formErrorFrom(error) });
    }
    throw error;
  }
}

export default function LoginPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const failure = actionData;
  const tr = useMessage();

  return (
    <AuthSplitLayout
      title={t('auth.brandLoginTitle')}
      points={[t('auth.brandLoginPoint1'), t('auth.brandLoginPoint2'), t('auth.brandLoginPoint3')]}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('login.title')}</h1>
        <p className="text-muted-foreground">
          {t('login.noAccount')}{' '}
          <Link to={PATHS.register} className="font-semibold text-primary hover:text-primary-hover">
            {t('login.registerFree')}
          </Link>
        </p>
      </div>

      {failure?.formError && (
        <Alert variant="danger" role="alert">
          <p>{tr(failure.formError)}</p>
          {failure.needsVerification && (
            <Link
              to={PATHS.verifyEmail}
              className={buttonVariants({ variant: 'secondary', className: 'mt-2' })}
            >
              {t('login.enterCode')}
            </Link>
          )}
        </Alert>
      )}

      <Form method="post" className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="redirectTo" value={loaderData.redirectTo} />
        <TextField
          name="email"
          type="email"
          autoComplete="email"
          required
          label={t('login.email')}
          defaultValue={failure?.values?.email}
          error={tr(failure?.fieldErrors.email)}
        />
        <TextField
          name="password"
          type="password"
          autoComplete="current-password"
          required
          label={t('login.password')}
          error={tr(failure?.fieldErrors.password)}
          labelAside={
            <Link
              to={PATHS.forgotPassword}
              className="text-small font-semibold text-primary hover:text-primary-hover"
            >
              {t('login.forgot')}
            </Link>
          }
        />
        <CheckboxField name="rememberMe" defaultChecked>
          {t('login.remember')}
        </CheckboxField>
        <Button type="submit" size="lg" block disabled={submitting} aria-busy={submitting}>
          {t('login.submit')}
        </Button>
      </Form>
    </AuthSplitLayout>
  );
}
