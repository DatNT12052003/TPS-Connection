// "Gửi lại mã": khóa trong thời gian chờ (45 giây, D54) và đếm ngược. Là nút submit với intent=resend
// trong form nhập mã; `formNoValidate` vì gửi lại mã không cần đã nhập mã.
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { useCountdown } from '~/lib/use-countdown';

export function ResendButton({
  seconds,
  resetKey,
  disabled,
}: {
  /** Số giây còn phải chờ. */
  seconds: number;
  /** Đổi giá trị này (ví dụ kết quả action mới) để bắt đầu đếm lại. */
  resetKey?: unknown;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const left = useCountdown(seconds, resetKey);
  const waiting = left > 0;
  return (
    <Button
      type="submit"
      name="intent"
      value="resend"
      variant="secondary"
      block
      formNoValidate
      disabled={disabled || waiting}
      aria-live="polite"
    >
      {waiting ? t('verifyEmail.resendIn', { seconds: left }) : t('verifyEmail.resend')}
    </Button>
  );
}
