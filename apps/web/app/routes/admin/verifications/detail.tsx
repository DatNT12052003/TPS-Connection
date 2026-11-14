// /admin/verifications/:requestId: màn duyệt một yêu cầu xác minh (canvas ManagerQueue, ô bên phải).
//   - Thông tin gia sư tự khai để đối chiếu, giấy tờ, các lần nộp trước.
//   - Xem ảnh: intent `view` (fetcher, không tải lại trang): API cấp URL 2 phút và ghi nhật ký kiểm toán (C1).
//   - Duyệt (intent `approve`) / từ chối kèm lý do (intent `reject`); xong quay về hàng chờ với thông báo.
// Yêu cầu đã xử lý, hoặc là hồ sơ của chính người xem: chỉ xem, không có nút.
import {
  DocumentViewUrl,
  type ReviewDocument,
  VerificationRejectionCode,
  VerificationRequestDetail,
} from '@tps/shared';
import { ArrowLeft, Check, Eye, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  data,
  Form,
  Link,
  redirect,
  type ShouldRevalidateFunctionArgs,
  useFetcher,
  useLocation,
  useNavigation,
  useSearchParams,
} from 'react-router';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { CheckboxField, SelectField, TextAreaField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { fieldErrorsFrom, formErrorFrom, formText, type Message } from '~/lib/form';
import { formatDate, formatDateTime, formatFileSize } from '~/lib/format';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import { DueBadge } from './queue';
import type { Route } from './+types/detail';

const QUEUE = '/admin/verifications';
const REJECT_FIELDS = ['rejectionCode', 'rejectionNote'] as const;
type RejectField = (typeof REJECT_FIELDS)[number];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['manager'] });
  const detail = await getServerApi(context).call(
    `/api/v1/admin/verification-requests/${encodeURIComponent(params.requestId)}`,
    { schema: VerificationRequestDetail },
  );
  return { detail, now: new Date().toISOString() };
}

export type ReviewActionResult =
  | { intent: 'view'; ok: true; documentId: string; view: DocumentViewUrl }
  | { intent: 'view'; ok: false; documentId: string; formError: Message }
  | {
      intent: 'approve' | 'reject';
      ok: false;
      fieldErrors: Partial<Record<RejectField, Message>>;
      formError?: Message;
      values?: Record<RejectField, string>;
    };

export async function action({ request, context, params }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['manager'] });
  const form = await request.formData();
  const intent = formText(form, 'intent');
  const api = getServerApi(context);
  const base = `/api/v1/admin/verification-requests/${encodeURIComponent(params.requestId)}`;
  // Quay về hàng chờ đúng bộ lọc đang xem.
  const kind = formText(form, 'kind');
  const back = (done: string) =>
    redirect(`${QUEUE}?${new URLSearchParams({ ...(kind && { kind }), done }).toString()}`);

  const isClientError = (error: unknown): error is ApiError =>
    error instanceof ApiError && error.status > 0 && error.status < 500;

  if (intent === 'view') {
    const documentId = formText(form, 'documentId');
    try {
      const view = await api.call(`${base}/documents/${encodeURIComponent(documentId)}/view`, {
        method: 'POST',
        schema: DocumentViewUrl,
      });
      return data<ReviewActionResult>({ intent, ok: true, documentId, view });
    } catch (error) {
      if (!isClientError(error)) throw error;
      return data<ReviewActionResult>({
        intent,
        ok: false,
        documentId,
        formError: formErrorFrom(error),
      });
    }
  }

  if (intent === 'approve') {
    try {
      await api.call(`${base}/approve`, { method: 'POST', schema: VerificationRequestDetail });
      return back('approved');
    } catch (error) {
      if (!isClientError(error)) throw error;
      return data<ReviewActionResult>({
        intent,
        ok: false,
        fieldErrors: {},
        formError: formErrorFrom(error),
      });
    }
  }

  if (intent !== 'reject') throw data(null, { status: 400 });
  const values = {
    rejectionCode: formText(form, 'rejectionCode'),
    rejectionNote: formText(form, 'rejectionNote'),
  };
  try {
    await api.call(`${base}/reject`, {
      method: 'POST',
      body: values,
      schema: VerificationRequestDetail,
    });
    return back('rejected');
  } catch (error) {
    if (!isClientError(error)) throw error;
    return data<ReviewActionResult>({
      intent,
      ok: false,
      fieldErrors: fieldErrorsFrom(error, REJECT_FIELDS),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      values,
    });
  }
}

