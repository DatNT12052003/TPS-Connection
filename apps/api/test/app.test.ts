import { describe, expect, it } from '@jest/globals';
import { ApiErrorBody, HealthReport } from '@tps/shared';
import request from 'supertest';
import { createTestApp } from './helpers.js';

describe('health endpoints', () => {
  it('GET /health is always ok', async () => {
    const res = await request(createTestApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready returns 200 when dependencies are ok', async () => {
    const report: HealthReport = {
      status: 'ok',
      checks: { database: { status: 'ok', latencyMs: 1 }, redis: { status: 'ok', latencyMs: 1 } },
    };
    const res = await request(createTestApp({ check: async () => report })).get('/health/ready');
    expect(res.status).toBe(200);
    expect(HealthReport.parse(res.body)).toEqual(report);
  });

  it('GET /health/ready returns 503 when a dependency fails', async () => {
    const res = await request(
      createTestApp({
        check: async () => ({
          status: 'error',
          checks: { database: { status: 'error', latencyMs: 2000 } },
        }),
      }),
    ).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
  });
});

describe('error format', () => {
  it('returns not_found with a request id for unknown routes', async () => {
    const res = await request(createTestApp()).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    const body = ApiErrorBody.parse(res.body);
    expect(body.error.code).toBe('not_found');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('reuses a valid incoming x-request-id', async () => {
    const res = await request(createTestApp()).get('/nope').set('x-request-id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
    expect(res.body.error.requestId).toBe('abc-123');
  });

  it('replaces an invalid incoming x-request-id', async () => {
    const res = await request(createTestApp()).get('/nope').set('x-request-id', 'bad id <script>');
    expect(res.headers['x-request-id']).not.toBe('bad id <script>');
  });

  it('returns bad_request for malformed JSON', async () => {
    const res = await request(createTestApp())
      .post('/api/v1/anything')
      .set('content-type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(ApiErrorBody.parse(res.body).error.code).toBe('bad_request');
  });
});

describe('security headers and CORS', () => {
  it('sets helmet headers and hides x-powered-by', async () => {
    const res = await request(createTestApp()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows the configured web origin only', async () => {
    const allowed = await request(createTestApp())
      .get('/health')
      .set('origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const other = await request(createTestApp())
      .get('/health')
      .set('origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('GET /openapi.json', () => {
  it('documents the health endpoints from the shared Zod schemas', async () => {
    const res = await request(createTestApp()).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/health/ready']));
    expect(res.body.components.schemas).toHaveProperty('HealthReport');
  });
});
