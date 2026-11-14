import { describe, expect, it } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { createTokenService, generateRefreshToken, hashRefreshToken } from './tokens.js';

const SECRET = 'a-test-secret-that-is-at-least-32-chars';
const claims = { userId: '0195f3c4-0000-7000-8000-000000000001', sessionFamilyId: 'family-1' };

describe('access tokens', () => {
  it('round-trip the user and session family', () => {
    const tokens = createTokenService({ secret: SECRET });
    const { token, expiresAt } = tokens.signAccessToken(claims);
    expect(tokens.verifyAccessToken(token)).toEqual(claims);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000);
  });

  it('reject an expired token', () => {
    let now = new Date('2026-11-13T08:00:00Z');
    const tokens = createTokenService({ secret: SECRET, now: () => now });
    const { token } = tokens.signAccessToken(claims);
    now = new Date('2026-11-13T08:15:01Z');
    expect(tokens.verifyAccessToken(token)).toBeNull();
  });

  it('reject a token signed with another secret, tampered, or for another audience', () => {
    const tokens = createTokenService({ secret: SECRET });
    const other = createTokenService({ secret: 'another-secret-that-is-32-chars-long!!' });
    expect(tokens.verifyAccessToken(other.signAccessToken(claims).token)).toBeNull();

    const { token } = tokens.signAccessToken(claims);
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'someone-else', sid: 'x' })).toString(
      'base64url',
    );
    expect(tokens.verifyAccessToken(`${header}.${forgedPayload}.${signature}`)).toBeNull();

    const foreign = jwt.sign({ sid: 'x' }, SECRET, {
      subject: 'u',
      audience: 'other',
      issuer: 'tps-api',
    });
    expect(tokens.verifyAccessToken(foreign)).toBeNull();
  });

  it('reject the "none" algorithm', () => {
    const tokens = createTokenService({ secret: SECRET });
    const unsigned = jwt.sign({ sid: 'x' }, '', {
      algorithm: 'none',
      subject: claims.userId,
      audience: 'tps',
      issuer: 'tps-api',
    });
    expect(tokens.verifyAccessToken(unsigned)).toBeNull();
  });
});

describe('refresh tokens', () => {
  it('are random and stored only as a hash', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashRefreshToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(a)).toBe(hashRefreshToken(a));
    expect(hashRefreshToken(a)).not.toContain(a);
  });
});
