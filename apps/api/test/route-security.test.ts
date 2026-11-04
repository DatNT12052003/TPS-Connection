import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { z } from 'zod';
import { API_PREFIX, listRegisteredRoutes } from '../src/http/app.js';
import { defineRoute } from '../src/http/route.js';
import { publicAccess } from '../src/policies/policy.js';
import {
  APPROVED_PUBLIC_ROUTES,
  APPROVED_UNVERIFIED_EMAIL_ROUTES,
  buildRoutes,
} from '../src/routes.js';
import { authConfig, testApp, noFileStore } from './helpers.js';

const routes = buildRoutes({} as DataSource, authConfig, noFileStore);
const key = (route: { method: string; path: string }) => `${route.method} ${route.path}`;

describe('route security', () => {
  it('refuses to define a route without a policy', () => {
    expect(() =>
      defineRoute({
        method: 'get',
        path: '/no-policy',
        summary: 'x',
        tag: 'x',
        output: z.object({}),
        handler: async () => ({}),
      } as never),
    ).toThrow(/no policy/);
  });

  it('refuses to define a route without an output schema', () => {
    expect(() =>
      defineRoute({
        method: 'get',
        path: '/no-output',
        summary: 'x',
        tag: 'x',
        policy: publicAccess,
        handler: async () => ({}),
      } as never),
    ).toThrow(/no output schema/);
  });

  it('gives every route a policy', () => {
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) expect(route.policy, key(route)).toBeTypeOf('function');
  });

  it('registers only the routes in the registry on Express', () => {
    const registered = listRegisteredRoutes(testApp(routes));
    const expected = routes.map((r) => `${r.method} ${API_PREFIX}${r.path}`);
    expect(registered.sort()).toEqual(expected.sort());
  });

  it('opens to guests exactly the approved routes', () => {
    const open = routes.filter((r) => (r.policy as unknown) === publicAccess).map(key);
    expect(open.sort()).toEqual([...APPROVED_PUBLIC_ROUTES].sort());
  });

  it('lets unverified accounts reach exactly the approved routes', () => {
    const open = routes.filter((r) => r.allowUnverifiedEmail).map(key);
    expect(open.sort()).toEqual([...APPROVED_UNVERIFIED_EMAIL_ROUTES].sort());
  });
});
