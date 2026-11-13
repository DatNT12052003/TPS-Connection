import { describe, expect, it } from '@jest/globals';
import type { AuthUser, Role, UserStatus } from '@tps/shared';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { createLogger } from '../lib/logger.js';
import { requireActiveAccount, requireRole, requireStaff } from './authorize.js';
import { errorHandler } from './error-handler.js';
import { requestLogger } from './request-logger.js';

/** App thử: header x-test-user giả lập kết quả của authenticate. */
function appWith(guard: RequestHandler) {
  const app = express();
  app.use(requestLogger(createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' })));
  app.use((req, _res, next) => {
    const header = req.get('x-test-user');
    if (header) {
      const { roles, status } = JSON.parse(header) as { roles: Role[]; status: UserStatus };
      const user: AuthUser = {
        id: '0195f3c4-0000-7000-8000-000000000001',
        email: 'u@example.com',
        displayName: 'U',
        fullName: null,
        phone: null,
        locale: 'vi',
        status,
        emailVerified: true,
        roles,
      };
      req.auth = { user, sessionFamilyId: 'f' };
    }
    next();
  });
  app.get('/x', guard, (_req, res) => {
    res.status(204).end();
  });
  app.use(errorHandler);
  return app;
}

const as = (roles: Role[], status: UserStatus = 'active') => JSON.stringify({ roles, status });

describe('requireRole', () => {
  const app = appWith(requireRole('tutor', 'parent'));

  it('rejects a request without a signed-in user (deny by default)', async () => {
    const res = await request(app).get('/x');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthenticated');
  });

  it('allows any of the listed roles', async () => {
    await request(app)
      .get('/x')
      .set('x-test-user', as(['parent']))
      .expect(204);
    await request(app)
      .get('/x')
      .set('x-test-user', as(['student', 'tutor']))
      .expect(204);
  });

  it('rejects other roles, including staff', async () => {
    for (const roles of [['student'], ['admin'], []] as Role[][]) {
      const res = await request(app).get('/x').set('x-test-user', as(roles));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
    }
  });
});

describe('requireStaff', () => {
  const app = appWith(requireStaff());

  it('allows managers and admins only', async () => {
    await request(app)
      .get('/x')
      .set('x-test-user', as(['manager']))
      .expect(204);
    await request(app)
      .get('/x')
      .set('x-test-user', as(['admin']))
      .expect(204);
    await request(app)
      .get('/x')
      .set('x-test-user', as(['tutor', 'parent']))
      .expect(403);
  });
});

describe('requireActiveAccount', () => {
  const app = appWith(requireActiveAccount());

  it('blocks restricted accounts with account_restricted', async () => {
    await request(app)
      .get('/x')
      .set('x-test-user', as(['parent']))
      .expect(204);
    const res = await request(app)
      .get('/x')
      .set('x-test-user', as(['parent'], 'restricted'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('account_restricted');
  });
});
