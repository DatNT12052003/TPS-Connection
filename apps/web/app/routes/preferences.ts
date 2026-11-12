// POST /preferences: lưu ngôn ngữ / chế độ màu vào cookie rồi quay lại trang đang xem.
import { Locale } from '@tps/shared';
import { redirect } from 'react-router';
import { safeRedirectPath, serializePreferences, ThemePreference } from '~/lib/preferences';
import type { Route } from './+types/preferences';

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const locale = Locale.safeParse(form.get('locale'));
  const theme = ThemePreference.safeParse(form.get('theme'));

  const headers = new Headers();
  const cookies = await serializePreferences({
    ...(locale.success && { locale: locale.data }),
    ...(theme.success && { theme: theme.data }),
  });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);

  return redirect(safeRedirectPath(form.get('redirectTo')), { headers });
}

export function loader() {
  return redirect('/');
}
