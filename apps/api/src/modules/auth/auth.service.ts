import type { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { databaseAuditWriter } from '../../audit/audit-writer.js';
import type { Role } from '../../auth/actor.js';
import { assertPasswordAllowed, hashPassword, verifyPassword } from '../../auth/password.js';
import { clearRateLimit, consumeRateLimit, type RateLimit } from '../../auth/rate-limit.js';
import {
  hashToken,
  randomToken,
  REFRESH_TOKEN_SECONDS,
  signAccessToken,
  type AuthConfig,
} from '../../auth/tokens.js';
import { returnedRows, type Queryable } from '../../db/queryable.js';
import type { Locale } from '../../email/templates.js';
import { ApiError, forbidden, tooManyRequests, unauthorized } from '../../http/errors.js';
import { enqueueEvent } from '../../outbox/outbox.js';

/** Placeholder until the lawyer-reviewed documents exist (roadmap, BR-1209). */
export const CURRENT_TERMS_VERSION = 'draft-2026-11';
const CONSENT_DOCUMENTS = ['terms_of_service', 'privacy_policy'];

const LOGIN_LIMIT: RateLimit = { limit: 5, windowSeconds: 15 * 60 };
const EMAIL_REQUEST_LIMIT: RateLimit = { limit: 3, windowSeconds: 60 * 60 };

const loginBucket = (email: string) => `login:${email}`;

export type Account = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  locale: Locale;
  emailVerified: boolean;
};

export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  familyId: string;
};

const tokenInvalid = () =>
  new ApiError(422, 'TOKEN_INVALID_OR_EXPIRED', 'Token is invalid or has expired');

const ACCOUNT_COLUMNS = `u.id, u.email, u.display_name, r.role, u.locale,
  u.email_verified_at IS NOT NULL AS email_verified`;

type AccountRow = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  locale: Locale;
  email_verified: boolean;
};

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  role: row.role,
  locale: row.locale,
  emailVerified: row.email_verified,
});

