// Gọi API tìm kiếm marketplace cho loader. Bộ lọc nằm trong đường dẫn (người dùng sửa tay hoặc liên kết cũ): giá trị
// sai thì API trả 422, trang hiện kết quả rỗng kèm thông báo thay vì trang lỗi.
import type { z } from 'zod';
import { ApiError } from './api';
import type { ServerApi } from './server-api.server';

export interface SearchOutcome<T> {
  result: T;
  /** Bộ lọc trong đường dẫn không hợp lệ (API trả 422). */
  invalidFilters: boolean;
}

export async function searchOrEmpty<S extends z.ZodType>(
  api: ServerApi,
  path: string,
  query: URLSearchParams,
  schema: S,
  empty: z.infer<S>,
): Promise<SearchOutcome<z.infer<S>>> {
  const qs = query.toString();
  try {
    const result = (await api.call(qs ? `${path}?${qs}` : path, { schema })) as z.infer<S>;
    return { result, invalidFilters: false };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'validation_failed') {
      return { result: empty, invalidFilters: true };
    }
    throw error;
  }
}

/** Kết quả rỗng của một trang tìm kiếm. */
export const emptyPage = () => ({ items: [], page: 1, pageSize: 20, total: 0 });
