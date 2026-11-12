import { describe, expect, it } from '@jest/globals';
import { ApiErrorBody } from '@tps/shared';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { silentLogger } from '../../test/helpers.js';
import { AppError, notFound } from '../lib/app-error.js';
import { errorHandler } from './error-handler.js';
import { requestLogger } from './request-logger.js';

/** App nhỏ ném đúng một lỗi, để kiểm tra error handler. */
function appThrowing(error: unknown) {
  const app = express();
  app.use(requestLogger(silentLogger));
  app.get('/boom', async () => {
    await Promise.resolve();
    throw error;
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('maps AppError to its code and HTTP status', async () => {
    const res = await request(appThrowing(notFound('Lesson'))).get('/boom');
    expect(res.status).toBe(404);
    expect(ApiErrorBody.parse(res.body).error).toMatchObject({
      code: 'not_found',
      message: 'Lesson not found',
    });
  });

  it('maps invalid_state_transition to 409', async () => {
    const res = await request(
      appThrowing(new AppError('invalid_state_transition', 'Lesson already held')),
    ).get('/boom');
    expect(res.status).toBe(409);
  });

  it('maps ZodError to validation_failed with field details', async () => {
    const result = z.object({ email: z.email() }).safeParse({ email: 'x' });
    const res = await request(appThrowing(result.error)).get('/boom');
    expect(res.status).toBe(422);
    const { error } = ApiErrorBody.parse(res.body);
    expect(error.code).toBe('validation_failed');
    expect(error.details?.[0]?.path).toBe('email');
  });

  it('hides the message of unexpected errors', async () => {
    const res = await request(appThrowing(new Error('password=hunter2 leaked'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('internal_error');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});
