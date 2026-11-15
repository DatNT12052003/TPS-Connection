import { ERROR_HTTP_STATUS, type ErrorCode, type ErrorMeta, type FieldError } from '@tps/shared';

/**
 * Lỗi nghiệp vụ dự kiến. Service ném AppError; error handler đổi thành response
 * `{ error: { code, message, details?, requestId } }` với HTTP status theo mã lỗi.
 * `message` là mô tả tiếng Anh cho log/lập trình viên; client hiển thị theo `code` (i18n).
 * `meta`: số liệu client cần để hiển thị, ví dụ `{ retryAfterSeconds: 30 }`, `{ attemptsLeft: 3 }`.
 */
export class AppError extends Error {
  readonly status: number;
  readonly meta?: ErrorMeta;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: FieldError[],
    options?: ErrorOptions & { meta?: ErrorMeta },
  ) {
    super(message, options);
    this.name = 'AppError';
    this.status = ERROR_HTTP_STATUS[code];
    if (options?.meta) this.meta = options.meta;
  }
}

/** 429 kèm số giây phải chờ (error handler đặt thêm header Retry-After). */
export const rateLimited = (retryAfterSeconds: number, message = 'Too many requests') =>
  new AppError('rate_limited', message, undefined, {
    meta: { retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)) },
  });

export const notFound = (what = 'Resource') => new AppError('not_found', `${what} not found`);
export const forbidden = (message = 'Forbidden') => new AppError('forbidden', message);
export const conflict = (message: string) => new AppError('conflict', message);
export const invalidStateTransition = (message: string) =>
  new AppError('invalid_state_transition', message);
