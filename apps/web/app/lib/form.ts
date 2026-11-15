// Kết quả action của form và cách đổi lỗi API thành thông điệp i18n.
// Lỗi theo ô: `details[].code` của API là khóa `validation.*` (lỗi đầu tiên của mỗi ô).
import { type ErrorCode, isValidationCode } from '@tps/shared';
import type { ParseKeys } from 'i18next';
import { ApiError } from './api';

/** Một thông điệp i18n kèm tham số (ví dụ số lần thử còn lại). */
export interface Message {
  key: ParseKeys;
  values?: Record<string, string | number>;
}

/** Kết quả action khi form chưa thành công: lỗi theo ô, lỗi chung, giá trị đã nhập (trừ mật khẩu). */
export interface FormFailure<F extends string = string> {
  ok: false;
  fieldErrors: Partial<Record<F, Message>>;
  formError?: Message;
  values?: Partial<Record<F, string>>;
}

export const errorMessage = (code: ErrorCode): Message => ({ key: `errors.${code}` });

/** Lỗi theo ô từ ApiError: lỗi đầu tiên của mỗi ô có trong `fields`. */
export function fieldErrorsFrom<F extends string>(
  error: ApiError,
  fields: readonly F[],
): Partial<Record<F, Message>> {
  const result: Partial<Record<F, Message>> = {};
  for (const detail of error.details) {
    const path = detail.path as F;
    if (!fields.includes(path) || result[path]) continue;
    const code = isValidationCode(detail.code) ? detail.code : 'invalid';
    result[path] = { key: `validation.${code}` };
  }
  return result;
}

/** Thông điệp chung cho một lỗi API; quá giới hạn thì nói rõ số phút phải chờ. */
export function formErrorFrom(error: unknown): Message {
  if (!(error instanceof ApiError)) return errorMessage('internal_error');
  const retryAfter = error.meta.retryAfterSeconds;
  if (error.code === 'rate_limited' && typeof retryAfter === 'number') {
    return {
      key: 'auth.retryAfterMinutes',
      values: { minutes: Math.max(1, Math.ceil(retryAfter / 60)) },
    };
  }
  return errorMessage(error.code);
}

/** Chuỗi của một trường form (thiếu thì chuỗi rỗng; tệp thì bỏ qua). */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
