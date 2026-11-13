// Đọc danh mục công khai qua API (`/api/v1/catalog/...`) cho loader. Chỉ chạy trên server.
import { CatalogArea, CatalogGradeLevel, catalogList, type Locale } from '@tps/shared';
import type { RouterContextProvider } from 'react-router';
import {
  type CatalogOption,
  catalogIdFrom,
  communeOption,
  gradeOption,
  provinceOption,
} from './catalog';
import { readPreferences } from './preferences';
import { getServerApi } from './server-api.server';

type Context = Readonly<RouterContextProvider>;

export async function loadGradeLevels(context: Context, locale: Locale): Promise<CatalogOption[]> {
  const { items } = await getServerApi(context).call('/api/v1/catalog/grade-levels', {
    schema: catalogList(CatalogGradeLevel),
  });
  return items.map((grade) => gradeOption(grade, locale));
}

export async function loadProvinces(context: Context, locale: Locale): Promise<CatalogOption[]> {
  const { items } = await getServerApi(context).call('/api/v1/catalog/provinces', {
    schema: catalogList(CatalogArea),
  });
  return items.map((area) => provinceOption(area, locale));
}

/**
 * Xã của tỉnh người dùng vừa chọn trong form (giá trị chuỗi), để hiện lại form khi action báo lỗi.
 * Tỉnh lạ hoặc API lỗi: danh sách rỗng (lỗi của form vẫn hiện bình thường).
 */
export async function communesFor(
  request: Request,
  context: Context,
  provinceId: string,
): Promise<CatalogOption[]> {
  const id = catalogIdFrom(provinceId);
  if (id === null || !Number.isInteger(id) || id <= 0) return [];
  const { locale } = await readPreferences(request);
  return loadCommunes(context, locale, id).catch(() => []);
}

/** Xã của một tỉnh; chưa chọn tỉnh thì danh sách rỗng. */
export async function loadCommunes(
  context: Context,
  locale: Locale,
  provinceId: number | null,
): Promise<CatalogOption[]> {
  if (provinceId === null) return [];
  const { items } = await getServerApi(context).call(
    `/api/v1/catalog/provinces/${provinceId}/communes`,
    { schema: catalogList(CatalogArea) },
  );
  return items.map((area) => communeOption(area, locale));
}
