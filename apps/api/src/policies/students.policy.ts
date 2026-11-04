import type { Queryable } from '../db/queryable.js';
import { allow, deny, type Policy } from './policy.js';

/** Only parents have student profiles of their own to manage. */
export const parentOnly: Policy = ({ actor }) =>
  actor.kind === 'user' && actor.role === 'parent'
    ? allow()
    : deny({ reveal: true, code: 'PARENT_ROLE_REQUIRED' });

/** The GUARDIAN relation. A child of another parent answers 404 (AC-ACC-06.3). */
export const guardianOfStudent =
  (db: Queryable): Policy<{ id: string }> =>
  async ({ actor, params }) => {
    if (actor.kind !== 'user' || actor.role !== 'parent') return deny();
    const rows: unknown[] = await db.query(
      `SELECT 1 FROM students
        WHERE id = $1 AND guardian_user_id = $2 AND deleted_at IS NULL`,
      [params.id, actor.userId],
    );
    return rows.length > 0 ? allow() : deny();
  };
