// Mã lỗi và định dạng lỗi thống nhất của API. Client hiển thị thông điệp theo `errors.<code>` trong i18n,
// không hiển thị `message` (chỉ là mô tả tiếng Anh cho log và lập trình viên).
import { z } from 'zod';

export const ErrorCode = z.enum([
  'bad_request',
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'invalid_state_transition',
  'rate_limited',
  // Tài khoản và xác thực (G2)
  'invalid_credentials',
  'account_locked',
  'email_not_verified',
  'email_taken',
  'invalid_code',
  'code_expired',
  'code_attempts_exceeded',
  'internal_error',
  'service_unavailable',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** HTTP status tương ứng với từng mã lỗi. */
export const ERROR_HTTP_STATUS = {
  bad_request: 400,
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid_state_transition: 409,
  rate_limited: 429,
  invalid_credentials: 401,
  account_locked: 403,
  email_not_verified: 403,
  email_taken: 409,
  invalid_code: 400,
  code_expired: 400,
  code_attempts_exceeded: 400,
  internal_error: 500,
  service_unavailable: 503,
} as const satisfies Record<ErrorCode, number>;

/** Một lỗi ở một trường dữ liệu (lỗi validation). `path` dạng `email`, `items.0.price`. */
export const FieldError = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof FieldError>;

/**
 * Thông tin kèm theo một số lỗi để client hiển thị, ví dụ `retryAfterSeconds` (rate_limited),
 * `attemptsLeft` (invalid_code).
 */
export const ErrorMeta = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));
export type ErrorMeta = z.infer<typeof ErrorMeta>;

/**
 * Thân response khi lỗi, ví dụ:
 * `{ "error": { "code": "not_found", "message": "Lesson not found", "requestId": "..." } }`
 */
export const ApiErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.array(FieldError).optional(),
    meta: ErrorMeta.optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
