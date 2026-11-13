// Danh mục (khối lớp, tỉnh, xã) ở dạng gọn cho form và trang: chỉ id + nhãn theo ngôn ngữ đang dùng.
// Dùng được cả ở server lẫn trình duyệt.
import type { CatalogArea, CatalogGradeLevel, Locale } from '@tps/shared';

export interface CatalogOption {
  id: number;
  label: string;
}

export const gradeOption = (grade: CatalogGradeLevel, locale: Locale): CatalogOption => ({
  id: grade.id,
  label: locale === 'en' ? grade.nameEn : grade.nameVi,
});

/** Tỉnh: tên ngắn ("Hà Nội"). Xã: kèm loại đơn vị ("Phường Ba Đình") vì nhiều xã trùng tên ngắn. */
export const provinceOption = (area: CatalogArea, locale: Locale): CatalogOption => ({
  id: area.id,
  label: (locale === 'en' && area.nameEn) || area.name,
});

export const communeOption = (area: CatalogArea, locale: Locale): CatalogOption => ({
  id: area.id,
  label: (locale === 'en' && area.nameEn) || area.fullName,
});

/** Nhãn của một id trong danh mục; không có (đã ngừng dùng) thì undefined. */
export const labelOf = (options: readonly CatalogOption[], id: number | null | undefined) =>
  id === null || id === undefined ? undefined : options.find((o) => o.id === id)?.label;

/** Id danh mục từ ô chọn của form: chuỗi rỗng là chưa chọn (null). Giá trị lạ thì để API báo lỗi. */
export function catalogIdFrom(value: string): number | null {
  if (value.trim() === '') return null;
  const id = Number(value);
  return Number.isInteger(id) ? id : Number.NaN;
}
