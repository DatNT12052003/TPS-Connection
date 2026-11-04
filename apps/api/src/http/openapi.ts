import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { API_PREFIX } from './app.js';
import type { AnyRoute } from './route.js';

extendZodWithOpenApi(z);

const problem = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.string(),
    requestId: z.string(),
    fields: z.array(z.object({ path: z.string(), code: z.string() })),
  })
  .openapi('Problem');

export function buildOpenApiDocument(routes: AnyRoute[]) {
  const registry = new OpenAPIRegistry();
  for (const route of routes) {
    registry.registerPath({
      method: route.method,
      path: `${API_PREFIX}${route.path}`.replaceAll(/:(\w+)/g, '{$1}'),
      summary: route.summary,
      tags: [route.tag],
      request: {
        params: route.input.params,
        query: route.input.query,
        ...(route.input.body && {
          body: {
            content: { 'application/json': { schema: route.input.body } },
          },
        }),
      },
      responses: {
        [route.successStatus]: {
          description: 'Success',
          content: { 'application/json': { schema: route.output } },
        },
        default: {
          description: 'Error',
          content: { 'application/problem+json': { schema: problem } },
        },
      },
    });
  }
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'TPS-Connection API', version: '1.0.0' },
  });
}
