import type { Logger } from 'pino';
import type { DataSource, EntityManager } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { hashToken, randomToken } from '../auth/tokens.js';
import type { Queryable } from '../db/queryable.js';
import type { Mailer } from '../email/mailer.js';
import { renderEmail, type Locale } from '../email/templates.js';
import type { OutboxEventType } from './outbox.js';

export const MAX_ATTEMPTS = 5;
const RETRY_BASE_SECONDS = 30;

const VERIFY_EMAIL_HOURS = 24;
const RESET_PASSWORD_MINUTES = 30;

export type OutboxDeps = {
  db: DataSource;
  mailer: Mailer;
  logger: Logger;
  webBaseUrl: string;
};

type Recipient = {
  id: string;
  email: string;
  locale: Locale;
  status: string;
  email_verified_at: Date | null;
};

/** Replaces any link already sent for this purpose, so only the newest one works. */
async function issueToken(
  db: Queryable,
  userId: string,
  purpose: 'verify_email' | 'reset_password',
  lifetimeMinutes: number,
): Promise<string> {
  await db.query(
    `UPDATE one_time_tokens SET used_at = now(), updated_at = now()
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose],
  );
  const token = randomToken();
  await db.query(
    `INSERT INTO one_time_tokens (id, user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
    [uuidv7(), userId, purpose, hashToken(token), lifetimeMinutes],
  );
  return token;
}

async function sendEmailEvent(
  db: EntityManager,
  deps: OutboxDeps,
  type: OutboxEventType,
  userId: string,
): Promise<void> {
  const rows: Recipient[] = await db.query(
    `SELECT id, email, locale, status, email_verified_at FROM users
      WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  const user = rows[0];
  // Deleted and locked accounts receive no ordinary email (AC-NOT-02.4).
  if (!user || user.status !== 'active') return;

  const { locale } = user;
  const link = (path: string) => `${deps.webBaseUrl}/${locale}${path}`;
  // The token sits in the fragment, which browsers never send to a server or a log.
  const tokenLink = (path: string, token: string) => link(`${path}#token=${token}`);

  let email;
  switch (type) {
    case 'email.verify_email': {
      if (user.email_verified_at) return;
      const token = await issueToken(db, user.id, 'verify_email', VERIFY_EMAIL_HOURS * 60);
      email = renderEmail(locale, {
        template: 'verify_email',
        link: tokenLink('/verify-email', token),
        hours: VERIFY_EMAIL_HOURS,
      });
      break;
    }
    case 'email.already_registered':
      email = renderEmail(locale, {
        template: 'already_registered',
        link: link('/forgot-password'),
      });
      break;
    case 'email.reset_password': {
      const token = await issueToken(db, user.id, 'reset_password', RESET_PASSWORD_MINUTES);
      email = renderEmail(locale, {
        template: 'reset_password',
        link: tokenLink('/reset-password', token),
        minutes: RESET_PASSWORD_MINUTES,
      });
      break;
    }
    case 'email.password_changed':
      email = renderEmail(locale, {
        template: 'password_changed',
        link: link('/forgot-password'),
      });
      break;
  }
  await deps.mailer.send({ to: user.email, ...email });
}

type DueEvent = { id: string; type: OutboxEventType; aggregate_id: string; attempts: number };

/** Handles one due event. Answers false when there was nothing to do. */
export async function processNextEvent(deps: OutboxDeps): Promise<boolean> {
  return deps.db.transaction(async (db) => {
    // SKIP LOCKED lets several Workers run without sending anything twice.
    const rows: DueEvent[] = await db.query(
      `SELECT id, type, aggregate_id, attempts FROM outbox_events
        WHERE processed_at IS NULL AND failed_at IS NULL AND next_attempt_at <= now()
        ORDER BY next_attempt_at, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
    );
    const event = rows[0];
    if (!event) return false;

    try {
      // Nested, so that a failed send also undoes the token created for it.
      await db.transaction((inner) => sendEmailEvent(inner, deps, event.type, event.aggregate_id));
      await db.query(`UPDATE outbox_events SET processed_at = now() WHERE id = $1`, [event.id]);
    } catch (error) {
      const attempts = event.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await db.query(
        `UPDATE outbox_events
            SET attempts = $2,
                failed_at = CASE WHEN $3 THEN now() END,
                next_attempt_at = now() + make_interval(secs => $4)
          WHERE id = $1`,
        [event.id, attempts, giveUp, RETRY_BASE_SECONDS * 2 ** event.attempts],
      );
      // The error's own text may quote the recipient, so log its name only (NFR-S09).
      const context = {
        eventId: event.id,
        type: event.type,
        attempts,
        error: (error as Error).name,
      };
      if (giveUp) deps.logger.error(context, 'Outbox event failed permanently');
      else deps.logger.warn(context, 'Outbox event failed, will retry');
    }
    return true;
  });
}

export async function drainOutbox(deps: OutboxDeps): Promise<number> {
  let handled = 0;
  while (await processNextEvent(deps)) handled += 1;
  return handled;
}
