import { v7 as uuidv7 } from 'uuid';
import type { Queryable } from '../db/queryable.js';
import { hashToken } from './tokens.js';

export type RateLimit = { limit: number; windowSeconds: number };
export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Records the attempt first and counts afterwards, so parallel requests cannot
 * all see room left. A refused attempt is removed again: it does not extend the block.
 */
export async function consumeRateLimit(
  db: Queryable,
  bucket: string,
  { limit, windowSeconds }: RateLimit,
): Promise<RateLimitResult> {
  const hashed = hashToken(bucket);
  const id = uuidv7();
  await db.query(`INSERT INTO rate_limit_events (id, bucket) VALUES ($1, $2)`, [id, hashed]);

  const [row]: { attempts: number; retry_after: number }[] = await db.query(
    `SELECT count(*)::int AS attempts,
            ceil(extract(epoch FROM min(occurred_at) + make_interval(secs => $2) - now()))::int
              AS retry_after
       FROM rate_limit_events
      WHERE bucket = $1 AND occurred_at > now() - make_interval(secs => $2)`,
    [hashed, windowSeconds],
  );
  if ((row?.attempts ?? 0) <= limit) return { allowed: true };

  await db.query(`DELETE FROM rate_limit_events WHERE id = $1`, [id]);
  return { allowed: false, retryAfterSeconds: Math.max(row?.retry_after ?? 1, 1) };
}

export async function clearRateLimit(db: Queryable, bucket: string): Promise<void> {
  await db.query(`DELETE FROM rate_limit_events WHERE bucket = $1`, [hashToken(bucket)]);
}

/** Longer than any window in use. */
export async function purgeExpiredRateLimits(db: Queryable): Promise<void> {
  await db.query(`DELETE FROM rate_limit_events WHERE occurred_at < now() - interval '1 day'`);
}
