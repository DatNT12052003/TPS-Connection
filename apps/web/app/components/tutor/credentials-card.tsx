// Bằng cấp, chứng chỉ (canvas Verification): danh sách kèm trạng thái xác minh, thêm/sửa/xóa bằng tự khai.
// Bằng đang chờ duyệt hoặc đã xác minh thì khóa (API trả 409 nếu cố sửa). Form thêm/sửa mở theo tham số
// `?credential=new|<id>` trên URL (chạy được khi chưa tải JavaScript); lưu xong action chuyển về trang không
// có tham số. Nộp ảnh để xác minh (G3) mở theo `?verify=<id>`: tải 1 đến 3 tệp rồi gửi (intent
// `credential-verify`); bằng đang chờ duyệt có nút hủy yêu cầu (intent `credential-verify-cancel`).
import { CredentialKind, MAX_CREDENTIAL_DOCUMENTS, type TutorCredential } from '@tps/shared';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Link, useNavigation } from 'react-router';
import { Alert } from '~/components/ui/alert';
import { Badge, type BadgeProps } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { SelectField, TextField } from '~/components/ui/field';
import type { Message } from '~/lib/form';
import { PATHS } from '~/lib/navigation';
import { useMessage } from '~/lib/use-message';
import { DocumentSlot, type UploadedDocument } from './document-slot';

export const CREDENTIAL_FIELDS = ['kind', 'title', 'issuer', 'issuedYear'] as const;
export type CredentialField = (typeof CREDENTIAL_FIELDS)[number];

export interface CredentialFailure {
  intent:
    'credential-save' | 'credential-delete' | 'credential-verify' | 'credential-verify-cancel';
  ok: false;
  fieldErrors: Partial<Record<CredentialField, Message>>;
  formError?: Message;
  values?: Record<CredentialField, string>;
}

const STATUS_BADGE: Record<TutorCredential['verificationStatus'], BadgeProps['variant']> = {
  self_declared: 'self',
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
};

/** Sửa/xóa được khi chưa nộp hoặc đã bị từ chối. */
const editable = (c: TutorCredential) =>
  c.verificationStatus === 'self_declared' || c.verificationStatus === 'rejected';

export function CredentialsCard({
  credentials,
  editing,
  verifying,
  failure,
}: {
  credentials: TutorCredential[];
  /** `new`, id của bằng đang sửa, hoặc null. */
  editing: string | null;
  /** Id của bằng đang nộp ảnh để xác minh, hoặc null. */
  verifying: string | null;
  failure: CredentialFailure | undefined;
}) {
  const { t } = useTranslation();
  const tr = useMessage();
  const editingCredential = credentials.find((c) => c.id === editing);

  return (
    <Card id="credentials" className="scroll-mt-24 gap-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-h2">{t('credentials.title')}</h2>
        <p className="text-small text-muted-foreground">{t('credentials.intro')}</p>
      </div>
      {failure?.formError && !failure.values && (
        <Alert variant="danger" role="alert">
          {tr(failure.formError)}
        </Alert>
      )}

      {credentials.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {credentials.map((credential) =>
            credential.id === editing && editable(credential) ? (
              <li key={credential.id} className="py-4">
                <CredentialForm credential={credential} failure={failure} />
              </li>
            ) : (
              <CredentialRow
                key={credential.id}
                credential={credential}
                verifying={credential.id === verifying && editable(credential)}
              />
            ),
          )}
        </ul>
      ) : (
        editing !== 'new' && (
          <p className="text-small text-muted-foreground">{t('credentials.empty')}</p>
        )
      )}

      {editing === 'new' ? (
        <div className="border-t border-border pt-4">
          <CredentialForm failure={failure} />
        </div>
      ) : (
        !editingCredential && (
          <Link
            to="?credential=new#credentials"
            preventScrollReset
            className={buttonVariants({ variant: 'ghost', className: 'self-start' })}
          >
            <Plus aria-hidden="true" />
            {t('credentials.add')}
          </Link>
        )
      )}
    </Card>
  );
}

