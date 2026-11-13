import { HealthReport } from '@tps/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, server } from '../../test/msw-server';
import { ApiError, apiGet } from './api';

const report: HealthReport = {
  status: 'ok',
  checks: { database: { status: 'ok', latencyMs: 3 } },
};

const get = (options: Parameters<typeof apiGet>[2] = {}) =>
  apiGet('/health/ready', HealthReport, { baseUrl: API, ...options });

describe('apiGet', () => {
  it('returns data validated by the schema', async () => {
    server.use(http.get(`${API}/health/ready`, () => HttpResponse.json(report)));
    await expect(get()).resolves.toEqual(report);
  });

  it('treats an accepted non-2xx status as data', async () => {
    const down: HealthReport = { status: 'error', checks: {} };
    server.use(http.get(`${API}/health/ready`, () => HttpResponse.json(down, { status: 503 })));
    await expect(get({ acceptStatuses: [503] })).resolves.toEqual(down);
  });

  it('throws ApiError with the code from the unified error body', async () => {
    server.use(
      http.get(`${API}/health/ready`, () =>
        HttpResponse.json(
          { error: { code: 'forbidden', message: 'Forbidden', requestId: 'req-1' } },
          { status: 403 },
        ),
      ),
    );
    await expect(get()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'forbidden',
      status: 403,
      requestId: 'req-1',
    });
  });

  it('reports an unreachable API as service_unavailable', async () => {
    server.use(http.get(`${API}/health/ready`, () => HttpResponse.error()));
    const error = await get().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('service_unavailable');
  });

  it('rejects a response with an unexpected shape', async () => {
    server.use(http.get(`${API}/health/ready`, () => HttpResponse.json({ ok: true })));
    await expect(get()).rejects.toMatchObject({ code: 'internal_error' });
  });
});
