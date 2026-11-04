import { writeFileSync } from 'node:fs';
import type { DataSource } from 'typeorm';
import type { FileStore } from '../files/file-store.js';
import { buildOpenApiDocument } from '../http/openapi.js';
import { buildRoutes } from '../routes.js';

// Handlers never run here, so no database connection or real secret is needed.
const routes = buildRoutes(
  {} as DataSource,
  { secret: 'unused', cookieSecure: true },
  {} as FileStore,
);
writeFileSync('openapi.json', `${JSON.stringify(buildOpenApiDocument(routes), null, 2)}\n`);
console.log('Wrote openapi.json');
