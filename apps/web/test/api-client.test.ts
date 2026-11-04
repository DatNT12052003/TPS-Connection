import { describe, expect, it, vi } from 'vitest';
import { formApi, publicApi, userApi } from '~/lib/api.server';

const fakeFetch = () =>
  vi.fn<(request: Request) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );

const sentRequest = (mock: ReturnType<typeof fakeFetch>) => mock.mock.calls[0]?.[0] as Request;

const incoming = new Request('http://web.test/vi', {
  headers: { cookie: 'session=abc', 'x-forwarded-for': '203.0.113.9' },
});

describe('API clients', () => {
  it('forwards the caller cookie on user requests, and nothing else from the browser', async () => {
    const fetchMock = fakeFetch();
    await userApi(incoming, fetchMock as unknown as typeof fetch).GET('/api/v1/catalog/subjects');
    const sent = sentRequest(fetchMock);
    expect(sent.headers.get('cookie')).toBe('session=abc');
    expect(sent.headers.get('x-forwarded-for')).toBeNull();
  });

  it('takes the CSRF token from the form, not from the cookie', async () => {
    const fetchMock = fakeFetch();
    const request = new Request('http://web.test/vi', {
      headers: { cookie: 'tps_csrf=from-cookie' },
    });
    const form = new FormData();
    form.set('csrf', 'from-form');
    await formApi(request, form, fetchMock as unknown as typeof fetch).GET(
      '/api/v1/catalog/subjects',
    );
    expect(sentRequest(fetchMock).headers.get('x-csrf-token')).toBe('from-form');

    const forged = fakeFetch();
    await formApi(request, new FormData(), forged as unknown as typeof fetch).GET(
      '/api/v1/catalog/subjects',
    );
    expect(sentRequest(forged).headers.get('x-csrf-token')).toBe('');
  });

  it('never sends a cookie from the public client', async () => {
    const fetchMock = fakeFetch();
    await publicApi(fetchMock as unknown as typeof fetch).GET('/api/v1/catalog/subjects');
    expect(sentRequest(fetchMock).headers.get('cookie')).toBeNull();
  });
});
