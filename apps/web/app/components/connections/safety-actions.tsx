// Chặn và báo cáo một người (G5, §13), dùng ở trang yêu cầu kết nối và cuộc trò chuyện. Hai form gửi tới action của
// trang: intent `block` (kèm `blockTarget`: tutorId hoặc conversationId), intent `report` (kèm `reportTarget` JSON
// đúng dạng API, lý do, mô tả). Chặn hỏi lại trước khi gửi vì sẽ hủy yêu cầu đang mở giữa hai người.
import { ReportReason, SAFETY_LIMITS } from '@tps/shared';
import { Ban, Flag } from 'lucide-react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Form } from 'react-router';
import { Alert } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { SelectField, TextAreaField } from '~/components/ui/field';
import type { Message } from '~/lib/form';
import { useMessage } from '~/lib/use-message';

/** Kết quả của intent `block` / `report` để hiện thông báo trong thẻ. */
export type SafetyResult =
  | { intent: 'block' | 'report'; ok: true }
  | { intent: 'block' | 'report'; ok: false; formError: Message };

/** Lý do báo cáo và mô tả: phần chung của form báo cáo người và báo cáo tin nhắn. */
export function ReportFields() {
  const { t } = useTranslation();
  return (
    <>
      <SelectField name="reasonCode" label={t('safety.reason')} defaultValue="harassment">
        {ReportReason.options.map((r) => (
          <option key={r} value={r}>
            {t(`reportReason.${r}`)}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        name="description"
        label={t('safety.description')}
        hint={t('safety.descriptionHint')}
        maxLength={SAFETY_LIMITS.reportDescriptionLength}
        rows={3}
      />
    </>
  );
}

export function SafetyActions({
  name,
  blockTarget,
  reportTarget,
  result,
  busy,
}: {
  /** Tên hiển thị của người bị chặn / báo cáo. */
  name: string;
  /** `{ tutorId }` hoặc `{ conversationId }`; null nếu chưa chặn được (gia sư chưa có hội thoại với phụ huynh). */
  blockTarget: { tutorId: string } | { conversationId: string } | null;
  /** Thân báo cáo người theo API (`targetType` …), không gồm lý do và mô tả. */
  reportTarget: Record<string, string> | null;
  result?: SafetyResult | undefined;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const tr = useMessage();
  if (!blockTarget && !reportTarget) return null;
  const confirmBlock = (event: FormEvent) => {
    if (!window.confirm(t('safety.confirmBlock', { name }))) event.preventDefault();
  };

  return (
    <div className="flex flex-col gap-3">
      {result?.ok === true && (
        <Alert variant="success">
          {result.intent === 'block' ? t('safety.blocked', { name }) : t('safety.reported')}
        </Alert>
      )}
      {result?.ok === false && <Alert variant="danger">{tr(result.formError)}</Alert>}
      {reportTarget && (
        <details className="group">
          <summary className="inline-flex cursor-pointer items-center gap-2 font-semibold text-primary">
            <Flag aria-hidden="true" className="size-4" />
            {t('safety.reportUser', { name })}
          </summary>
          <Form method="post" className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="intent" value="report" />
            <input type="hidden" name="reportTarget" value={JSON.stringify(reportTarget)} />
            <ReportFields />
            <div>
              <Button type="submit" variant="secondary" disabled={busy}>
                {t('safety.sendReport')}
              </Button>
            </div>
          </Form>
        </details>
      )}
      {blockTarget && (
        <Form method="post" onSubmit={confirmBlock}>
          <input type="hidden" name="intent" value="block" />
          <input type="hidden" name="blockTarget" value={JSON.stringify(blockTarget)} />
          <Button type="submit" variant="ghost" disabled={busy} className="px-0 text-danger">
            <Ban aria-hidden="true" />
            {t('safety.block', { name })}
          </Button>
        </Form>
      )}
    </div>
  );
}
