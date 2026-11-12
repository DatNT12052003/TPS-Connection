import { HealthReport } from '@tps/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '~/lib/api';

/** /health/ready trả 503 kèm HealthReport khi có dịch vụ lỗi: đó vẫn là dữ liệu để hiển thị. */
export function fetchHealth(signal?: AbortSignal): Promise<HealthReport> {
  return apiGet('/health/ready', HealthReport, {
    acceptStatuses: [503],
    ...(signal && { signal }),
  });
}

export const HEALTH_REFETCH_MS = 15_000;

export const healthQueryOptions = queryOptions({
  queryKey: ['health', 'ready'],
  queryFn: ({ signal }) => fetchHealth(signal),
  refetchInterval: HEALTH_REFETCH_MS,
  retry: false,
});
