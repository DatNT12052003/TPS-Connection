import { redirect } from 'react-router';
import type { Route } from './+types/session-refresh';
import { userApi } from '~/lib/api.server';
import { DEFAULT_LOCALE, isLocale } from '~/lib/i18n';
import { relaySetCookies, safeNextPath } from '~/lib/session.server';

export async function loader({ request }: Route.LoaderArgs) {
  const next = new URL(request.url).searchParams.get('next');
  const prefix = next?.split('/')[1];
  const locale = isLocale(prefix) ? prefix : DEFAULT_LOCALE;

  const { response } = await userApi(request).POST('/api/v1/auth/refresh');
  const headers = relaySetCookies(response);
  if (!response.ok) return redirect(`/${locale}/login`, { headers });
  return redirect(safeNextPath(next, `/${locale}/account`), { headers });
}
