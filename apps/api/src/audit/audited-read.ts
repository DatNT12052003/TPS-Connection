import type { Actor } from '../auth/actor.js';

/** Someone identified by ID only, such as a person signing in. */
export type AuditActor = Actor | { kind: 'user'; userId: string };

export type AuditEntry = {
  action: string;
  targetType: string;
  targetId?: string;
  /** Never put citizen ID numbers or message contents here (NFR-S08). */
  metadata?: Record<string, unknown>;
};

export type AuditWriter = (actor: AuditActor, entry: AuditEntry) => Promise<void>;

/**
 * Records the access before returning the data. If the record cannot be
 * written the read does not happen: sensitive data is never served unlogged.
 */
export async function auditedRead<T>(
  write: AuditWriter,
  actor: Actor,
  entry: AuditEntry,
  read: () => Promise<T>,
): Promise<T> {
  await write(actor, entry);
  return read();
}
