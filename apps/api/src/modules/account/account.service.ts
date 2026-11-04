import type { DataSource } from 'typeorm';
import { databaseAuditWriter } from '../../audit/audit-writer.js';
import type { Role } from '../../auth/actor.js';
import { assertPasswordAllowed, hashPassword, verifyPassword } from '../../auth/password.js';
import { clearRateLimit, consumeRateLimit, type RateLimit } from '../../auth/rate-limit.js';
import { hashToken } from '../../auth/tokens.js';
import { returnedRows } from '../../db/queryable.js';
import type { Locale } from '../../email/templates.js';
import { ApiError, notFound, tooManyRequests } from '../../http/errors.js';
import { enqueueEvent } from '../../outbox/outbox.js';

const PASSWORD_CHECK_LIMIT: RateLimit = { limit: 5, windowSeconds: 15 * 60 };
const EMAIL_CHANGE_LIMIT: RateLimit = { limit: 3, windowSeconds: 60 * 60 };

const isUniqueViolation = (error: unknown) =>
  (error as { driverError?: { code?: string } }).driverError?.code === '23505';

const invalidField = (path: string, code: string) =>
  new ApiError(400, 'INVALID_INPUT', 'Invalid input', [{ path, code }]);

export type ProfileRow = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  locale: Locale;
  email_verified: boolean;
  phone: string | null;
  avatar_file_id: string | null;
};

