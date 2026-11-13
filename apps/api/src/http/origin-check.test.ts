import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { errorHandler } from './error-handler.js';
import { originCheck } from './origin-check.js';
import { requestLogger } from './request-logger.js';
import { createLogger } from '../lib/logger.js';

const app = express();
app.use(requestLogger(createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' })));
app.use(originCheck(['http://localhost:5173']));
app.all('/x', (_req, res) => {
  res.status(204).end();
});
app.use(errorHandler);

describe('originCheck', () => {
  it('allows reads from anywhere', async () => {
    await request(app).get('/x').set('Origin', 'https://evil.example').expect(204);
  });

  it('allows writes from the web origin and from clients without Origin (mobile, curl)', async () => {
    await request(app).post('/x').set('Origin', 'http://localhost:5173').expect(204);
    await request(app).post('/x').expect(204);
  });

  it('rejects writes from another origin', async () => {
    const res = await request(app).post('/x').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('rejects cross-site writes that hide their origin', async () => {
    await request(app).delete('/x').set('Sec-Fetch-Site', 'cross-site').expect(403);
  });
});
