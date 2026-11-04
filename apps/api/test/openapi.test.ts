import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { buildOpenApiDocument } from '../src/http/openapi.js';
import { buildRoutes } from '../src/routes.js';
import { authConfig, noFileStore } from './helpers.js';

describe('OpenAPI contract', () => {
  const document = buildOpenApiDocument(buildRoutes({} as DataSource, authConfig, noFileStore));

  it('describes the sample route with its fields', () => {
    const get = document.paths?.['/api/v1/catalog/subjects']?.get;
    const response = get?.responses?.['200'];
    expect(JSON.stringify(response)).toContain('nameVi');
  });

  it('matches the committed openapi.json. Run npm run openapi:generate if not', () => {
    const committed = JSON.parse(readFileSync('openapi.json', 'utf8'));
    expect(committed).toEqual(JSON.parse(JSON.stringify(document)));
  });
});
