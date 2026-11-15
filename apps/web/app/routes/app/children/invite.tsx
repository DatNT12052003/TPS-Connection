// /app/children/:learnerId/invite, theo canvas InviteStudent / InviteStudentMobile: phụ huynh mời con tạo tài
// khoản học sinh bằng email của con (D4, D50: liên kết dùng một lần, hết hạn sau 7 ngày). Gửi lời mời mới
// thì lời mời cũ mất hiệu lực. Không bắt buộc: "Để sau" về trang chủ.
// Canvas có thêm cách "sao chép liên kết mời" để gửi qua Zalo; API chỉ gửi liên kết qua email (token không
// trả về cho phụ huynh), nên bản này chỉ có email.
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, useNavigation } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { fieldErrorsFrom, type FormFailure, formErrorFrom, formText } from '~/lib/form';
import { formatDate } from '~/lib/format';
import { learnerName } from '~/lib/learners';
import { learnerIdFrom, loadOwnLearner } from '~/lib/learners.server';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/invite';

type ActionResult =
  { ok: true; done: 'sent'; email: string } | { ok: true; done: 'revoked' } | FormFailure<'email'>;

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.invite.pageTitle} – ${m.common.appName}` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const learner = await loadOwnLearner(request, context, learnerIdFrom(params));
  const created = new URL(request.url).searchParams.get('created') === '1';
  return { learner, created };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  const learnerId = learnerIdFrom(params);
  const form = await request.formData();
  const api = getServerApi(context);
  const path = `/api/v1/learners/${learnerId}/invitation`;

  if (formText(form, 'intent') === 'revoke') {
    try {
      await api.call(path, { method: 'DELETE' });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
      // Lời mời đã được nhận hoặc đã hết hạn trong lúc đó: trang tải lại sẽ hiện tình trạng mới.
      if (error.code !== 'not_found') {
        return data<ActionResult>({ ok: false, fieldErrors: {}, formError: formErrorFrom(error) });
      }
    }
    return data<ActionResult>({ ok: true, done: 'revoked' });
  }

  const email = formText(form, 'email');
  try {
    await api.call(path, { method: 'POST', body: { email } });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    return data<ActionResult>({
      ok: false,
      fieldErrors: fieldErrorsFrom(error, ['email']),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      values: { email },
    });
  }
  return data<ActionResult>({ ok: true, done: 'sent', email: email.trim().toLowerCase() });
}

export default function InviteStudentPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const busyIntent =
    navigation.state !== 'idle' && navigation.formMethod === 'POST'
      ? (navigation.formData?.get('intent') ?? 'invite')
      : null;
  const { learner, created } = loaderData;
  const name = learnerName(learner);
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const pending = learner.pendingInvitation;

  return (
    <PageContainer>
      <nav aria-label={t('layout.breadcrumb')} className="text-small text-muted-foreground">
        <Link to={PATHS.app} className="hover:text-foreground">
          {t('nav.home')}
        </Link>
        <span aria-hidden="true"> › </span>
        <Link to={`${PATHS.children}/${learner.id}`} className="hover:text-foreground">
          {name}
        </Link>
        <span aria-hidden="true"> › </span>
        <span>{t('invite.pageTitle')}</span>
      </nav>

      {created && !actionData && (
        <Alert variant="success" role="status">
          {t('invite.created', { name })}
        </Alert>
      )}
      {actionData?.ok && (
        <Alert variant="success" role="status">
          {actionData.done === 'sent'
            ? t('invite.sent', { email: actionData.email })
            : t('invite.revoked')}
        </Alert>
      )}
      {failure?.formError && (
        <Alert variant="danger" role="alert">
          {tr(failure.formError)}
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4 md:gap-6">
          {learner.hasStudentAccount ? (
            <Card className="gap-3 sm:p-7">
              <h1 className="text-h1">{t('invite.pageTitle')}</h1>
              <span>
                <Badge variant="success">{t('invite.hasAccount')}</Badge>
              </span>
              <p className="text-muted-foreground">{t('invite.hasAccountNote')}</p>
            </Card>
          ) : (
            <Card className="gap-4.5 sm:p-7">
              <div className="flex flex-col gap-1">
                <h1 className="text-h1">{t('invite.title', { name })}</h1>
                <p className="text-muted-foreground">{t('invite.intro')}</p>
              </div>
              <Form method="post" noValidate className="flex flex-col gap-4.5">
                <TextField
                  name="email"
                  type="email"
                  autoComplete="off"
                  required
                  label={t('invite.email')}
                  hint={t('invite.emailHint')}
                  placeholder="ten@gmail.com"
                  defaultValue={failure?.values?.email}
                  error={tr(failure?.fieldErrors.email)}
                />
                <p className="text-small text-muted-foreground">{t('invite.linkRule')}</p>
                <div className="flex flex-col-reverse gap-3 border-t border-border pt-4.5 sm:flex-row sm:justify-end">
                  <Link to={PATHS.app} className={buttonVariants({ variant: 'ghost' })}>
                    {t('invite.later')}
                  </Link>
                  <Button
                    type="submit"
                    name="intent"
                    value="invite"
                    disabled={busyIntent !== null}
                    aria-busy={busyIntent === 'invite'}
                  >
                    {t('invite.send')}
                  </Button>
                </div>
              </Form>
            </Card>
          )}

          {pending && !learner.hasStudentAccount && (
            <Card>
              <h2 className="text-h3">{t('invite.sentTitle')}</h2>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold break-all">{pending.email}</span>
                  <span className="text-small text-muted-foreground">
                    {t('invite.sentOn', {
                      sent: formatDate(pending.createdAt, i18n.language),
                      expires: formatDate(pending.expiresAt, i18n.language),
                    })}
                  </span>
                </div>
                <Badge variant="warning">{t('invite.pending')}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Form method="post">
                  <input type="hidden" name="email" value={pending.email} />
                  <Button
                    type="submit"
                    name="intent"
                    value="invite"
                    variant="secondary"
                    disabled={busyIntent !== null}
                  >
                    {t('invite.resend')}
                  </Button>
                </Form>
                <Form method="post">
                  <Button
                    type="submit"
                    name="intent"
                    value="revoke"
                    variant="ghost"
                    disabled={busyIntent !== null}
                    aria-busy={busyIntent === 'revoke'}
                  >
                    {t('invite.revoke')}
                  </Button>
                </Form>
              </div>
            </Card>
          )}
        </div>

        <aside>
          <Card className="gap-3">
            <h2 className="text-h3">{t('invite.accountTitle')}</h2>
            <span className="text-label">{t('invite.canTitle')}</span>
            <ul className="flex flex-col gap-2">
              {(['invite.can1', 'invite.can2'] as const).map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  {t(key)}
                </li>
              ))}
            </ul>
            <span className="mt-1 text-label">{t('invite.cannotTitle')}</span>
            <ul className="flex flex-col gap-2 text-muted-foreground">
              {(['invite.cannot1', 'invite.cannot2', 'invite.cannot3'] as const).map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <X aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {t(key)}
                </li>
              ))}
            </ul>
            <p className="text-small text-muted-foreground">{t('invite.parentStays')}</p>
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}
