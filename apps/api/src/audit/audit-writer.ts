import type { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import type { AuditWriter } from './audited-read.js';

export const databaseAuditWriter =
  (db: DataSource): AuditWriter =>
  async (actor, entry) => {
    await db.query(
      `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        uuidv7(),
        actor.kind === 'user' ? actor.userId : null,
        entry.action,
        entry.targetType,
        entry.targetId ?? null,
        entry.metadata ?? {},
      ],
    );
  };
