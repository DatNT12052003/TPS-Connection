import { describe, expect, it } from 'vitest';
import { toFormResult } from '~/lib/form-errors';
import {
  csrfTokenOf,
  pagePathOf,
  redirectToRefresh,
  relaySetCookies,
  safeNextPath,
} from '~/lib/session.server';

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

describe('csrfTokenOf', () => {
  it('reads the token among other cookies', () => {
    const request = new Request('http://web.test', {
      headers: { cookie: 'a=1; tps_csrf=abc-_123; b=2' },
    });
    expect(csrfTokenOf(request)).toBe('abc-_123');
  });

  it('answers empty when there is none', () => {
    expect(csrfTokenOf(new Request('http://web.test'))).toBe('');
  });
});

describe('pagePathOf', () => {
  it.each([
    ['http://web.test/vi/account', '/vi/account'],
    ['http://web.test/vi/account?page=2', '/vi/account?page=2'],
    ['http://web.test/vi/account.data', '/vi/account'],
    ['http://web.test/vi/account.data?_routes=routes%2Faccount', '/vi/account'],
    ['http://web.test/vi/account/students.data?page=2&_routes=x', '/vi/account/students?page=2'],
    ['http://web.test/vi?index', '/vi'],
    ['http://web.test/_root.data', '/'],
  ])('%s is the page %s', (url, page) => {
    expect(pagePathOf(new Request(url))).toBe(page);
  });

  it('never sends a person back to an internal data address', () => {
    const response = redirectToRefresh(new Request('http://web.test/vi/account/students/1.data'));
    const target = response.headers.get('location') ?? '';
    expect(decodeURIComponent(target)).toContain('next=/vi/account/students/1');
    expect(decodeURIComponent(target)).not.toContain('.data');
  });
});
