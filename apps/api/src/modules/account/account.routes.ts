import type { DataSource } from 'typeorm';
import { z } from 'zod';
import type { UserActor } from '../../auth/actor.js';
import { passwordSchema } from '../../auth/password.js';
import type { FileStore } from '../../files/file-store.js';
import { defineRoute } from '../../http/route.js';
import { ownAccount, publicAccess } from '../../policies/policy.js';
import { filesService } from '../files/files.service.js';
import { accountService, type ProfileRow } from './account.service.js';

const localeSchema = z.enum(['vi', 'en']);
const emailSchema = z
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

const meDto = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(['tutor', 'parent', 'student', 'manager', 'admin']),
  locale: localeSchema,
  emailVerified: z.boolean(),
  /** Self-declared: clients must label it so wherever it is shown (BR-108). */
  phone: z.string().nullable(),
  /** Signed and short-lived. Ask again rather than store it. */
  avatarUrl: z.string().nullable(),
});

const ok = z.object({ status: z.literal('ok') });
const accepted = z.object({ status: z.literal('accepted') });

const self = (actor: unknown) => actor as UserActor;

export const accountRoutes = (db: DataSource, store: FileStore) => {
  const service = accountService(db);
  const files = filesService(db, store);

  const toMe = async (row: ProfileRow) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    locale: row.locale,
    emailVerified: row.email_verified,
    phone: row.phone,
    avatarUrl: await files.avatarUrl(row.avatar_file_id),
  });

  return [
    defineRoute({
      method: 'get',
      path: '/me',
      summary: 'Get the signed-in account',
      tag: 'Account',
      policy: ownAccount,
      // People who have not verified yet need this to be reminded (AC-ACC-02.2).
      allowUnverifiedEmail: true,
      output: meDto,
      handler: async ({ actor }) => toMe(await service.findProfile(self(actor).userId)),
    }),

    defineRoute({
      method: 'patch',
      path: '/me',
      summary: 'Change display name, phone, language or avatar',
      tag: 'Account',
      input: {
        // Strict: a role or an email sent here is refused, not ignored (AC-ACC-05.1).
        body: z.strictObject({
          displayName: z.string().trim().min(1).max(100).optional(),
          phone: z
            .string()
            .trim()
            .regex(/^\+?[0-9][0-9 .-]{7,19}$/)
            .nullable()
            .optional(),
          locale: localeSchema.optional(),
          avatarFileId: z.uuid().nullable().optional(),
        }),
      },
      policy: ownAccount,
      allowUnverifiedEmail: true,
      output: meDto,
      handler: async ({ actor, body }) => {
        const { userId } = self(actor);
        await service.updateProfile(userId, body);
        return toMe(await service.findProfile(userId));
      },
    }),

    defineRoute({
      method: 'post',
      path: '/me/password',
      summary: 'Change the password and sign out every other session',
      tag: 'Account',
      input: {
        body: z.strictObject({
          currentPassword: z.string().min(1).max(128),
          newPassword: passwordSchema,
        }),
      },
      policy: ownAccount,
      allowUnverifiedEmail: true,
      output: ok,
      handler: async ({ actor, body }) => {
        const { userId, familyId } = self(actor);
        await service.changePassword(userId, familyId, body.currentPassword, body.newPassword);
        return { status: 'ok' as const };
      },
    }),

    defineRoute({
      method: 'post',
      path: '/me/email-change',
      summary: 'Ask to change the email; takes effect when the new address confirms',
      tag: 'Account',
      input: {
        body: z.strictObject({
          newEmail: emailSchema,
          currentPassword: z.string().min(1).max(128),
        }),
      },
      policy: ownAccount,
      // Lets someone who mistyped their address at sign-up correct it.
      allowUnverifiedEmail: true,
      output: accepted,
      successStatus: 202,
      handler: async ({ actor, body }) => {
        await service.requestEmailChange(self(actor).userId, body.newEmail, body.currentPassword);
        return { status: 'accepted' as const };
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/email-change/confirm',
      summary: 'Confirm a new email address with the emailed token',
      tag: 'Auth',
      input: { body: z.strictObject({ token: z.string().min(1).max(256) }) },
      policy: publicAccess,
      output: ok,
      handler: async ({ body }) => {
        await service.confirmEmailChange(body.token);
        return { status: 'ok' as const };
      },
    }),
  ];
};
