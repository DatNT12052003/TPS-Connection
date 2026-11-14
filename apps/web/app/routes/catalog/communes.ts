// GET /catalog/provinces/:provinceId/communes: route chỉ có dữ liệu. Ô chọn xã gọi bằng useFetcher khi
// người dùng đổi tỉnh (chưa tải JavaScript thì form vẫn dùng được: API báo lỗi nếu xã không thuộc tỉnh).
import { ProvinceIdParams } from '@tps/shared';
import { data } from 'react-router';
import { loadCommunes } from '~/lib/catalog.server';
import { readPreferences } from '~/lib/preferences';
import type { Route } from './+types/communes';

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const parsed = ProvinceIdParams.safeParse(params);
  if (!parsed.success) throw data(null, { status: 404 });
  const { locale } = await readPreferences(request);
  return { items: await loadCommunes(context, locale, parsed.data.provinceId) };
}
