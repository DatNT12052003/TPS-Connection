import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { buildRoutes } from '../src/routes.js';
import { connect, ownerDatabaseUrl, testApp } from './helpers.js';

const activeId = '00000000-0000-7000-8000-00000000000a';
const inactiveId = '00000000-0000-7000-8000-00000000000b';

describe('catalog and health', () => {
  let db: DataSource;
  let owner: DataSource;

  beforeAll(async () => {
    db = await connect();
    owner = await connect(ownerDatabaseUrl());
    await owner.query('DELETE FROM subjects');
    await owner.query(
      `INSERT INTO subjects (id, name_vi, name_en, is_active) VALUES
       ($1, 'Toán', 'Mathematics', true), ($2, 'Môn đã tắt', 'Retired', false)`,
      [activeId, inactiveId],
    );
  });

  afterAll(async () => {
    await owner.query('DELETE FROM subjects');
    await owner.destroy();
    await db.destroy();
  });

  it('lists active subjects from the database, with allowed fields only', async () => {
    const res = await request(testApp(buildRoutes(db))).get('/api/v1/catalog/subjects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [{ id: activeId, nameVi: 'Toán', nameEn: 'Mathematics' }],
    });
  });

  it('reports healthy when the database answers', async () => {
    const res = await request(testApp(buildRoutes(db))).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('answers 503 without details when the database is unreachable', async () => {
    const broken = {
      query: () => Promise.reject(new Error('connect ECONNREFUSED db-host')),
    };
    const res = await request(testApp(buildRoutes(broken as unknown as DataSource))).get(
      '/api/v1/health',
    );
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('db-host');
  });
});
