// POST /preferences: lưu ngôn ngữ / chế độ màu vào cookie rồi quay lại trang đang xem. Đang đăng nhập thì
// ngôn ngữ cũng được lưu vào tài khoản (PATCH /me), để email gửi đúng ngôn ngữ người dùng chọn.
import { AccountProfile, Locale } from '@tps/shared';
import { redirect } from 'react-router';
import { safeRedirectPath, serializePreferences, ThemePreference } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { getCurrentUserOrNull } from '~/lib/session.server';
import type { Route } from './+types/preferences';

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const locale = Locale.safeParse(form.get('locale'));
  const theme = ThemePreference.safeParse(form.get('theme'));

  if (locale.success && (await getCurrentUserOrNull(context))) {
    try {
      await getServerApi(context).call('/api/v1/me', {
        method: 'PATCH',
        body: { locale: locale.data },
        schema: AccountProfile,
      });
    } catch {
      // Không lưu được vào tài khoản thì vẫn đổi ngôn ngữ giao diện (cookie); lần sau chọn lại sẽ lưu.
    }
  }

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
