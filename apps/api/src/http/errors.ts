export type FieldError = { path: string; code: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly fields: FieldError[] = [],
    readonly headers: Record<string, string> = {},
  ) {
    super(title);
    this.name = 'ApiError';
  }
}

export const unauthorized = (code = 'UNAUTHENTICATED') =>
  new ApiError(401, code, 'Authentication required');
export const forbidden = (code = 'FORBIDDEN') => new ApiError(403, code, 'Forbidden');
export const notFound = () => new ApiError(404, 'NOT_FOUND', 'Not found');
export const tooManyRequests = (code: string, retryAfterSeconds: number) =>
  new ApiError(429, code, 'Too many requests', [], { 'Retry-After': String(retryAfterSeconds) });
