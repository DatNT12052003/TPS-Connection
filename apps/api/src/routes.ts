import type { DataSource } from 'typeorm';
import type { AnyRoute } from './http/route.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';

export const buildRoutes = (db: DataSource): AnyRoute[] => [
  ...healthRoutes(db),
  ...catalogRoutes(db),
];

/**
 * Every route open to guests. Adding one must be a deliberate, reviewed change:
 * a test fails if this list and the routes using publicAccess differ.
 */
export const APPROVED_PUBLIC_ROUTES = ['get /health', 'get /catalog/subjects'];