export const authService = (db: DataSource, config: AuthConfig) => {
  async function createSessionRow(
    tx: Queryable,
    userId: string,
    familyId: string,
  ): Promise<IssuedSession> {
    const sessionId = uuidv7();
    const refreshToken = randomToken();
    await tx.query(
      `INSERT INTO user_sessions (id, user_id, family_id, refresh_token_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
      [sessionId, userId, familyId, hashToken(refreshToken), REFRESH_TOKEN_SECONDS],
    );
    const accessToken = await signAccessToken({ userId, sessionId, familyId }, config);
    return { accessToken, refreshToken, familyId };
  }

  const revokeFamily = (tx: Queryable, familyId: string) =>
    tx.query(
      `UPDATE user_sessions SET revoked_at = now(), updated_at = now()
        WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId],
    );

  async function findAccount(tx: Queryable, userId: string): Promise<Account | undefined> {
    const rows: AccountRow[] = await tx.query(
      `SELECT ${ACCOUNT_COLUMNS} FROM users u JOIN user_roles r ON r.user_id = u.id
        WHERE u.id = $1 AND u.deleted_at IS NULL LIMIT 1`,
      [userId],
    );
    return rows[0] && toAccount(rows[0]);
  }

  /** Enforces a limit per address, whether or not it has an account, to reveal nothing. */
  async function limitEmailRequests(kind: string, email: string): Promise<void> {
    const result = await consumeRateLimit(db, `${kind}:${email}`, EMAIL_REQUEST_LIMIT);
    if (!result.allowed) throw tooManyRequests('TOO_MANY_REQUESTS', result.retryAfterSeconds);
  }

  return {
    async register(input: {
      role: 'tutor' | 'parent';
      email: string;
      password: string;
      displayName: string;
      locale: Locale;
    }): Promise<void> {
      assertPasswordAllowed(input.password, 'body.password');
      // Hashed before looking at the email, so both outcomes take the same time.
      const passwordHash = await hashPassword(input.password);

      const existing = await db.transaction(async (tx) => {
        const userId = uuidv7();
        const inserted: { id: string }[] = await tx.query(
          `INSERT INTO users (id, email, password_hash, display_name, locale)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (email) WHERE deleted_at IS NULL DO NOTHING
           RETURNING id`,
          [userId, input.email, passwordHash, input.displayName, input.locale],
        );
        if (inserted.length === 0) {
          const rows: { id: string }[] = await tx.query(
            `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
            [input.email],
          );
          return rows[0]?.id;
        }
        await tx.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`, [
          userId,
          input.role,
        ]);
        for (const document of CONSENT_DOCUMENTS) {
          await tx.query(
            `INSERT INTO consents (id, user_id, document, version, accepted_at)
             VALUES ($1, $2, $3, $4, now())`,
            [uuidv7(), userId, document, CURRENT_TERMS_VERSION],
          );
        }
        await enqueueEvent(tx, 'email.verify_email', userId);
        return undefined;
      });

      if (existing) {
        // Tells the real owner, and stops this form being used to flood their inbox.
        const notice = await consumeRateLimit(
          db,
          `register-notice:${input.email}`,
          EMAIL_REQUEST_LIMIT,
        );
        if (notice.allowed) await enqueueEvent(db, 'email.already_registered', existing);
      }
    },

    async confirmEmail(token: string): Promise<void> {
      const confirmed = await db.transaction(async (tx) => {
        const rows = returnedRows<{ user_id: string }>(
          await tx.query(
            `UPDATE one_time_tokens SET used_at = now(), updated_at = now()
              WHERE token_hash = $1 AND purpose = 'verify_email'
                AND used_at IS NULL AND expires_at > now()
              RETURNING user_id`,
            [hashToken(token)],
          ),
        );
        const userId = rows[0]?.user_id;
        if (!userId) return false;
        await tx.query(
          `UPDATE users SET email_verified_at = now(), updated_at = now()
            WHERE id = $1 AND deleted_at IS NULL`,
          [userId],
        );
        return true;
      });
      if (!confirmed) throw tokenInvalid();
    },

    async resendVerification(email: string): Promise<void> {
      await limitEmailRequests('verify-resend', email);
      const rows: { id: string }[] = await db.query(
        `SELECT id FROM users
          WHERE email = $1 AND deleted_at IS NULL AND email_verified_at IS NULL`,
        [email],
      );
      if (rows[0]) await enqueueEvent(db, 'email.verify_email', rows[0].id);
    },

    async login(
      email: string,
      password: string,
    ): Promise<{ account: Account; session: IssuedSession }> {
      // Counted per address whether or not it exists, so a block reveals nothing either.
      const gate = await consumeRateLimit(db, loginBucket(email), LOGIN_LIMIT);
      if (!gate.allowed) {
        throw tooManyRequests('LOGIN_TEMPORARILY_BLOCKED', gate.retryAfterSeconds);
      }

      const rows: { id: string; password_hash: string; status: string }[] = await db.query(
        `SELECT id, password_hash, status FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [email],
      );
      const user = rows[0];
      const passwordMatches = await verifyPassword(user?.password_hash, password);

      if (!user || !passwordMatches) {
        if (user) {
          await databaseAuditWriter(db)(
            { kind: 'guest' },
            { action: 'auth.login.failed', targetType: 'user', targetId: user.id },
          );
        }
        throw unauthorized('INVALID_CREDENTIALS');
      }
      // Only after the password check, so strangers cannot learn an account is locked.
      if (user.status !== 'active') throw forbidden('ACCOUNT_LOCKED');

      await clearRateLimit(db, loginBucket(email));
      return db.transaction(async (tx) => {
        const session = await createSessionRow(tx, user.id, uuidv7());
        await databaseAuditWriter(tx)(
          { kind: 'user', userId: user.id },
          { action: 'auth.login.succeeded', targetType: 'user', targetId: user.id },
        );
        const account = await findAccount(tx, user.id);
        if (!account) throw new Error('Account has no role');
        return { account, session };
      });
    },

    /**
     * Answers undefined for any token that cannot be used. An already-rotated token
     * means two parties hold this session, so the whole family is revoked (AC-ACC-03.4).
     * Returning rather than throwing lets that revocation commit.
     */
    async refresh(refreshToken: string): Promise<IssuedSession | undefined> {
      return db.transaction(async (tx) => {
        const rows: {
          user_id: string;
          family_id: string;
          rotated_at: Date | null;
          revoked_at: Date | null;
          expired: boolean;
          usable_account: boolean;
        }[] = await tx.query(
          `SELECT s.user_id, s.family_id, s.rotated_at, s.revoked_at,
                  s.expires_at <= now() AS expired,
                  (u.deleted_at IS NULL AND u.status = 'active') AS usable_account
             FROM user_sessions s JOIN users u ON u.id = s.user_id
            WHERE s.refresh_token_hash = $1
            FOR UPDATE OF s`,
          [hashToken(refreshToken)],
        );
        const current = rows[0];
        if (!current) return undefined;

        if (current.rotated_at || current.revoked_at) {
          // A revoked family stays revoked; only a live one can show a new reuse.
          if (!current.revoked_at) {
            await revokeFamily(tx, current.family_id);
            await databaseAuditWriter(tx)(
              { kind: 'guest' },
              {
                action: 'auth.session.reuse_detected',
                targetType: 'user',
                targetId: current.user_id,
              },
            );
          }
          return undefined;
        }
        if (!current.usable_account) {
          await revokeFamily(tx, current.family_id);
          return undefined;
        }
        if (current.expired) return undefined;

        await tx.query(
          `UPDATE user_sessions SET rotated_at = now(), updated_at = now()
            WHERE refresh_token_hash = $1`,
          [hashToken(refreshToken)],
        );
        return createSessionRow(tx, current.user_id, current.family_id);
      });
    },

    async logout(refreshToken: string): Promise<void> {
      const rows: { family_id: string }[] = await db.query(
        `SELECT family_id FROM user_sessions WHERE refresh_token_hash = $1`,
        [hashToken(refreshToken)],
      );
      if (rows[0]) await revokeFamily(db, rows[0].family_id);
    },

    async requestPasswordReset(email: string): Promise<void> {
      await limitEmailRequests('password-reset', email);
      const rows: { id: string }[] = await db.query(
        `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [email],
      );
      if (rows[0]) await enqueueEvent(db, 'email.reset_password', rows[0].id);
    },

    async resetPassword(token: string, newPassword: string): Promise<void> {
      assertPasswordAllowed(newPassword, 'body.newPassword');
      const passwordHash = await hashPassword(newPassword);

      const email = await db.transaction(async (tx) => {
        const tokens = returnedRows<{ user_id: string }>(
          await tx.query(
            `UPDATE one_time_tokens SET used_at = now(), updated_at = now()
              WHERE token_hash = $1 AND purpose = 'reset_password'
                AND used_at IS NULL AND expires_at > now()
              RETURNING user_id`,
            [hashToken(token)],
          ),
        );
        const userId = tokens[0]?.user_id;
        if (!userId) return undefined;

        const users = returnedRows<{ email: string }>(
          await tx.query(
            `UPDATE users SET password_hash = $2, updated_at = now()
              WHERE id = $1 AND deleted_at IS NULL
              RETURNING email`,
            [userId, passwordHash],
          ),
        );
        if (!users[0]) return undefined;

        await tx.query(
          `UPDATE user_sessions SET revoked_at = now(), updated_at = now()
            WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );
        await enqueueEvent(tx, 'email.password_changed', userId);
        await databaseAuditWriter(tx)(
          { kind: 'user', userId },
          { action: 'auth.password.reset', targetType: 'user', targetId: userId },
        );
        return users[0].email;
      });
      if (!email) throw tokenInvalid();

      // They proved control of the mailbox, so an old block no longer protects anything.
      await clearRateLimit(db, loginBucket(email.toLowerCase()));
    },
  };
};