/** Xem ảnh không làm đổi dữ liệu trang: không tải lại. */
export function shouldRevalidate({
  formData,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return formData?.get('intent') === 'view' ? false : defaultShouldRevalidate;
}

export default function VerificationReviewPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const { detail, now } = loaderData;
  const decision = actionData && actionData.intent !== 'view' ? actionData : undefined;
  const kindLabel =
    detail.kind === 'credential'
      ? t('review.kindCredential', { title: detail.credential?.title ?? '' })
      : detail.tutor.occupation === 'university_student'
        ? t('review.kindIdentityStudent')
        : t('review.kindIdentity');
  const name = detail.tutor.fullName ?? detail.tutor.displayName;
  const canDecide = detail.status === 'pending' && !detail.isOwnRequest;
  const { search } = useLocation();

  return (
    <Card className="gap-5 sm:p-6">
      <Link
        to={`${QUEUE}${search}`}
        className={buttonVariants({ variant: 'ghost', className: 'self-start lg:hidden' })}
      >
        <ArrowLeft aria-hidden="true" />
        {t('review.back')}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-h2">
            {name} · {kindLabel}
          </h2>
          <span className="text-small text-muted-foreground">
            {t('review.attemptNth', { n: detail.attempt })} ·{' '}
            {t('review.dueAt', { date: formatDate(detail.reviewDueAt, i18n.language) })}
          </span>
        </div>
        {detail.status === 'pending' ? (
          <DueBadge due={detail.reviewDueAt} now={now} />
        ) : (
          <Badge variant={detail.status === 'approved' ? 'success' : 'danger'}>
            {t(`verificationRequestStatus.${detail.status}`)}
          </Badge>
        )}
      </div>

      <dl className="grid gap-x-4 gap-y-2 text-small sm:grid-cols-2">
        <Fact
          label={t('review.declaredName')}
          value={detail.tutor.fullName ?? t('review.notDeclared')}
        />
        <Fact
          label={t('review.occupation')}
          value={
            detail.tutor.occupation
              ? t(`tutorOccupation.${detail.tutor.occupation}`)
              : t('review.notDeclared')
          }
        />
        <Fact
          label={t('review.institution')}
          value={detail.tutor.institution ?? t('review.notDeclared')}
        />
        {detail.credential && (
          <Fact
            label={t('review.credential')}
            value={[
              t(`credentialKind.${detail.credential.kind}`),
              detail.credential.title,
              detail.credential.issuer,
              detail.credential.issuedYear,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        )}
      </dl>

      {detail.isOwnRequest && <Alert variant="warning">{t('review.ownRequest')}</Alert>}
      {detail.status !== 'pending' && detail.reviewedAt && (
        <Alert variant="info">
          {t('review.decided', {
            status: t(`verificationRequestStatus.${detail.status}`),
            date: formatDate(detail.reviewedAt, i18n.language),
          })}
          {detail.rejectionCode &&
            ` ${t('verification.rejectedReason', {
              reason: t(`verificationRejectionCode.${detail.rejectionCode}`),
            })}`}
          {detail.rejectionNote && ` · ${detail.rejectionNote}`}
        </Alert>
      )}

      <Documents detail={detail} canView={canDecide} />

      {canDecide && (
        <>
          <fieldset className="flex flex-col border-t border-border pt-3">
            <legend className="text-label">{t('review.checklist')}</legend>
            <CheckboxField>{t('review.checkName')}</CheckboxField>
            {detail.kind === 'identity' ? (
              <>
                <CheckboxField>{t('review.checkImage')}</CheckboxField>
                {detail.tutor.occupation === 'university_student' && (
                  <CheckboxField>{t('review.checkStudentCard')}</CheckboxField>
                )}
              </>
            ) : (
              <CheckboxField>{t('review.checkCredential')}</CheckboxField>
            )}
            <span className="text-small text-muted-foreground">{t('review.checklistHint')}</span>
          </fieldset>
          <Decision detail={detail} failure={decision} />
        </>
      )}

      {detail.history.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-label">{t('review.historyTitle')}</h3>
          <ul className="flex flex-col gap-1.5 text-small">
            {detail.history.map((h) => (
              <li key={h.id}>
                {t('review.historyItem', {
                  date: formatDate(h.submittedAt, i18n.language),
                  status: t(`verificationRequestStatus.${h.status}`),
                })}
                {h.rejectionCode && ` · ${t(`verificationRejectionCode.${h.rejectionCode}`)}`}
                {h.rejectionNote && ` · ${h.rejectionNote}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {decision?.formError && (
        <Alert variant="danger" role="alert">
          {tr(decision.formError)}
        </Alert>
      )}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

/** Danh sách giấy tờ; mỗi nút "Xem" xin một URL mới (ghi nhật ký) rồi hiện ảnh ngay dưới danh sách. */
function Documents({ detail, canView }: { detail: VerificationRequestDetail; canView: boolean }) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const fetcher = useFetcher<ReviewActionResult>();
  const result = fetcher.data?.intent === 'view' ? fetcher.data : undefined;
  const loadingId = fetcher.state !== 'idle' ? fetcher.formData?.get('documentId') : null;
  const typeOf = (doc: ReviewDocument) => t(`verificationDocumentType.${doc.type}`);

  if (detail.documents.length === 0) {
    return (
      <p className="text-small text-muted-foreground">
        {detail.status === 'pending' ? null : t('review.documentsPurged')}
      </p>
    );
  }
  const shown = result?.ok ? detail.documents.find((d) => d.id === result.documentId) : undefined;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-label">{t('review.documents')}</h3>
      <ul className="grid gap-2 sm:grid-cols-3">
        {detail.documents.map((doc) => (
          <li
            key={doc.id}
            className="flex flex-col items-center gap-2 rounded-md bg-surface-sunken p-3 text-center"
          >
            <Lock aria-hidden="true" className="size-5 text-muted-foreground" />
            <span className="text-small font-semibold">{typeOf(doc)}</span>
            <span className="text-small text-muted-foreground">
              {formatFileSize(doc.sizeBytes, i18n.language)}
            </span>
            {canView && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="view" />
                <input type="hidden" name="documentId" value={doc.id} />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={loadingId === doc.id}
                  aria-busy={loadingId === doc.id}
                  aria-label={t('review.view', { type: typeOf(doc) })}
                >
                  <Eye aria-hidden="true" />
                  {t('review.viewShort')}
                </Button>
              </fetcher.Form>
            )}
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-2 text-small text-muted-foreground">
        <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {t('review.viewNote')}
      </p>
      {result && !result.ok && (
        <Alert variant="danger" role="alert">
          {tr(result.formError)}
        </Alert>
      )}
      {result?.ok && shown && (
        <div
          className="flex flex-col gap-2"
          role="region"
          aria-label={t('review.previewOf', { type: typeOf(shown) })}
        >
          {result.view.mimeType.startsWith('image/') ? (
            <img
              src={result.view.url}
              alt={t('review.previewOf', { type: typeOf(shown) })}
              referrerPolicy="no-referrer"
              className="max-h-[70vh] w-full rounded-md border border-border object-contain"
            />
          ) : (
            <a
              href={result.view.url}
              target="_blank"
              rel="noreferrer noopener"
              className={buttonVariants({ variant: 'secondary', className: 'self-start' })}
            >
              {t('review.openPdf', { type: typeOf(shown) })}
            </a>
          )}
          <span className="text-small text-muted-foreground">
            {t('review.linkExpires', {
              time: formatDateTime(result.view.expiresAt, i18n.language),
            })}
          </span>
        </div>
      )}
    </section>
  );
}

/** Lý do từ chối, ghi chú, nút Từ chối / Duyệt. */
function Decision({
  detail,
  failure,
}: {
  detail: VerificationRequestDetail;
  failure: Extract<ReviewActionResult, { intent: 'approve' | 'reject' }> | undefined;
}) {
  const { t } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const errors = failure?.fieldErrors ?? {};
  const [searchParams] = useSearchParams();
  const kind = searchParams.get('kind');

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <Form
        method="post"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          if (!window.confirm(t('review.confirmReject'))) event.preventDefault();
        }}
      >
        <input type="hidden" name="intent" value="reject" />
        {kind && <input type="hidden" name="kind" value={kind} />}
        <SelectField
          name="rejectionCode"
          label={t('review.rejectionCode')}
          defaultValue={failure?.values?.rejectionCode ?? ''}
          error={tr(errors.rejectionCode)}
        >
          <option value="">{t('review.chooseReason')}</option>
          {VerificationRejectionCode.options.map((code) => (
            <option key={code} value={code}>
              {t(`verificationRejectionCode.${code}`)}
            </option>
          ))}
        </SelectField>
        <TextAreaField
          name="rejectionNote"
          maxLength={1000}
          rows={3}
          label={t('review.rejectionNote')}
          hint={t('review.rejectionNoteHint')}
          defaultValue={failure?.values?.rejectionNote ?? ''}
          error={tr(errors.rejectionNote)}
        />
        <Button type="submit" variant="danger" disabled={busy} className="self-start">
          {t('review.reject')}
        </Button>
      </Form>
      <Form
        method="post"
        className="flex flex-col gap-2 border-t border-border pt-4"
        onSubmit={(event) => {
          if (!window.confirm(t('review.confirmApprove'))) event.preventDefault();
        }}
      >
        <input type="hidden" name="intent" value="approve" />
        {kind && <input type="hidden" name="kind" value={kind} />}
        <Button type="submit" disabled={busy} aria-busy={busy} className="self-end">
          <Check aria-hidden="true" />
          {t('review.approve')}
        </Button>
        <p className="text-small text-muted-foreground">
          {t(detail.kind === 'identity' ? 'review.outcomeIdentity' : 'review.outcomeCredential')}
        </p>
      </Form>
    </div>
  );
}
