import type { Locale } from '../schemas/common.js';
import { en } from './en.js';
import type { Messages } from './types.js';
import { vi } from './vi.js';

export type { EnumLabels, Messages } from './types.js';
export { en, vi };

/** Tài nguyên cho i18next: `i18next.init({ resources: { vi: { translation: messages.vi }, ... } })`. */
export const messages: Record<Locale, Messages> = { vi, en };

/**
 * Mã lỗi của một ô dữ liệu (`details[].code` trong lỗi API): khóa của `validation.*`, web hiển thị bằng
 * `t('validation.<code>')`. `invalid` là mã dự phòng khi không có mã cụ thể hơn.
 */
export type ValidationCode = keyof (typeof vi)['validation'];

export const isValidationCode = (value: string): value is ValidationCode =>
  Object.hasOwn(vi.validation, value);
