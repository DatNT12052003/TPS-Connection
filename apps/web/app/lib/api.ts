// Gọi API. Mọi lời gọi API của web đi qua đây (loader trên server và TanStack Query trên trình duyệt),
// không gọi fetch rải rác trong component.
import { ApiErrorBody, type ErrorCode, type ErrorMeta, type FieldError } from '@tps/shared';
import type { z } from 'zod';

export const DEFAULT_API_URL = 'http://127.0.0.1:3000';

/**
 * Lỗi từ API (hoặc không gọi được API). `code` dùng để hiển thị thông điệp i18n `errors.<code>`;
 * `details` là lỗi theo từng ô (`details[].code` là khóa `validation.*`); `meta` là số liệu kèm theo
 * (ví dụ `attemptsLeft`, `retryAfterSeconds`).
 */
export class ApiError extends Error {
  readonly details: FieldError[];
  readonly meta: ErrorMeta;

  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly requestId?: string,
    extra: { details?: FieldError[] | undefined; meta?: ErrorMeta | undefined } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.details = extra.details ?? [];
    this.meta = extra.meta ?? {};
  }
}

/** ApiError từ một response lỗi của API (thân lỗi thống nhất); thân lạ thì `internal_error`. */
export function apiErrorFromBody(status: number, body: unknown): ApiError {
  const parsed = ApiErrorBody.safeParse(body);
  if (!parsed.success) {
    return new ApiError('internal_error', status, `Unexpected ${status} response`);
  }
  const { code, message, requestId, details, meta } = parsed.data.error;
  return new ApiError(code, status, message, requestId, { details, meta });
}

/** Server (SSR, loader) dùng API_URL; trình duyệt dùng VITE_API_URL. */
export function apiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.API_URL ?? DEFAULT_API_URL;
  }
  return import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;
}

interface GetOptions {
  signal?: AbortSignal;
  /** HTTP status ngoài 2xx vẫn coi là dữ liệu hợp lệ (ví dụ 503 của /health/ready). */
  acceptStatuses?: number[];
  baseUrl?: string;
}

/** GET và kiểm tra response bằng schema Zod; sai dạng thì ném ApiError thay vì trả dữ liệu hỏng. */
export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
  { signal, acceptStatuses = [], baseUrl = apiBaseUrl() }: GetOptions = {},
): Promise<z.infer<S>> {
  let response: Response;
  try {
    response = await fetch(new URL(path, baseUrl), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal: signal ?? null,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError('service_unavailable', 0, `Cannot reach API at ${baseUrl}`);
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok && !acceptStatuses.includes(response.status)) {
    throw apiErrorFromBody(response.status, body);
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError('internal_error', response.status, `Unexpected response shape from ${path}`);
  }
  return result.data;
}
