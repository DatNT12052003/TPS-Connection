import type { Queryable } from '../db/queryable.js';
import { allow, deny, type Policy } from './policy.js';

/** Someone else's file answers 404, so its existence stays hidden. */
export const fileOwner =
  (db: Queryable): Policy<{ id: string }> =>
  async ({ actor, params }) => {
    if (actor.kind !== 'user') return deny();
    const rows: unknown[] = await db.query(
      `SELECT 1 FROM files WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL`,
      [params.id, actor.userId],
    );
    return rows.length > 0 ? allow() : deny();
  };
