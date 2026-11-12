import type { ApiErrorBody, ErrorCode, FieldError } from '@tps/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/app-error.js';

interface ErrorResponse {
  status: number;
  code: ErrorCode;
  message: string;
  details?: FieldError[];
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

/** Đổi mọi lỗi thành dạng response thống nhất. Lỗi không lường trước KHÔNG lộ thông điệp nội bộ. */
export function toErrorResponse(err: unknown): ErrorResponse {
  if (err instanceof AppError) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
      ...(err.details && { details: err.details }),
    };
  }
  if (err instanceof ZodError) {
    return {
      status: 422,
      code: 'validation_failed',
      message: 'Validation failed',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
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
