import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { Env } from '../config/env.js';

export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;

export type AuthConfig = {
  secret: string;
  /** False only for local development over plain HTTP. */
  cookieSecure: boolean;
};

export function authConfigFromEnv(env: Env): AuthConfig {
  if (!env.AUTH_SECRET) throw new Error('AUTH_SECRET is required');
  return { secret: env.AUTH_SECRET, cookieSecure: env.NODE_ENV === 'production' };
}

export type AccessClaims = { userId: string; sessionId: string; familyId: string };

// Separate keys, so a value made for one purpose is never valid for another.
const deriveKey = (config: AuthConfig, purpose: string) =>
  createHmac('sha256', config.secret).update(purpose).digest();

const signingKey = (config: AuthConfig) => deriveKey(config, 'access-token');

export const signAccessToken = (claims: AccessClaims, config: AuthConfig): Promise<string> =>
  new SignJWT({ sid: claims.sessionId, fam: claims.familyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_SECONDS}s`)
    .sign(signingKey(config));

export async function verifyAccessToken(
  token: string,
  config: AuthConfig,
): Promise<AccessClaims | undefined> {
  try {
    const { payload } = await jwtVerify(token, signingKey(config), { algorithms: ['HS256'] });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.fam !== 'string'
    ) {
      return undefined;
    }
    return { userId: payload.sub, sessionId: payload.sid, familyId: payload.fam };
  } catch {
    return undefined;
  }
}

/** Tied to the sign-in, so a token from one account is useless against another. */
export const csrfTokenFor = (familyId: string, config: AuthConfig): string =>
  createHmac('sha256', deriveKey(config, 'csrf')).update(familyId).digest('base64url');

export function csrfMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const randomToken = (): string => randomBytes(32).toString('base64url');

/** These tokens are long and random, so a fast hash is safe here, unlike for passwords. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
