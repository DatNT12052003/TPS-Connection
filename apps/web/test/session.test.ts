import { describe, expect, it } from 'vitest';
import { toFormResult } from '~/lib/form-errors';
import { relaySetCookies, safeNextPath } from '~/lib/session.server';

describe('safeNextPath', () => {
  it.each(['/vi/account', '/en/account?tab=1'])('keeps a path on this site: %s', (next) => {
    expect(safeNextPath(next, '/fallback')).toBe(next);
  });

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
  ])('refuses anything that could leave this site: %s', (next) => {
    expect(safeNextPath(next, '/fallback')).toBe('/fallback');
  });
});

describe('relaySetCookies', () => {
  it('passes on every cookie separately', () => {
    const upstream = new Headers();
    upstream.append('Set-Cookie', 'tps_access=a; HttpOnly');
    upstream.append('Set-Cookie', 'tps_refresh=b; HttpOnly');
    const relayed = relaySetCookies(new Response(null, { headers: upstream }));
    expect(relayed.getSetCookie()).toEqual(['tps_access=a; HttpOnly', 'tps_refresh=b; HttpOnly']);
  });
});

describe('toFormResult', () => {
  it('maps API field errors to the named field', () => {
    const result = toFormResult({
      code: 'INVALID_INPUT',
      fields: [
        { path: 'body.password', code: 'PASSWORD_TOO_COMMON' },
        { path: 'body.email', code: 'INVALID_FORMAT' },
      ],
    });
    expect(result.fieldErrors).toEqual({
      password: 'fieldError.passwordCommon',
      email: 'fieldError.email',
    });
    expect(result.formError).toBeUndefined();
  });

  it('words known codes and falls back for new ones', () => {
    expect(toFormResult({ code: 'ACCOUNT_LOCKED', fields: [] }).formError).toBe(
      'code.ACCOUNT_LOCKED',
    );
    expect(toFormResult({ code: 'SOMETHING_NEW', fields: [] }).formError).toBe('code.DEFAULT');
    expect(toFormResult(undefined).formError).toBe('code.DEFAULT');
  });
});
