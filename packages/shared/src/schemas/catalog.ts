// Danh mục đọc công khai (môn học, khối lớp, tỉnh, xã), cho các form hồ sơ. Chỉ trả mục đang dùng.
import { z } from 'zod';
import { AdministrativeLevel, AdministrativeUnitType, GradeStage } from '../statuses.js';

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

/** Giới hạn số id trong một lần tra cứu khu vực. */
export const AREA_LOOKUP_MAX = 50;

/**
 * GET /catalog/areas?ids=1,2,3: tra tên các tỉnh/xã theo id (ví dụ khu vực dạy đã lưu của gia sư). Id cách
 * nhau bằng dấu phẩy, không trùng, tối đa AREA_LOOKUP_MAX.
 */
export const AreaLookupQuery = z.object({
  ids: z
    .string()
    .transform((value) => value.split(',').map((part) => part.trim()))
    .pipe(
      z
        .array(
          z
            .string()
            .regex(/^[1-9]\d{0,8}$/, { error: 'invalid' })
            .transform(Number),
        )
        .min(1, { error: 'required' })
        .max(AREA_LOOKUP_MAX, { error: 'too_many' }),
    ),
});
export type AreaLookupQuery = z.infer<typeof AreaLookupQuery>;

/** Khu vực kèm cấp và tỉnh chứa nó (`parentId` của xã; tỉnh thì null). */
export const CatalogAreaRef = CatalogArea.extend({
  level: AdministrativeLevel,
  parentId: z.int().nullable(),
});
export type CatalogAreaRef = z.infer<typeof CatalogAreaRef>;
