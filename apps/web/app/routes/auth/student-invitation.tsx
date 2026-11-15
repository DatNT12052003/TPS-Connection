// /student-invitation#token=…: con nhận lời mời của phụ huynh (D4, D50), đặt mật khẩu và vào thẳng khu học sinh.
// Token nằm sau `#` nên không bao giờ tới server web hay lọt vào log: trang đọc token ở trình duyệt, xóa nó
// khỏi thanh địa chỉ, rồi gửi trong body tới action (action gọi API /student-invitations/lookup, /accept).
// Email lấy từ lời mời (con đã chứng minh sở hữu email khi nhận được liên kết), nên không cần mã OTP.
import { AuthSessionResponse, StudentInvitationPreview } from '@tps/shared';
import { useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useFetcher, useNavigation } from 'react-router';
import { AuthCenteredLayout } from '~/components/layout/auth-layout';
import { Alert } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { CheckboxField, TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { fieldErrorsFrom, formErrorFrom, formText, type Message } from '~/lib/form';
import { formatDate } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { getCurrentUserOrNull } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/student-invitation';

const ACCEPT_FIELDS = ['password', 'acceptTerms'] as const;
type AcceptField = (typeof ACCEPT_FIELDS)[number];

type ActionResult =
  /** `token` trả lại cho form nhận lời mời (chỉ nằm trong bộ nhớ trình duyệt, không vào HTML). */
  | { intent: 'lookup'; preview: StudentInvitationPreview; token: string }
  /** Lời mời không dùng được (sai, đã dùng, đã hủy, hết hạn): không hiện form nữa. */
  | { intent: 'lookup' | 'accept'; unusable: Message }
  | {
      intent: 'accept';
      fieldErrors: Partial<Record<AcceptField, Message>>;
      formError?: Message;
    };

/** Lỗi nghĩa là liên kết không còn dùng được (khác lỗi nhập liệu như mật khẩu yếu). */
function unusableMessage(error: ApiError): Message | undefined {
  if (error.code === 'invitation_invalid' || error.code === 'invitation_expired') {
    return formErrorFrom(error);
  }
  if (error.code === 'validation_failed' && error.details.some((d) => d.path === 'token')) {
    return { key: 'validation.invalid_token' };
  }
  return undefined;
}

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [
    { title: `${m.studentInvitation.title} – ${m.common.appName}` },
    // Trang theo liên kết riêng: không cho máy tìm kiếm lập chỉ mục.
    { name: 'robots', content: 'noindex' },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  // Đang đăng nhập (ví dụ phụ huynh tự mở liên kết): nhận lời mời sẽ chuyển sang tài khoản học sinh.
  const user = await getCurrentUserOrNull(context);
  return { signedInAs: user?.displayName ?? null };
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const token = formText(form, 'token');
  const api = getServerApi(context);

  if (!token.trim()) {
    return data<ActionResult>({
      intent: formText(form, 'intent') === 'lookup' ? 'lookup' : 'accept',
      unusable: { key: 'validation.invalid_token' },
    });
  }

  if (formText(form, 'intent') === 'lookup') {
    try {
      const preview = await api.call('/api/v1/student-invitations/lookup', {
        method: 'POST',
        body: { token },
        schema: StudentInvitationPreview,
      });
      return data<ActionResult>({ intent: 'lookup', preview, token: token.trim() });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
      return data<ActionResult>({
        intent: 'lookup',
        unusable: unusableMessage(error) ?? formErrorFrom(error),
      });
    }
  }

  const { locale } = await readPreferences(request);
  try {
    // API tạo tài khoản và trả cookie phiên; middleware gửi cookie đó về trình duyệt.
    await api.call('/api/v1/student-invitations/accept', {
      method: 'POST',
      body: {
        token,
        password: formText(form, 'password'),
        locale,
        acceptTerms: form.get('acceptTerms') === 'on',
      },
      schema: AuthSessionResponse,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    const unusable = unusableMessage(error);
    if (unusable) return data<ActionResult>({ intent: 'accept', unusable });
    return data<ActionResult>({
      intent: 'accept',
      fieldErrors: fieldErrorsFrom(error, ACCEPT_FIELDS),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
    });
  }
  return redirect(PATHS.app);
}

/** Token trong phần `#token=…` của địa chỉ; không có thì chuỗi rỗng. */
function readTokenFromHash(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
}

export default function StudentInvitationPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const lookup = useFetcher<typeof action>();

  useEffect(() => {
    // Server không thấy phần sau `#`: đọc token ở đây, tra cứu qua action (action trả lại token cùng kết quả).
    // Thiếu token cũng gửi: action trả "liên kết không đúng" mà không gọi API.
    // Chưa xóa `#token` ở đây: StrictMode (bản dev) chạy effect hai lần; lần hai phải còn đọc được token, nếu
    // không nó gửi token rỗng và hủy lần tra cứu đầu.
    void lookup.submit({ intent: 'lookup', token: readTokenFromHash() }, { method: 'post' });
    // Chỉ chạy một lần khi trang mở.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Tra cứu xong: xóa token khỏi thanh địa chỉ và lịch sử trình duyệt (người khác nhìn màn hình, chia sẻ địa
    // chỉ). Form nhận lời mời dùng token action trả về.
    if (lookup.data && window.location.hash) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, [lookup.data]);

  const looked = lookup.data;
  const found = looked && 'preview' in looked ? looked : undefined;
  const preview = found?.preview;
  const unusable =
    (actionData && 'unusable' in actionData ? actionData.unusable : undefined) ??
    (looked && 'unusable' in looked ? looked.unusable : undefined);
  const acceptFailure = actionData && 'fieldErrors' in actionData ? actionData : undefined;

  let content;
  if (unusable) {
    content = (
      <>
        <h1 className="text-h1">{t('studentInvitation.unusableTitle')}</h1>
        <Alert variant="danger" role="alert">
          {tr(unusable)}
        </Alert>
        <Link to={PATHS.login} className="font-semibold text-primary hover:text-primary-hover">
          {t('studentInvitation.haveAccount')}
        </Link>
      </>
    );
  } else if (!preview) {
    content = (
      <p role="status" className="text-muted-foreground">
        {t('studentInvitation.checking')}
      </p>
    );
  } else {
    content = (
      <>
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{t('studentInvitation.title')}</h1>
          <p className="text-muted-foreground">
            {t('studentInvitation.intro', {
              inviter: preview.inviterName,
              learner: preview.learnerName,
            })}
          </p>
        </div>

        {loaderData.signedInAs && (
          <Alert variant="warning">
            {t('studentInvitation.signedInAs', { name: loaderData.signedInAs })}
          </Alert>
        )}
        {acceptFailure?.formError && (
          <Alert variant="danger" role="alert">
            {tr(acceptFailure.formError)}
          </Alert>
        )}

        <Form method="post" noValidate className="flex flex-col gap-5">
          <input type="hidden" name="intent" value="accept" />
          <input type="hidden" name="token" value={found?.token} />
          <TextField
            name="email"
            type="email"
            label={t('studentInvitation.email')}
            value={preview.email}
            readOnly
            disabled
            autoComplete="username"
          />
          <TextField
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            label={t('studentInvitation.password')}
            hint={t('register.passwordHint')}
            error={tr(acceptFailure?.fieldErrors.password)}
          />
          <CheckboxField
            name="acceptTerms"
            required
            error={tr(acceptFailure?.fieldErrors.acceptTerms)}
          >
            <Trans
              i18nKey="register.terms"
              components={{
                termsLink: (
                  <Link to={PATHS.terms} className="font-semibold text-primary underline" />
                ),
                privacyLink: (
                  <Link to={PATHS.privacy} className="font-semibold text-primary underline" />
                ),
              }}
            />
          </CheckboxField>
          <Button type="submit" size="lg" block disabled={submitting} aria-busy={submitting}>
            {t('studentInvitation.submit')}
          </Button>
          <p className="text-center text-small text-muted-foreground">
            {t('studentInvitation.expires', {
              date: formatDate(preview.expiresAt, i18n.language),
            })}
          </p>
        </Form>
      </>
    );
  }

  return (
    <AuthCenteredLayout>
      <Card className="w-full max-w-110 gap-5 p-6 sm:p-7">{content}</Card>
    </AuthCenteredLayout>
  );
}
