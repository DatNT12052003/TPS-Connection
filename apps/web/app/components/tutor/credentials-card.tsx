// Bằng cấp, chứng chỉ (canvas Verification): danh sách kèm trạng thái xác minh, thêm/sửa/xóa bằng tự khai.
// Bằng đang chờ duyệt hoặc đã xác minh thì khóa (API trả 409 nếu cố sửa). Form thêm/sửa mở theo tham số
// `?credential=new|<id>` trên URL (chạy được khi chưa tải JavaScript); lưu xong action chuyển về trang không
// có tham số. Nộp ảnh bằng cấp để xác minh làm ở G3.
import { CredentialKind, type TutorCredential } from '@tps/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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

export const CREDENTIAL_FIELDS = ['kind', 'title', 'issuer', 'issuedYear'] as const;
export type CredentialField = (typeof CREDENTIAL_FIELDS)[number];

export interface CredentialFailure {
  intent: 'credential-save' | 'credential-delete';
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
  failure,
}: {
  credentials: TutorCredential[];
  /** `new`, id của bằng đang sửa, hoặc null. */
  editing: string | null;
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
              <CredentialRow key={credential.id} credential={credential} />
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

function CredentialRow({ credential }: { credential: TutorCredential }) {
  const { t } = useTranslation();
  const details = [t(`credentialKind.${credential.kind}`), credential.issuer, credential.issuedYear]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{credential.title}</span>
        <span className="text-small text-muted-foreground">{details}</span>
      </div>
      <Badge variant={STATUS_BADGE[credential.verificationStatus]}>
        {t(`credentialVerificationStatus.${credential.verificationStatus}`)}
      </Badge>
      {editable(credential) && (
        <div className="flex gap-1">
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
    </li>
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
