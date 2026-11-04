import type { Queryable } from '../db/queryable.js';
import type { ActorResolver, Role } from './actor.js';
import { ACCESS_COOKIE, parseCookies } from './cookies.js';
import { csrfTokenFor, verifyAccessToken, type AuthConfig } from './tokens.js';

const guest = { kind: 'guest' } as const;

/**
 * The token only says who is asking. Whether they may still ask is read from
 * the database each time, so sign-out and account locks apply immediately.
 */
export const sessionActorResolver =
  (db: Queryable, config: AuthConfig): ActorResolver =>
  async (headers) => {
    const token = parseCookies(headers.cookie)[ACCESS_COOKIE];
    if (!token) return guest;
    const claims = await verifyAccessToken(token, config);
    if (!claims) return guest;

    const rows: { role: Role; email_verified: boolean }[] = await db.query(
      `SELECT r.role, u.email_verified_at IS NOT NULL AS email_verified
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         JOIN user_roles r ON r.user_id = u.id
        WHERE s.id = $1 AND s.user_id = $2
          AND s.revoked_at IS NULL AND s.expires_at > now()
          AND u.deleted_at IS NULL AND u.status = 'active'
        LIMIT 1`,
      [claims.sessionId, claims.userId],
    );
    const row = rows[0];
    if (!row) return guest;

    return {
      kind: 'user',
      userId: claims.userId,
      role: row.role,
      emailVerified: row.email_verified,
      // Set by the verification module in a later change. Until then nobody is verified.
      tutorVerified: false,
      familyId: claims.familyId,
      csrfToken: csrfTokenFor(claims.familyId, config),
    };
  };
