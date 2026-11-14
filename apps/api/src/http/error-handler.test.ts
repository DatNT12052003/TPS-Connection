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

  it('puts the i18n validation code in details[].code for every kind of field error', async () => {
    const schema = z.object({
      title: z.string().max(3, { error: 'too_long' }), // mã riêng của schema
      name: z.string(), // thiếu -> required
      kind: z.enum(['a', 'b']), // sai giá trị, thông điệp mặc định -> invalid
      note: z.string().max(1, { error: 'not_a_known_code' }), // mã chưa có bản dịch -> invalid
    });
    const result = schema.safeParse({ title: 'quá dài', kind: 'c', note: 'xx' });
    const res = await request(appThrowing(result.error)).get('/boom');
    const details = ApiErrorBody.parse(res.body).error.details ?? [];
    expect(details.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: 'title', code: 'too_long' },
      { path: 'name', code: 'required' },
      { path: 'kind', code: 'invalid' },
      { path: 'note', code: 'invalid' },
    ]);
    // `message` là mô tả tiếng Anh, không phải mã.
    expect(details[0]?.message).toBe('This is too long.');
  });

  it('keeps the code of AppError field errors, unknown codes become invalid', async () => {
    const res = await request(
      appThrowing(
        new AppError('validation_failed', 'Bad', [
          { path: 'fullName', code: 'full_name_locked', message: 'Full name is locked' },
          { path: 'x', code: 'typo_code', message: 'Typo' },
        ]),
      ),
    ).get('/boom');
    expect(ApiErrorBody.parse(res.body).error.details?.map((d) => d.code)).toEqual([
      'full_name_locked',
      'invalid',
    ]);
  });

  it('hides the message of unexpected errors', async () => {
    const res = await request(appThrowing(new Error('password=hunter2 leaked'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('internal_error');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});