function CredentialRow({
  credential,
  verifying,
}: {
  credential: TutorCredential;
  verifying: boolean;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const details = [t(`credentialKind.${credential.kind}`), credential.issuer, credential.issuedYear]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="flex flex-col gap-3 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{credential.title}</span>
          <span className="text-small text-muted-foreground">{details}</span>
          {credential.rejectionCode && (
            <span className="text-small text-danger">
              {t('verification.rejectedReason', {
                reason: t(`verificationRejectionCode.${credential.rejectionCode}`),
              })}
              {credential.rejectionNote && ` · ${credential.rejectionNote}`}
            </span>
          )}
        </div>
        <Badge variant={STATUS_BADGE[credential.verificationStatus]}>
          {t(`credentialVerificationStatus.${credential.verificationStatus}`)}
        </Badge>
        {credential.verificationStatus === 'pending' && (
          <Form
            method="post"
            preventScrollReset
            onSubmit={(event) => {
              const question = t('verification.credentialConfirmCancel', {
                title: credential.title,
              });
              if (!window.confirm(question)) event.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="credential-verify-cancel" />
            <input type="hidden" name="credentialId" value={credential.id} />
            <Button type="submit" variant="ghost" disabled={busy}>
              {t('verification.credentialCancel')}
            </Button>
          </Form>
        )}
        {editable(credential) && (
          <div className="flex gap-1">
            {!verifying && (
              <Link
                to={`?verify=${credential.id}#credentials`}
                preventScrollReset
                className={buttonVariants({ variant: 'secondary' })}
              >
                <ShieldCheck aria-hidden="true" />
                {t('verification.credentialSubmit')}
              </Link>
            )}
            <Link
              to={`?credential=${credential.id}#credentials`}
              preventScrollReset
              aria-label={t('credentials.editNamed', { title: credential.title })}
              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
            >
              <Pencil aria-hidden="true" />
            </Link>
            <Form
              method="post"
              preventScrollReset
              onSubmit={(event) => {
                if (!window.confirm(t('credentials.confirmDelete', { title: credential.title }))) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="credential-delete" />
              <input type="hidden" name="credentialId" value={credential.id} />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                aria-label={t('credentials.deleteNamed', { title: credential.title })}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </Form>
          </div>
        )}
      </div>
      {verifying && <CredentialVerifyForm credential={credential} />}
    </li>
  );
}

/** Tải 1 đến 3 tệp (ảnh hoặc PDF) của một bằng cấp rồi gửi xác minh. */
function CredentialVerifyForm({ credential }: { credential: TutorCredential }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const [pages, setPages] = useState<(UploadedDocument | null)[]>([null]);
  const fileIds = pages.flatMap((page) => (page ? [page.fileId] : []));

  return (
    <Form
      method="post"
      preventScrollReset
      className="flex flex-col gap-3 rounded-md bg-surface-sunken p-4"
    >
      <input type="hidden" name="intent" value="credential-verify" />
      <input type="hidden" name="credentialId" value={credential.id} />
      <input type="hidden" name="fileIds" value={JSON.stringify(fileIds)} />
      <p className="text-small">
        {t('verification.credentialFilesLabel', { max: MAX_CREDENTIAL_DOCUMENTS })}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {pages.map((page, index) => (
          <DocumentSlot
            key={index}
            label={t('verification.credentialPage', { n: index + 1 })}
            hint={t('verification.documentHint')}
            purpose="credential"
            value={page}
            onChange={(doc) =>
              setPages((current) => current.map((p, i) => (i === index ? doc : p)))
            }
            disabled={submitting}
          />
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        {pages.length < MAX_CREDENTIAL_DOCUMENTS ? (
          <Button type="button" variant="ghost" onClick={() => setPages((p) => [...p, null])}>
            <Plus aria-hidden="true" />
            {t('verification.addPage')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            to={`${PATHS.tutorProfile}#credentials`}
            preventScrollReset
            className={buttonVariants({ variant: 'secondary' })}
          >
            {t('common.cancel')}
          </Link>
          <Button
            type="submit"
            disabled={fileIds.length === 0 || submitting}
            aria-busy={submitting}
          >
            {t('verification.credentialSend')}
          </Button>
        </div>
      </div>
    </Form>
  );
}

function CredentialForm({
  credential,
  failure,
}: {
  credential?: TutorCredential;
  failure: CredentialFailure | undefined;
}) {
  const { t } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const failed = failure?.intent === 'credential-save' ? failure : undefined;
  const values = failed?.values ?? {
    kind: credential?.kind ?? 'degree',
    title: credential?.title ?? '',
    issuer: credential?.issuer ?? '',
    issuedYear: credential?.issuedYear === null ? '' : String(credential?.issuedYear ?? ''),
  };
  const errors = failed?.fieldErrors ?? {};

  return (
    <Form method="post" noValidate preventScrollReset className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="credential-save" />
      {credential && <input type="hidden" name="credentialId" value={credential.id} />}
      <h3 className="text-body-strong">
        {credential ? t('credentials.editTitle') : t('credentials.addTitle')}
      </h3>
      {failed?.formError && (
        <Alert variant="danger" role="alert">
          {tr(failed.formError)}
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField
          name="kind"
          label={t('credentials.kind')}
          defaultValue={values.kind}
          error={tr(errors.kind)}
        >
          {CredentialKind.options.map((kind) => (
            <option key={kind} value={kind}>
              {t(`credentialKind.${kind}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          name="title"
          required
          maxLength={200}
          label={t('credentials.name')}
          placeholder={t('credentials.namePlaceholder')}
          defaultValue={values.title}
          error={tr(errors.title)}
        />
        <TextField
          name="issuer"
          maxLength={200}
          label={t('credentials.issuer')}
          placeholder={t('credentials.issuerPlaceholder')}
          defaultValue={values.issuer}
          error={tr(errors.issuer)}
        />
        <TextField
          name="issuedYear"
          inputMode="numeric"
          maxLength={4}
          label={t('credentials.issuedYear')}
          placeholder={String(new Date().getFullYear())}
          defaultValue={values.issuedYear}
          error={tr(errors.issuedYear)}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          to={`${PATHS.tutorProfile}#credentials`}
          preventScrollReset
          className={buttonVariants({ variant: 'secondary' })}
        >
          {t('common.cancel')}
        </Link>
        <Button type="submit" disabled={submitting} aria-busy={submitting}>
          {t('credentials.save')}
        </Button>
      </div>
    </Form>
  );
}
