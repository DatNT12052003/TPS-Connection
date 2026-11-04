import type { DataSource } from 'typeorm';
import type { AuthConfig } from './auth/tokens.js';
import type { AnyRoute } from './http/route.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';

export const buildRoutes = (db: DataSource, authConfig: AuthConfig): AnyRoute[] => [
  ...healthRoutes(db),
  ...catalogRoutes(db),
  ...authRoutes(db, authConfig),
];

/**
 * Every route open to guests. Adding one must be a deliberate, reviewed change:
 * a test fails if this list and the routes using publicAccess differ.
 */
export const APPROVED_PUBLIC_ROUTES = [
  'get /health',
  'get /catalog/subjects',
  'post /auth/register',
  'post /auth/email-verification/confirm',
  'post /auth/email-verification/resend',
  'post /auth/login',
  'post /auth/refresh',
  'post /auth/logout',
  'post /auth/password/forgot',
  'post /auth/password/reset',
];

/**
 * Routes that work before the email is verified. Also reviewed, because everything
 * else must refuse those accounts (AC-ACC-02.2).
 */
export const APPROVED_UNVERIFIED_EMAIL_ROUTES = ['get /me'];
