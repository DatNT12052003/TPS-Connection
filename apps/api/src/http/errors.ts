export type FieldError = { path: string; code: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly fields: FieldError[] = [],
  ) {
    super(title);
    this.name = 'ApiError';
  }
}

export const unauthorized = () => new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
export const forbidden = (code = 'FORBIDDEN') => new ApiError(403, code, 'Forbidden');
export const notFound = () => new ApiError(404, 'NOT_FOUND', 'Not found');
