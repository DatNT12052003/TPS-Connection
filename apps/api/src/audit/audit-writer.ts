import { v7 as uuidv7 } from 'uuid';
import type { Queryable } from '../db/queryable.js';
import type { AuditWriter } from './audited-read.js';

/** Pass a transaction's manager to make the record part of that transaction. */
export const databaseAuditWriter =
  (db: Queryable): AuditWriter =>
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
