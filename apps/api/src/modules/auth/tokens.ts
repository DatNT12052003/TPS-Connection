// Access token (JWT HS256, ngắn hạn) và refresh token (chuỗi ngẫu nhiên, chỉ lưu hash ở database).
import { createHash, randomBytes } from 'node:crypto';
import { AUTH_TOKEN_TTL } from '@tps/shared';
import jwt from 'jsonwebtoken';

const ISSUER = 'tps-api';
const AUDIENCE = 'tps';

export interface AccessTokenClaims {
  /** user id */
  userId: string;
  /** family id của chuỗi refresh token đã sinh ra access token này (để đăng xuất đúng phiên). */
  sessionFamilyId: string;
}

export interface TokenService {
  signAccessToken(claims: AccessTokenClaims): { token: string; expiresAt: Date };
  /** Trả claims nếu token hợp lệ (đúng chữ ký, issuer, audience, còn hạn); không thì null. */
  verifyAccessToken(token: string): AccessTokenClaims | null;
}

export function createTokenService(options: {
  secret: string;
  now?: () => Date;
  accessTtlSeconds?: number;
}): TokenService {
  const now = options.now ?? (() => new Date());
  const ttl = options.accessTtlSeconds ?? AUTH_TOKEN_TTL.accessSeconds;

  return {
    signAccessToken({ userId, sessionFamilyId }) {
      const issuedAt = Math.floor(now().getTime() / 1000);
      const token = jwt.sign({ sid: sessionFamilyId, iat: issuedAt }, options.secret, {
        algorithm: 'HS256',
        subject: userId,
        issuer: ISSUER,
        audience: AUDIENCE,
        expiresIn: ttl,
      });
      return { token, expiresAt: new Date((issuedAt + ttl) * 1000) };
    },
    verifyAccessToken(token) {
      try {
        const payload = jwt.verify(token, options.secret, {
          algorithms: ['HS256'],
          issuer: ISSUER,
          audience: AUDIENCE,
          clockTimestamp: Math.floor(now().getTime() / 1000),
        });
        if (typeof payload === 'string' || !payload.sub || typeof payload.sid !== 'string') {
          return null;
        }
        return { userId: payload.sub, sessionFamilyId: payload.sid };
      } catch {
        return null;
      }
    },
  };
}

/** Refresh token: 256 bit ngẫu nhiên. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash lưu ở `auth_sessions.refresh_token_hash`. SHA-256 là đủ (không cần argon2) vì token có 256 bit
 * ngẫu nhiên, không dò được như mật khẩu.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
