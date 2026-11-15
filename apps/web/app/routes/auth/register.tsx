// /register, theo canvas Register / RegisterMobile. Đăng ký phụ huynh hoặc gia sư; xong thì chưa đăng nhập
// (D57) mà sang màn nhập mã xác thực email (D54). Email đang chờ xác thực giữ trong cookie httpOnly.
import { SelfRegisterRole } from '@tps/shared';
import { Trans, useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { AuthSplitLayout } from '~/components/layout/auth-layout';
import { Alert } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { CheckboxField, ChoiceCard, TextField } from '~/components/ui/field';
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
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { getCurrentUserOrNull, homePathFor } from '~/lib/session.server';
import type { Route } from './+types/register';

const FIELDS = ['role', 'fullName', 'email', 'phone', 'password', 'acceptTerms'] as const;
type Field = (typeof FIELDS)[number];

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.register.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getCurrentUserOrNull(context);
  if (user) throw redirect(homePathFor(user));
  const role = SelfRegisterRole.catch('parent').parse(
    new URL(request.url).searchParams.get('role'),
  );
  return { role };
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const values = {
    role: formText(form, 'role'),
    fullName: formText(form, 'fullName'),
    email: formText(form, 'email'),
    phone: formText(form, 'phone'),
  };
  const { locale } = await readPreferences(request);
  try {
    await getServerApi(context).call('/api/v1/auth/register', {
      method: 'POST',
      body: {
        ...values,
        phone: values.phone.trim() || undefined,
        password: formText(form, 'password'),
        locale,
        acceptTerms: form.get('acceptTerms') === 'on',
      },
    });
  } catch (error) {
    const failure: FormFailure<Field> = { ok: false, fieldErrors: {}, values };
    if (error instanceof ApiError && error.code === 'validation_failed') {
      return data<FormFailure<Field>>({ ...failure, fieldErrors: fieldErrorsFrom(error, FIELDS) });
    }
    if (error instanceof ApiError && error.code === 'email_taken') {
      return data<FormFailure<Field>>({
        ...failure,
        fieldErrors: { email: errorMessage('email_taken') },
      });
    }
    if (error instanceof ApiError && error.status > 0 && error.status < 500) {
      return data<FormFailure<Field>>({ ...failure, formError: formErrorFrom(error) });
    }
    throw error;
  }
  const pending = await serializePendingVerification({
    email: values.email.trim().toLowerCase(),
    sentAt: Date.now(),
  });
  return redirect(PATHS.verifyEmail, { headers: { 'Set-Cookie': pending } });
}

export default function RegisterPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const failure = actionData;
  const tr = useMessage();
  const role = failure?.values?.role ?? loaderData.role;

  return (
    <AuthSplitLayout
      title={t('auth.brandRegisterTitle')}
      points={[
        t('auth.brandRegisterPoint1'),
        t('auth.brandRegisterPoint2'),
        t('auth.brandRegisterPoint3'),
      ]}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('register.title')}</h1>
        <p className="text-muted-foreground">
          {t('register.haveAccount')}{' '}
          <Link to={PATHS.login} className="font-semibold text-primary hover:text-primary-hover">
            {t('layout.login')}
          </Link>
        </p>
      </div>

      {failure?.formError && (
        <Alert variant="danger" role="alert">
          {tr(failure.formError)}
        </Alert>
      )}

      <Form method="post" className="flex flex-col gap-5" noValidate>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label">{t('register.roleLegend')}</legend>
          <div className="grid grid-cols-2 gap-3">
            <ChoiceCard
              name="role"
              value="parent"
              defaultChecked={role !== 'tutor'}
              title={t('register.roleParent')}
              description={t('register.roleParentHint')}
            />
            <ChoiceCard
              name="role"
              value="tutor"
              defaultChecked={role === 'tutor'}
              title={t('register.roleTutor')}
              description={t('register.roleTutorHint')}
            />
          </div>
        </fieldset>
        <TextField
          name="fullName"
          autoComplete="name"
          required
          maxLength={100}
          label={t('register.fullName')}
          defaultValue={failure?.values?.fullName}
          error={tr(failure?.fieldErrors.fullName)}
        />
        <TextField
          name="email"
          type="email"
          autoComplete="email"
          required
          label={t('register.email')}
          defaultValue={failure?.values?.email}
          error={tr(failure?.fieldErrors.email)}
        />
        <TextField
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="0912 345 678"
          label={t('register.phone')}
          hint={t('register.phoneHint')}
          defaultValue={failure?.values?.phone}
          error={tr(failure?.fieldErrors.phone)}
        />
        <TextField
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          label={t('register.password')}
          hint={t('register.passwordHint')}
          error={tr(failure?.fieldErrors.password)}
        />
        <CheckboxField name="acceptTerms" required error={tr(failure?.fieldErrors.acceptTerms)}>
          <Trans
            i18nKey="register.terms"
            components={{
              termsLink: <Link to={PATHS.terms} className="font-semibold text-primary underline" />,
              privacyLink: (
                <Link to={PATHS.privacy} className="font-semibold text-primary underline" />
              ),
            }}
          />
        </CheckboxField>
        <Button type="submit" size="lg" block disabled={submitting} aria-busy={submitting}>
          {t('register.submit')}
        </Button>
        <p className="text-center text-small text-muted-foreground">{t('register.codeNote')}</p>
      </Form>
    </AuthSplitLayout>
  );
}
