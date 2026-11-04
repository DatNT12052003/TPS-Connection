import createClient from 'openapi-fetch';
import type { paths } from '~/api/schema';

// The .server suffix keeps this module, and API_URL, out of the browser bundle.
const baseUrl = () => process.env.API_URL ?? 'http://localhost:4000';

/**
 * For public pages. Sends no user credentials, so responses are safe to cache
 * and can never contain one user's data on a page served to another.
 */
export const publicApi = (fetchImpl: typeof fetch = fetch) =>
  createClient<paths>({ baseUrl: baseUrl(), fetch: fetchImpl });

/** For signed-in pages. Forwards only the caller's own cookie to the API. */
export const userApi = (request: Request, fetchImpl: typeof fetch = fetch) => {
  const cookie = request.headers.get('cookie');
  return createClient<paths>({
    baseUrl: baseUrl(),
    fetch: fetchImpl,
    headers: cookie ? { cookie } : {},
  });
};
