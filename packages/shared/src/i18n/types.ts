import type { z } from 'zod';
import type { ErrorCode } from '../errors.js';
import type { LABELLED_ENUMS } from '../statuses.js';
import type { vi } from './vi.js';

/** Mỗi enum trong LABELLED_ENUMS phải có nhãn cho đủ mọi giá trị; mỗi mã lỗi phải có thông điệp. */
export type EnumLabels = {
  [K in keyof typeof LABELLED_ENUMS]: Record<z.infer<(typeof LABELLED_ENUMS)[K]>, string>;
} & { errors: Record<ErrorCode, string> };

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Bộ chuỗi của một ngôn ngữ: đúng bộ khóa của bản tiếng Việt (thiếu hay thừa khóa đều lỗi khi type-check). */
export type Messages = Widen<typeof vi>;
