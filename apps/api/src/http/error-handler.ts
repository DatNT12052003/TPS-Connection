import {
  type ApiErrorBody,
  type ErrorCode,
  type ErrorMeta,
  type FieldError,
  isValidationCode,
  messages,
  type ValidationCode,
} from '@tps/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/app-error.js';

interface ErrorResponse {
  status: number;
  code: ErrorCode;
  message: string;
  details?: FieldError[];
  meta?: ErrorMeta;
}

/** Lỗi từ body-parser / http-errors của Express (JSON sai cú pháp, body quá lớn…). */
const isClientHttpError = (err: unknown): err is { status: number; message: string } =>
  typeof err === 'object' &&
  err !== null &&
  'status' in err &&
  typeof err.status === 'number' &&
  err.status >= 400 &&
  err.status < 500 &&
  'expose' in err &&
  err.expose === true;

/** Mã không có trong `validation.*` (lỗi lập trình, hoặc thông điệp mặc định của Zod) quy về `invalid`. */
const toValidationCode = (code: string): ValidationCode =>
  isValidationCode(code) ? code : 'invalid';

/**
 * Một lỗi của Zod thành lỗi một ô. Schema đặt mã riêng (`{ error: 'too_long' }`) thì Zod để mã đó ở
 * `message`; thiếu trường bắt buộc thì Zod báo `invalid_type` "received undefined" -> `required`; còn lại
 * (sai kiểu, sai giá trị enum…) -> `invalid`. `message` trả về là bản tiếng Anh của mã.
 */
function zodIssueToFieldError(issue: ZodError['issues'][number]): FieldError {
  let code: ValidationCode;
  if (isValidationCode(issue.message)) code = issue.message;
  else if (issue.code === 'invalid_type' && issue.message.endsWith('received undefined')) {
    code = 'required';
  } else code = 'invalid';
  return {
    path: issue.path.join('.'),
    code,
    message: code === 'invalid' ? issue.message : messages.en.validation[code],
  };
}

/** Đổi mọi lỗi thành dạng response thống nhất. Lỗi không lường trước KHÔNG lộ thông điệp nội bộ. */
export function toErrorResponse(err: unknown): ErrorResponse {
  if (err instanceof AppError) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
      ...(err.details && {
        details: err.details.map((d) => ({ ...d, code: toValidationCode(d.code) })),
      }),
      ...(err.meta && { meta: err.meta }),
    };
  }
  if (err instanceof ZodError) {
    return {
      status: 422,
      code: 'validation_failed',
      message: 'Validation failed',
      details: err.issues.map(zodIssueToFieldError),
    };
  }
  if (isClientHttpError(err)) {
    return { status: 400, code: 'bad_request', message: err.message };
  }
  return { status: 500, code: 'internal_error', message: 'Internal server error' };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const { status, ...error } = toErrorResponse(err);
  if (typeof error.meta?.retryAfterSeconds === 'number') {
    res.setHeader('Retry-After', String(error.meta.retryAfterSeconds));
  }
  if (status >= 500) {
    req.log.error({ err }, 'Unhandled error');
  } else {
    req.log.debug({ err }, error.message);
  }
  // req.id do request-logger đặt, luôn là chuỗi.
  const requestId = typeof req.id === 'string' ? req.id : undefined;
  const body: ApiErrorBody = { error: { ...error, ...(requestId && { requestId }) } };
  res.status(status).json(body);
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('not_found', `Route ${req.method} ${req.path} not found`));
};
