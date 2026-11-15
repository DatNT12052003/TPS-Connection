// Bước 2 · Giấy tờ danh tính (canvas Verification; C4, B.4.1).
//   - Đã xác minh: ngày xác minh.
//   - Đang chờ duyệt: hạn duyệt, giấy tờ đã nộp, nút hủy yêu cầu (intent `identity-cancel`).
//   - Chưa nộp / bị từ chối / đã hủy: lý do từ chối (nếu có), ô tải từng giấy tờ bắt buộc theo nghề nghiệp,
//     ô đồng ý, nút nộp (intent `identity-submit`, gửi `documents` dạng JSON).
// Hồ sơ chưa đủ trường bắt buộc (bước 1) thì chỉ nhắc điền trước.
import type { OwnIdentityVerification } from '@tps/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, useNavigation } from 'react-router';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { CheckboxField } from '~/components/ui/field';
import type { Message } from '~/lib/form';
import { formatDate, formatFileSize } from '~/lib/format';
import { useMessage } from '~/lib/use-message';
import { cn } from '~/lib/utils';
import { DocumentSlot, type UploadedDocument } from './document-slot';

export interface IdentityFailure {
  intent: 'identity-submit' | 'identity-cancel';
  ok: false;
  formError: Message;
}

type RequiredType = OwnIdentityVerification['requiredDocuments'][number];

export function IdentityVerificationCard({
  verification,
  identityVerifiedAt,
  filled,
  failure,
}: {
  verification: OwnIdentityVerification;
  identityVerifiedAt: string | null;
  /** Bước 1 đã đủ trường bắt buộc. */
  filled: boolean;
  failure: IdentityFailure | undefined;
}) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const { latest } = verification;
  const pending = latest?.status === 'pending';
  const active = !identityVerifiedAt && !pending && filled;

  return (
    <Card
      id="identity"
      className={cn('scroll-mt-24 gap-4 sm:p-6', active && 'border-primary ring-1 ring-primary')}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-h2">{t('tutorProfile.step2Title')}</h2>
        {!identityVerifiedAt && !pending && (
          <p className="text-small text-muted-foreground">{t('verification.identityIntro')}</p>
        )}
      </div>

      {failure && (
        <Alert variant="danger" role="alert">
          {tr(failure.formError)}
        </Alert>
      )}

      {identityVerifiedAt ? (
        <Alert variant="success">
          {t('tutorProfile.identityVerifiedOn', {
            date: formatDate(identityVerifiedAt, i18n.language),
          })}
        </Alert>
      ) : pending && latest ? (
        <PendingIdentity request={latest} />
      ) : (
        <>
          {latest?.status === 'rejected' && latest.rejectionCode && (
            <Alert variant="warning" role="status">
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{t('verification.rejectedTitle')}</span>
                <span>
                  {t('verification.rejectedReason', {
                    reason: t(`verificationRejectionCode.${latest.rejectionCode}`),
                  })}
                </span>
                {latest.rejectionNote && <span>{latest.rejectionNote}</span>}
                <span>{t('verification.resubmitHint')}</span>
              </span>
            </Alert>
          )}
          {filled ? (
            <SubmitIdentityForm required={verification.requiredDocuments} />
          ) : (
            <Alert variant="info">{t('verification.fillFirst')}</Alert>
          )}
        </>
      )}
    </Card>
  );
}

function PendingIdentity({ request }: { request: NonNullable<OwnIdentityVerification['latest']> }) {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST';

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="info" role="status">
        {t('verification.pendingDue', { date: formatDate(request.reviewDueAt, i18n.language) })}
      </Alert>
      <div className="flex flex-col gap-2">
        <h3 className="text-label">{t('verification.submittedDocs')}</h3>
        <ul className="flex flex-col divide-y divide-border">
          {request.documents.map((doc) => (
            <li key={doc.type} className="flex flex-wrap items-center gap-2 py-2 text-small">
              <span className="flex-1 font-semibold">
                {t(`verificationDocumentType.${doc.type}`)}
              </span>
              <span className="text-muted-foreground">
                {[doc.fileName, formatFileSize(doc.sizeBytes, i18n.language)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Form
        method="post"
        preventScrollReset
        className="self-start"
        onSubmit={(event) => {
          if (!window.confirm(t('verification.confirmCancel'))) event.preventDefault();
        }}
      >
        <input type="hidden" name="intent" value="identity-cancel" />
        <Button type="submit" variant="secondary" disabled={busy}>
          {t('verification.cancel')}
        </Button>
      </Form>
    </div>
  );
}

function SubmitIdentityForm({ required }: { required: RequiredType[] }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const [documents, setDocuments] = useState<Partial<Record<RequiredType, UploadedDocument>>>({});
  const [consent, setConsent] = useState(false);

  const missing = [
    ...required
      .filter((type) => !documents[type])
      .map((type) => t(`verificationDocumentType.${type}`)),
    ...(consent ? [] : [t('verification.missingConsent')]),
  ];
  const payload = required.flatMap((type) => {
    const doc = documents[type];
    return doc ? [{ type, fileId: doc.fileId }] : [];
  });

  return (
    <Form method="post" preventScrollReset className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="identity-submit" />
      <input type="hidden" name="documents" value={JSON.stringify(payload)} />
      <div className="grid gap-4 sm:grid-cols-3">
        {required.map((type) => (
          <DocumentSlot
            key={type}
            label={t(`verificationDocumentType.${type}`)}
            hint={
              type === 'student_card'
                ? t('verification.studentCardHint')
                : t('verification.documentHint')
            }
            purpose="verification_document"
            value={documents[type] ?? null}
            onChange={(doc) =>
              setDocuments((current) => ({ ...current, [type]: doc ?? undefined }))
            }
            disabled={submitting}
          />
        ))}
      </div>
      <CheckboxField
        name="acceptDocumentProcessing"
        value="true"
        checked={consent}
        onChange={(event) => setConsent(event.target.checked)}
      >
        {t('verification.consent')}
      </CheckboxField>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-small text-muted-foreground" aria-live="polite">
          {missing.length > 0 ? (
            t('verification.missing', { items: missing.join(', ') })
          ) : (
            <Badge variant="success">{t('verification.ready')}</Badge>
          )}
        </span>
        <Button type="submit" disabled={missing.length > 0 || submitting} aria-busy={submitting}>
          {t('verification.submit')}
        </Button>
      </div>
    </Form>
  );
}
