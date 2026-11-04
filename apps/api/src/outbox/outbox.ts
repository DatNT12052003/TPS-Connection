import { v7 as uuidv7 } from 'uuid';
import type { Queryable } from '../db/queryable.js';

export type OutboxEventType =
  | 'email.verify_email'
  | 'email.already_registered'
  | 'email.reset_password'
  | 'email.password_changed';

/**
 * Call with the same transaction as the change it describes, so an event exists
 * only if the change does (NFR-R06). Never store a raw token in here: the
 * Worker creates links when it sends them.
 */
export async function enqueueEvent(
  db: Queryable,
  type: OutboxEventType,
  aggregateId: string,
): Promise<void> {
  await db.query(`INSERT INTO outbox_events (id, type, aggregate_id) VALUES ($1, $2, $3)`, [
    uuidv7(),
    type,
    aggregateId,
  ]);
}
