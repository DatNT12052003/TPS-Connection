import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineRoute } from '../src/http/route.js';
import { allow, deny, publicAccess, type Policy } from '../src/policies/policy.js';
import { parent, testApp } from './helpers.js';

const privateRoute = (policy: Policy) =>
  defineRoute({
    method: 'get',
    path: '/secret',
    summary: 'x',
    tag: 'x',
    policy,
    output: z.object({ value: z.string() }),
    handler: async () => ({ value: 'secret' }),
  });

describe('authorization pipeline', () => {
  it('answers 401 to guests on non-public routes without calling the policy', async () => {
    let called = false;
    const route = privateRoute(() => {
      called = true;
      return allow();
    });
    const res = await request(testApp([route])).get('/api/v1/secret');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
    expect(called).toBe(false);
  });

  it('answers 404 when the policy hides the resource', async () => {
    const res = await request(testApp([privateRoute(() => deny())], parent)).get('/api/v1/secret');
    expect(res.status).toBe(404);
    expect(res.body.value).toBeUndefined();
  });

  it('answers 403 when the policy reveals the refusal', async () => {
    const route = privateRoute(() => deny({ reveal: true, code: 'NOT_RECIPIENT' }));
    const res = await request(testApp([route], parent)).get('/api/v1/secret');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_RECIPIENT');
  });

  it('fails closed when the policy throws', async () => {
    const route = privateRoute(() => {
      throw new Error('database is down at secret-host');
    });
    const res = await request(testApp([route], parent)).get('/api/v1/secret');
    expect(res.status).toBe(500);
    expect(res.body.value).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('secret-host');
  });

  it('serves the handler when the policy allows', async () => {
    const res = await request(testApp([privateRoute(() => allow())], parent)).get('/api/v1/secret');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ value: 'secret' });
  });
});

describe('responses', () => {
  it('strips fields missing from the output schema', async () => {
    const route = defineRoute({
      method: 'get',
      path: '/tutor',
      summary: 'x',
      tag: 'x',
      policy: publicAccess,
      output: z.object({ displayName: z.string() }),
      handler: async () => ({ displayName: 'An', phone: '0900000000' }) as { displayName: string },
    });
    const res = await request(testApp([route])).get('/api/v1/tutor');
    expect(res.body).toEqual({ displayName: 'An' });
  });

  it('fails closed when a response does not match its schema', async () => {
    const route = defineRoute({
      method: 'get',
      path: '/bad',
      summary: 'x',
      tag: 'x',
      policy: publicAccess,
      output: z.object({ count: z.number() }),
      handler: async () => ({ count: 'many' }) as unknown as { count: number },
    });
    const res = await request(testApp([route])).get('/api/v1/bad');
    expect(res.status).toBe(500);
    expect(res.body.count).toBeUndefined();
  });

  it('sets a request ID that matches the error body', async () => {
    const res = await request(testApp([])).get('/api/v1/missing');
    expect(res.status).toBe(404);
    expect(res.type).toBe('application/problem+json');
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('allows only configured origins', async () => {
    const res = await request(testApp([]))
      .get('/api/v1/missing')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('input', () => {
  const echo = defineRoute({
    method: 'post',
    path: '/echo',
    summary: 'x',
    tag: 'x',
    input: { body: z.object({ email: z.email() }) },
    policy: publicAccess,
    output: z.object({ email: z.string() }),
    handler: async ({ body }) => ({ email: body.email }),
  });

  it('reports invalid fields', async () => {
    const res = await request(testApp([echo]))
      .post('/api/v1/echo')
      .send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(res.body.fields[0].path).toBe('body.email');
  });

  it('reports malformed JSON', async () => {
    const res = await request(testApp([echo]))
      .post('/api/v1/echo')
      .set('Content-Type', 'application/json')
      .send('{nope');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_JSON');
  });
});
