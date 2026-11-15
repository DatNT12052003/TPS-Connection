// Kiểm tra mã danh mục do client gửi (môn, khối lớp, tỉnh, xã) trước khi ghi, để trả lỗi 422 theo từng ô thay
// vì để khóa ngoại của database báo lỗi 500. Chỉ chấp nhận mục đang dùng (`is_active`).
import type { FieldError } from '@tps/shared';
import type { EntityManager } from 'typeorm';
import { AppError } from '../../lib/app-error.js';
import { AdministrativeArea } from './administrative-area.entity.js';
import { GradeLevel } from './grade-level.entity.js';

export interface CatalogRefs {
  gradeLevelId?: number | null | undefined;
  /** Kiểm tra cặp tỉnh – xã khi có `location`. */
  location?: { provinceId: number | null; communeId: number | null } | undefined;
  /** Danh sách môn × khối (hồ sơ gia sư). */
  teachingSubjects?: { subjectId: number; gradeLevelId: number }[] | undefined;
  /** Danh sách tỉnh hoặc xã (khu vực dạy của gia sư). */
  serviceAreaIds?: number[] | undefined;
}

/** Số id trong `ids` có trong bảng và đang dùng. */
async function countActive(
  manager: EntityManager,
  table: 'subjects' | 'grade_levels' | 'administrative_areas',
  ids: number[],
): Promise<number> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return 0;
  const [row] = await manager.query<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM ${table} WHERE id = ANY($1::int[]) AND is_active`,
    [unique],
  );
  return row?.n ?? 0;
}

const isSet = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined;

const fieldError = (path: string, code: string, message: string): FieldError => ({
  path,
  code,
  message,
});

/** Ném 422 `validation_failed` (kèm lỗi từng ô) nếu một mã danh mục không hợp lệ. */
export async function assertCatalogRefs(manager: EntityManager, refs: CatalogRefs): Promise<void> {
  const errors: FieldError[] = [];

  const gradeLevelId = refs.gradeLevelId;
  if (isSet(gradeLevelId)) {
    const exists = await manager
      .getRepository(GradeLevel)
      .existsBy({ id: gradeLevelId, isActive: true });
    if (!exists) errors.push(fieldError('gradeLevelId', 'unknown_option', 'Unknown grade level'));
  }

  const provinceId = refs.location?.provinceId;
  const communeId = refs.location?.communeId;
  if (isSet(provinceId)) {
    const areas = manager.getRepository(AdministrativeArea);
    const province = await areas.findOneBy({
      id: provinceId,
      level: 'province',
      isActive: true,
    });
    if (!province) {
      errors.push(fieldError('provinceId', 'unknown_option', 'Unknown province'));
    } else if (isSet(communeId)) {
      const commune = await areas.findOneBy({
        id: communeId,
        level: 'commune',
        isActive: true,
      });
      if (!commune) {
        errors.push(fieldError('communeId', 'unknown_option', 'Unknown commune'));
      } else if (commune.parentId !== province.id) {
        errors.push(
          fieldError('communeId', 'commune_not_in_province', 'Commune is not in the province'),
        );
      }
    }
  } else if (isSet(communeId)) {
    errors.push(fieldError('provinceId', 'province_required', 'Choose a province first'));
  }

  const pairs = refs.teachingSubjects ?? [];
  if (pairs.length > 0) {
    const subjectIds = pairs.map((p) => p.subjectId);
    const gradeIds = pairs.map((p) => p.gradeLevelId);
    if (
      (await countActive(manager, 'subjects', subjectIds)) !== new Set(subjectIds).size ||
      (await countActive(manager, 'grade_levels', gradeIds)) !== new Set(gradeIds).size
    ) {
      errors.push(fieldError('teachingSubjects', 'unknown_option', 'Unknown subject or grade'));
    }
  }

  const areaIds = refs.serviceAreaIds ?? [];
  if (
    areaIds.length > 0 &&
    (await countActive(manager, 'administrative_areas', areaIds)) !== new Set(areaIds).size
  ) {
    errors.push(fieldError('serviceAreaIds', 'unknown_option', 'Unknown area'));
  }

  if (errors.length > 0) {
    throw new AppError('validation_failed', 'Invalid catalog reference', errors);
  }
}
