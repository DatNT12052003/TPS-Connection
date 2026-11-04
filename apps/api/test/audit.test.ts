import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { databaseAuditWriter } from '../src/audit/audit-writer.js';
import { auditedRead } from '../src/audit/audited-read.js';
import { connect, parent } from './helpers.js';

describe('auditedRead', () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await connect();
  });
  afterAll(() => db.destroy());

  it('writes the record before reading', async () => {
    const target = crypto.randomUUID();
    const value = await auditedRead(
      databaseAuditWriter(db),
      parent,
      { action: 'test.view', targetType: 'test', targetId: target },
      async () => {
        const rows = await db.query(
          'SELECT count(*)::int AS n FROM audit_logs WHERE target_id = $1',
          [target],
        );
        return rows[0].n as number;
      },
    );
    expect(value).toBe(1);
  });

  it('does not read when the record cannot be written', async () => {
    const read = vi.fn();
    await expect(
      auditedRead(
        async () => {
          throw new Error('audit unavailable');
        },
        parent,
        { action: 'test.view', targetType: 'test' },
        read,
      ),
    ).rejects.toThrow('audit unavailable');
    expect(read).not.toHaveBeenCalled();
  });

  it('stops the application role changing or deleting audit records', async () => {
    await expect(db.query(`UPDATE audit_logs SET action = 'x'`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query(`DELETE FROM audit_logs`)).rejects.toThrow(/permission denied/);
    await expect(db.query(`TRUNCATE audit_logs`)).rejects.toThrow(/permission denied/);
  });
});
