// Tài liệu OpenAPI sinh từ chính các Zod schema trong @tps/shared. Thêm endpoint: khai báo path ở đây.
import { ApiErrorBody, HealthReport } from '@tps/shared';
import { createDocument } from 'zod-openapi';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

export function createOpenApiDocument() {
  return createDocument({
    openapi: '3.1.0',
    info: { title: 'TPS-Connection API', version: '0.1.0' },
    components: {
      schemas: { ApiErrorBody, HealthReport },
    },
    paths: {
      '/health': {
        get: {
          summary: 'Liveness: tiến trình API còn chạy',
          responses: { 200: { description: 'OK' } },
        },
      },
      '/health/ready': {
        get: {
          summary: 'Readiness: PostgreSQL, Redis đều sẵn sàng',
          responses: {
            200: { description: 'Mọi phụ thuộc đều ổn', ...json(HealthReport) },
            503: { description: 'Ít nhất một phụ thuộc lỗi', ...json(HealthReport) },
          },
        },
      },
    },
  });
}
