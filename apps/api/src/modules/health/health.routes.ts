import type { DataSource } from 'typeorm';
import { z } from 'zod';
import { ApiError } from '../../http/errors.js';
import { defineRoute } from '../../http/route.js';
import { publicAccess } from '../../policies/policy.js';

export const healthRoutes = (db: DataSource) => [
  defineRoute({
    method: 'get',
    path: '/health',
    summary: 'Check that the API can reach its database',
    tag: 'Operations',
    policy: publicAccess,
    output: z.object({ status: z.literal('ok') }),
    handler: async () => {
      try {
        await db.query('SELECT 1');
      } catch {
        throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Service unavailable');
      }
      return { status: 'ok' as const };
    },
  }),
];
