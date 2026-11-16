// Action của trang lớp học và buổi học (G6): mỗi form gửi một `intent`; lỗi nghiệp vụ (4xx) thành lỗi theo ô hoặc
// lỗi chung để trang hiện lại form với giá trị đã nhập; lỗi hệ thống thì ném ra (trang lỗi).
import { ApiError } from './api';
import { fieldErrorsFrom, formErrorFrom, formText, type Message } from './form';

export interface IntentFailure {
  intent: string;
  ok: false;
  fieldErrors: Partial<Record<string, Message>>;
  formError?: Message;
  values: Record<string, string>;
}

export interface IntentSuccess {
  intent: string;
  ok: true;
}

export type IntentResult = IntentFailure | IntentSuccess;

/** Mọi trường chữ của form (để hiện lại khi lỗi). */
export function formValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string' && key !== 'intent') values[key] = value;
  }
  return values;
}

/**
 * Chạy `send`; lỗi 4xx của API thành `IntentFailure`: lỗi theo các ô `fields` (đổi tên đường dẫn của API sang tên ô
 * bằng `rename`), không có ô nào khớp thì thành lỗi chung.
 */
export async function runIntent(
  intent: string,
  form: FormData,
  fields: readonly string[],
  send: () => Promise<unknown>,
  rename: Record<string, string> = {},
): Promise<IntentResult> {
  try {
    await send();
    return { intent, ok: true };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    const renamed = new ApiError(error.code, error.status, error.message, error.requestId, {
      details: error.details.map((d) => ({ ...d, path: rename[d.path] ?? d.path })),
      meta: error.meta,
    });
    const fieldErrors = fieldErrorsFrom(renamed, fields);
    const hasFieldError = Object.keys(fieldErrors).length > 0;
    return {
      intent,
      ok: false,
      fieldErrors,
      ...(!hasFieldError && { formError: formErrorFrom(error) }),
      values: formValues(form),
    };
  }
}

/** Số nguyên từ chữ người dùng gõ ("250.000" → 250000); trống thì null. */
export function integerFrom(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/** Số thập phân từ chữ ("8,5" → 8.5); trống thì null; sai dạng thì NaN (API trả lỗi đúng ô). */
export function decimalFrom(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  return Number(trimmed);
}

export const textOf = formText;
