// Ô nhập mã OTP 6 số (D54). Canvas vẽ 6 ô riêng; ở đây dùng MỘT ô chữ lớn, giãn chữ: dán cả mã một lần,
// điện thoại tự gợi ý mã từ email/SMS (autocomplete="one-time-code"), trình đọc màn hình đọc là một ô.
import { OTP_RULES } from '@tps/shared';
import { TextField, type TextFieldProps } from '~/components/ui/field';

type CodeFieldProps = Omit<TextFieldProps, 'name' | 'type' | 'inputMode'>;

export function CodeField(props: CodeFieldProps) {
  return (
    <TextField
      name="code"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern={`\\d{${OTP_RULES.length}}`}
      maxLength={OTP_RULES.length}
      required
      inputClassName="min-h-14 text-center text-h2 font-bold tracking-widest tabular-nums"
      {...props}
    />
  );
}
