// Ảnh đại diện trong Cài đặt: ảnh hiện tại (hoặc chữ cái đầu), nút đổi ảnh (chọn tệp rồi tải lên ngay) và
// nút bỏ ảnh (form POST, intent `avatar-remove`). Tải lên xong thì tải lại dữ liệu trang để hiện ảnh mới.
import { FILE_RULES } from '@tps/shared';
import { ImageUp, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, useRevalidator } from 'react-router';
import { Alert } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { uploadAvatar } from '~/lib/avatar-upload';
import type { Message } from '~/lib/form';
import { useMessage } from '~/lib/use-message';
import { cn } from '~/lib/utils';

interface AvatarFieldProps {
  avatarUrl: string | null;
  displayName: string;
  /** Bỏ ảnh đang gửi (để khóa nút). */
  removing?: boolean;
  /**
   * Có nút "Bỏ ảnh" (một form riêng, intent `avatar-remove`). Tắt khi AvatarField nằm trong một form khác
   * (form không lồng được), ví dụ trang sửa hồ sơ gia sư.
   */
  canRemove?: boolean;
}

export function AvatarImage({
  avatarUrl,
  displayName,
  className,
}: {
  avatarUrl: string | null;
  displayName: string;
  className?: string;
}) {
  const base = cn(
    'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-subtle font-semibold text-primary-subtle-foreground',
    className,
  );
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={cn(base, 'object-cover')} />;
  }
  return (
    <span aria-hidden="true" className={base}>
      {displayName.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function AvatarField({
  avatarUrl,
  displayName,
  removing = false,
  canRemove = true,
}: AvatarFieldProps) {
  const { t } = useTranslation();
  const tr = useMessage();
  const revalidator = useRevalidator();
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: true } | { ok: false; message: Message } | null>(null);

  async function onFileChosen(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setResult(null);
    const outcome = await uploadAvatar(file);
    setUploading(false);
    // Cho phép chọn lại đúng tệp đó (ví dụ sau khi sửa lỗi mạng).
    if (inputRef.current) inputRef.current.value = '';
    if (outcome.ok) {
      setResult({ ok: true });
      await revalidator.revalidate();
    } else {
      setResult(outcome);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 sm:gap-5">
        <AvatarImage
          avatarUrl={avatarUrl}
          displayName={displayName}
          className="size-18 text-h2 sm:size-22"
        />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={FILE_RULES.avatar.mimeTypes.join(',')}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void onFileChosen(event.target.files?.[0])}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={uploading}
              aria-busy={uploading}
              aria-describedby={hintId}
              onClick={() => inputRef.current?.click()}
            >
              <ImageUp aria-hidden="true" />
              {uploading ? t('account.avatarUploading') : t('account.avatarChange')}
            </Button>
            {avatarUrl && canRemove && (
              <Form method="post" preventScrollReset>
                <input type="hidden" name="intent" value="avatar-remove" />
                <Button type="submit" variant="ghost" disabled={removing || uploading}>
                  <Trash2 aria-hidden="true" />
                  {t('account.avatarRemove')}
                </Button>
              </Form>
            )}
          </div>
          <span id={hintId} className="text-small text-muted-foreground">
            {t('account.avatarHint')}
          </span>
        </div>
      </div>
      {result?.ok && (
        <Alert variant="success" role="status">
          {t('account.avatarSaved')}
        </Alert>
      )}
      {result && !result.ok && (
        <Alert variant="danger" role="alert">
          {tr(result.message)}
        </Alert>
      )}
    </div>
  );
}
