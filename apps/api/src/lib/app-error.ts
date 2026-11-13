import { ERROR_HTTP_STATUS, type ErrorCode, type FieldError } from '@tps/shared';

/**
 * Lỗi nghiệp vụ dự kiến. Service ném AppError; error handler đổi thành response
 * `{ error: { code, message, details?, requestId } }` với HTTP status theo mã lỗi.
 * `message` là mô tả tiếng Anh cho log/lập trình viên; client hiển thị theo `code` (i18n).
 */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: FieldError[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
    this.status = ERROR_HTTP_STATUS[code];
  }
}

export const notFound = (what = 'Resource') => new AppError('not_found', `${what} not found`);
export const forbidden = (message = 'Forbidden') => new AppError('forbidden', message);
export const conflict = (message: string) => new AppError('conflict', message);
export const invalidStateTransition = (message: string) =>
  new AppError('invalid_state_transition', message);
