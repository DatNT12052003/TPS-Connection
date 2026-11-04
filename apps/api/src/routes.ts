import type { DataSource } from 'typeorm';
import type { AuthConfig } from './auth/tokens.js';
import type { FileStore } from './files/file-store.js';
import type { AnyRoute } from './http/route.js';
import { accountRoutes } from './modules/account/account.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { adminCatalogRoutes } from './modules/catalog/admin-catalog.routes.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { filesRoutes } from './modules/files/files.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { studentsRoutes } from './modules/students/students.routes.js';
import { tutorsRoutes } from './modules/tutors/tutors.routes.js';

export const buildRoutes = (
  db: DataSource,
  authConfig: AuthConfig,
  fileStore: FileStore,
): AnyRoute[] => [
  ...healthRoutes(db),
  ...catalogRoutes(db),
  ...authRoutes(db, authConfig),
  ...accountRoutes(db, fileStore),
  ...filesRoutes(db, fileStore),
  ...studentsRoutes(db),
  ...tutorsRoutes(db, fileStore),
  ...adminCatalogRoutes(db),
];

/**
 * Every route open to guests. Adding one must be a deliberate, reviewed change:
 * a test fails if this list and the routes using publicAccess differ.
 */
export const APPROVED_PUBLIC_ROUTES = [
  'get /health',
  'get /catalog/subjects',
  'get /catalog/grades',
  'get /catalog/regions',
  'get /public/tutors/:id',
  'post /auth/register',
  'post /auth/email-verification/confirm',
  'post /auth/email-verification/resend',
  'post /auth/login',
  'post /auth/refresh',
  'post /auth/logout',
  'post /auth/password/forgot',
  'post /auth/password/reset',
  'post /auth/email-change/confirm',
];

/**
 * Routes that work before the email is verified. Also reviewed, because everything
 * else must refuse those accounts (AC-ACC-02.2).
 */
export const APPROVED_UNVERIFIED_EMAIL_ROUTES = [
  'get /me',
  'patch /me',
  'post /me/password',
  'post /me/email-change',
];