export const accountService = (db: DataSource) => {
  /** A stolen session must not be able to guess the password that protects these changes. */
  async function assertCurrentPassword(userId: string, password: string): Promise<void> {
    const bucket = `password-check:${userId}`;
    const gate = await consumeRateLimit(db, bucket, PASSWORD_CHECK_LIMIT);
    if (!gate.allowed) throw tooManyRequests('TOO_MANY_REQUESTS', gate.retryAfterSeconds);

    const rows: { password_hash: string }[] = await db.query(
      `SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    if (!(await verifyPassword(rows[0]?.password_hash, password))) {
      throw invalidField('body.currentPassword', 'WRONG_PASSWORD');
    }
    await clearRateLimit(db, bucket);
  }

  return {
    async findProfile(userId: string): Promise<ProfileRow> {
      const rows: ProfileRow[] = await db.query(
        `SELECT u.id, u.email, u.display_name, r.role, u.locale, u.phone, u.avatar_file_id,
                u.email_verified_at IS NOT NULL AS email_verified
           FROM users u JOIN user_roles r ON r.user_id = u.id
          WHERE u.id = $1 AND u.deleted_at IS NULL
          LIMIT 1`,
        [userId],
      );
      if (!rows[0]) throw notFound();
      return rows[0];
    },

    async updateProfile(
      userId: string,
      changes: {
        displayName?: string;
        phone?: string | null;
        locale?: Locale;
        avatarFileId?: string | null;
      },
    ): Promise<void> {
      await db.transaction(async (tx) => {
        if (changes.avatarFileId) {
          // Must be this caller's own finished avatar, whatever ID was sent.
          const usable: unknown[] = await tx.query(
            `SELECT 1 FROM files
              WHERE id = $1 AND owner_user_id = $2 AND purpose = 'avatar'
                AND completed_at IS NOT NULL AND deleted_at IS NULL`,
            [changes.avatarFileId, userId],
          );
          if (usable.length === 0) throw invalidField('body.avatarFileId', 'FILE_NOT_USABLE');
        }
        if (changes.avatarFileId !== undefined) {
          // The Worker removes the object.
          await tx.query(
            `UPDATE files SET deleted_at = now(), updated_at = now()
              WHERE id = (SELECT avatar_file_id FROM users WHERE id = $1)
                AND id IS DISTINCT FROM $2`,
            [userId, changes.avatarFileId],
          );
        }
        await tx.query(
          `UPDATE users
              SET display_name = COALESCE($2, display_name),
                  phone = CASE WHEN $3 THEN $4 ELSE phone END,
                  locale = COALESCE($5, locale),
                  avatar_file_id = CASE WHEN $6 THEN $7::uuid ELSE avatar_file_id END,
                  updated_at = now()
            WHERE id = $1`,
          [
            userId,
            changes.displayName ?? null,
            changes.phone !== undefined,
            changes.phone ?? null,
            changes.locale ?? null,
            changes.avatarFileId !== undefined,
            changes.avatarFileId ?? null,
          ],
        );
      });
    },

    async changePassword(
      userId: string,
      currentFamilyId: string,
      currentPassword: string,
      newPassword: string,
    ): Promise<void> {
      assertPasswordAllowed(newPassword, 'body.newPassword');
      await assertCurrentPassword(userId, currentPassword);
      const passwordHash = await hashPassword(newPassword);
      await db.transaction(async (tx) => {
        await tx.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
          userId,
          passwordHash,
        ]);
        // This device stays signed in; every other one does not.
        await tx.query(
          `UPDATE user_sessions SET revoked_at = now(), updated_at = now()
            WHERE user_id = $1 AND family_id <> $2 AND revoked_at IS NULL`,
          [userId, currentFamilyId],
        );
        await enqueueEvent(tx, 'email.password_changed', userId);
        await databaseAuditWriter(tx)(
          { kind: 'user', userId },
          { action: 'account.password.changed', targetType: 'user', targetId: userId },
        );
      });
    },

    /**
     * The address does not change until the new mailbox confirms (AC-ACC-05.2).
     * The answer never says whether the new address is taken: its owner is told instead.
     */
    async requestEmailChange(
      userId: string,
      newEmail: string,
      currentPassword: string,
    ): Promise<void> {
      await assertCurrentPassword(userId, currentPassword);
      const gate = await consumeRateLimit(db, `email-change:${userId}`, EMAIL_CHANGE_LIMIT);
      if (!gate.allowed) throw tooManyRequests('TOO_MANY_REQUESTS', gate.retryAfterSeconds);

      const rows: { id: string }[] = await db.query(
        `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [newEmail],
      );
      const holder = rows[0]?.id;
      if (holder === userId) throw invalidField('body.newEmail', 'EMAIL_UNCHANGED');

      await db.transaction(async (tx) => {
        if (holder) {
          await enqueueEvent(tx, 'email.already_registered', holder);
        } else {
          await enqueueEvent(tx, 'email.change_email', userId, { newEmail });
        }
        await enqueueEvent(tx, 'email.email_change_requested', userId);
        await databaseAuditWriter(tx)(
          { kind: 'user', userId },
          { action: 'account.email_change.requested', targetType: 'user', targetId: userId },
        );
      });
    },

    async confirmEmailChange(token: string): Promise<void> {
      const refused = () =>
        new ApiError(422, 'TOKEN_INVALID_OR_EXPIRED', 'Token is invalid or has expired');
      try {
        await db.transaction(async (tx) => {
          const tokens = returnedRows<{ user_id: string; payload: { newEmail?: string } }>(
            await tx.query(
              `UPDATE one_time_tokens SET used_at = now(), updated_at = now()
                WHERE token_hash = $1 AND purpose = 'change_email'
                  AND used_at IS NULL AND expires_at > now()
                RETURNING user_id, payload`,
              [hashToken(token)],
            ),
          );
          const found = tokens[0];
          if (!found?.payload.newEmail) throw refused();
          const users = returnedRows<{ id: string }>(
            await tx.query(
              `UPDATE users SET email = $2, email_verified_at = now(), updated_at = now()
                WHERE id = $1 AND deleted_at IS NULL
                RETURNING id`,
              [found.user_id, found.payload.newEmail],
            ),
          );
          if (!users[0]) throw refused();
          await databaseAuditWriter(tx)(
            { kind: 'user', userId: found.user_id },
            {
              action: 'account.email_change.confirmed',
              targetType: 'user',
              targetId: found.user_id,
            },
          );
        });
      } catch (error) {
        // Someone registered that address after the link was sent.
        if (isUniqueViolation(error)) throw refused();
        throw error;
      }
    },
  };
};
