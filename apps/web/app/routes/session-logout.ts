import { redirect } from 'react-router';
import type { Route } from './+types/session-logout';
import { userApi } from '~/lib/api.server';
import { DEFAULT_LOCALE, isLocale } from '~/lib/i18n';
import { relaySetCookies } from '~/lib/session.server';

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const lang = form.get('lang');
  const locale = typeof lang === 'string' && isLocale(lang) ? lang : DEFAULT_LOCALE;

  const { response } = await userApi(request).POST('/api/v1/auth/logout');
  return redirect(`/${locale}`, { headers: relaySetCookies(response) });
}
