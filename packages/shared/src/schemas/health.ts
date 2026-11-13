// Response của GET /health/ready (API). Không chứa chi tiết lỗi nội bộ (địa chỉ máy, thông điệp driver):
// chi tiết chỉ ghi vào log của API.
import { z } from 'zod';

export const HealthCheckResult = z.object({
  status: z.enum(['ok', 'error']),
  latencyMs: z.number().nonnegative(),
});
export type HealthCheckResult = z.infer<typeof HealthCheckResult>;

export const HealthReport = z.object({
  status: z.enum(['ok', 'error']),
  checks: z.record(z.string(), HealthCheckResult),
});
export type HealthReport = z.infer<typeof HealthReport>;
