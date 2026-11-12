import { describe, expect, it } from '@jest/globals';
import { ApiErrorBody, Email, Id, PaginationQuery } from '@tps/shared';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { silentLogger } from '../../test/helpers.js';
import { errorHandler } from './error-handler.js';
import { requestLogger } from './request-logger.js';
import { validate } from './validate.js';

function appWith(...handlers: express.RequestHandler[]) {
  const app = express();
  app.use(requestLogger(silentLogger), express.json());
  app.post('/items/:id', ...handlers);
  app.use(errorHandler);
  return app;
}

const echo: express.RequestHandler = (req, res) => {
  res.json({ params: req.params, query: req.query, body: req.body });
};

const schemas = {
  params: z.object({ id: Id }),
  query: PaginationQuery,
  body: z.object({ email: Email }),
};
const ID = '0195f3a0-7c1e-7d2a-9b3c-4d5e6f708192';

describe('validate', () => {
  it('replaces params, query and body with parsed values', async () => {
    const res = await request(appWith(validate(schemas), echo))
      .post(`/items/${ID}?page=2&unknown=x`)
      .send({ email: '  Phu.Huynh@Gmail.COM ', extra: 'dropped' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      params: { id: ID },
      query: { page: 2, pageSize: 20 },
      body: { email: 'phu.huynh@gmail.com' },
    });
  });

  it('stops before the controller with 422 and field details', async () => {
    let reached = false;
    const res = await request(
      appWith(validate(schemas), (_req, res) => {
        reached = true;
        res.end();
      }),
    )
      .post('/items/not-a-uuid?pageSize=1000')
      .send({ email: 'x' });

    expect(reached).toBe(false);
    expect(res.status).toBe(422);
    const { error } = ApiErrorBody.parse(res.body);
    expect(error.code).toBe('validation_failed');
    expect(error.details?.map((d) => d.path)).toEqual(['id']);
  });
});
