// Danh mục đọc công khai (môn học, khối lớp, tỉnh, xã), cho các form hồ sơ. Chỉ trả mục đang dùng.
import { z } from 'zod';
import { AdministrativeUnitType, GradeStage } from '../statuses.js';

export const CatalogSubject = z.object({
  id: z.int(),
  code: z.string(),
  nameVi: z.string(),
  nameEn: z.string(),
});
export type CatalogSubject = z.infer<typeof CatalogSubject>;

export const CatalogGradeLevel = z.object({
  id: z.int(),
  code: z.string(),
  stage: GradeStage,
  nameVi: z.string(),
  nameEn: z.string(),
});
export type CatalogGradeLevel = z.infer<typeof CatalogGradeLevel>;

/** Tỉnh hoặc xã. `fullName` kèm loại đơn vị ("Phường Ba Đình"). */
export const CatalogArea = z.object({
  id: z.int(),
  code: z.string(),
  unitType: AdministrativeUnitType,
  name: z.string(),
  fullName: z.string(),
  nameEn: z.string().nullable(),
});
export type CatalogArea = z.infer<typeof CatalogArea>;

export const ProvinceIdParams = z.object({ provinceId: z.coerce.number().int().positive() });
export type ProvinceIdParams = z.infer<typeof ProvinceIdParams>;

export const catalogList = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });
