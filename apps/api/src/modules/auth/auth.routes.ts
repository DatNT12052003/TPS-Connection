import type { DataSource } from 'typeorm';
import { z } from 'zod';
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from '../../auth/cookies.js';
import { passwordSchema } from '../../auth/password.js';
import type { AuthConfig } from '../../auth/tokens.js';
import { unauthorized } from '../../http/errors.js';
import { defineRoute } from '../../http/route.js';
import { publicAccess } from '../../policies/policy.js';
import { authService } from './auth.service.js';

const emailSchema = z
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());
const localeSchema = z.enum(['vi', 'en']);
const tokenSchema = z.string().min(1).max(256);

const accepted = z.object({ status: z.literal('accepted') });
const ok = z.object({ status: z.literal('ok') });

const accountDto = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(['tutor', 'parent', 'student', 'manager', 'admin']),
  locale: localeSchema,
  emailVerified: z.boolean(),
});

export const authRoutes = (db: DataSource, config: AuthConfig) => {
  const service = authService(db, config);

  return [
    defineRoute({
      method: 'post',
      path: '/auth/register',
      summary: 'Sign up as a tutor or a parent',
      tag: 'Auth',
      input: {
        body: z.object({
          role: z.enum(['tutor', 'parent']),
          email: emailSchema,
          password: passwordSchema,
          displayName: z.string().trim().min(1).max(100),
          locale: localeSchema,
          acceptedTerms: z.literal(true),
        }),
      },
      policy: publicAccess,
      output: accepted,
      successStatus: 202,
      // Same answer whether or not the email is taken (AC-ACC-01.4).
      handler: async ({ body }) => {
        await service.register(body);
        return { status: 'accepted' as const };
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/email-verification/confirm',
      summary: 'Confirm an email address with the emailed token',
      tag: 'Auth',
      input: { body: z.object({ token: tokenSchema }) },
      policy: publicAccess,
      output: ok,
      handler: async ({ body }) => {
        await service.confirmEmail(body.token);
        return { status: 'ok' as const };
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/email-verification/resend',
      summary: 'Send a new verification link, replacing any earlier one',
      tag: 'Auth',
      input: { body: z.object({ email: emailSchema }) },
      policy: publicAccess,
      output: accepted,
      successStatus: 202,
      handler: async ({ body }) => {
        await service.resendVerification(body.email);
        return { status: 'accepted' as const };
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/login',
      summary: 'Sign in',
      tag: 'Auth',
      input: { body: z.object({ email: emailSchema, password: z.string().min(1).max(128) }) },
      policy: publicAccess,
      output: accountDto,
      handler: async ({ body, cookies }) => {
        const { account, session } = await service.login(body.email, body.password);
        setSessionCookies(cookies, config, session);
        return account;
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/refresh',
      summary: 'Exchange the refresh cookie for new session cookies',
      tag: 'Auth',
      policy: publicAccess,
      output: ok,
      handler: async ({ cookies }) => {
        const token = cookies.get(REFRESH_COOKIE);
        const session = token ? await service.refresh(token) : undefined;
        if (!session) {
          clearSessionCookies(cookies, config);
          throw unauthorized();
        }
        setSessionCookies(cookies, config, session);
        return { status: 'ok' as const };
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/logout',
      summary: 'End the current session',
      tag: 'Auth',
      policy: publicAccess,
      output: ok,
      handler: async ({ cookies }) => {
        const token = cookies.get(REFRESH_COOKIE);
        if (token) await service.logout(token);
        clearSessionCookies(cookies, config);
        return { status: 'ok' as const };
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/password/forgot',
      summary: 'Email a password reset link if the account exists',
      tag: 'Auth',
      input: { body: z.object({ email: emailSchema }) },
      policy: publicAccess,
      output: accepted,
      successStatus: 202,
      handler: async ({ body }) => {
        await service.requestPasswordReset(body.email);
        return { status: 'accepted' as const };
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/password/reset',
      summary: 'Set a new password with the emailed token and end all sessions',
      tag: 'Auth',
      input: { body: z.object({ token: tokenSchema, newPassword: passwordSchema }) },
      policy: publicAccess,
      output: ok,
      handler: async ({ body }) => {
        await service.resetPassword(body.token, body.newPassword);
        return { status: 'ok' as const };
      },
    }),
  ];
};
