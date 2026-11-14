// Một ô tải giấy tờ (canvas Verification): tên giấy tờ, chọn ảnh (tải lên kho ngay khi chọn), hiện tên và dung
// lượng tệp đã tải, nút thay ảnh. Báo `fileId` lên component cha để gửi cùng form nộp xác minh.
import { Check, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { type DocumentPurpose, documentAccept, uploadDocument } from '~/lib/document-upload';
import type { Message } from '~/lib/form';
import { formatFileSize } from '~/lib/format';
import { useMessage } from '~/lib/use-message';
import { cn } from '~/lib/utils';

export interface UploadedDocument {
  fileId: string;
  fileName: string;
  sizeBytes: number;
}

export function DocumentSlot({
  label,
  hint,
  purpose,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint: string;
  purpose: DocumentPurpose;
  value: UploadedDocument | null;
  onChange: (document: UploadedDocument | null) => void;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<Message | null>(null);

  async function onFileChosen(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    const result = await uploadDocument(file, purpose);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    if (result.ok) {
      onChange({ fileId: result.fileId, fileName: result.fileName, sizeBytes: result.sizeBytes });
    } else {
      setError(result.message);
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border-strong p-4 text-center',
        value && 'border-solid border-success bg-success-subtle',
        error && 'border-danger',
      )}
    >
      {value ? (
        <Check aria-hidden="true" className="size-7 text-success" />
      ) : (
        <Upload aria-hidden="true" className="size-7 text-muted-foreground" />
      )}
      <span className="font-semibold">{label}</span>
      <span id={statusId} className={cn('text-small break-all', !value && 'text-muted-foreground')}>
        {value ? `${value.fileName} · ${formatFileSize(value.sizeBytes, i18n.language)}` : hint}
      </span>
      {error && (
        <span role="alert" className="text-small text-danger">
          {tr(error)}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={documentAccept(purpose)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void onFileChosen(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant={value ? 'ghost' : 'secondary'}
        disabled={disabled || uploading}
        aria-busy={uploading}
        aria-label={`${value ? t('verification.replace') : t('verification.choose')}: ${label}`}
        aria-describedby={statusId}
        onClick={() => inputRef.current?.click()}
      >
        {uploading
          ? t('verification.uploading')
          : value
            ? t('verification.replace')
            : t('verification.choose')}
      </Button>
    </div>
  );
}
