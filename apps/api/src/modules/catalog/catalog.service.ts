// Đọc danh mục công khai (môn học, khối lớp, tỉnh, xã) cho các form hồ sơ. Chỉ trả mục đang dùng.
// Không phụ thuộc Express.
import type { CatalogArea, CatalogAreaRef, CatalogGradeLevel, CatalogSubject } from '@tps/shared';
import { type DataSource, In } from 'typeorm';
import { notFound } from '../../lib/app-error.js';
import { AdministrativeArea } from './administrative-area.entity.js';
import { GradeLevel } from './grade-level.entity.js';
import { Subject } from './subject.entity.js';

const toArea = (a: AdministrativeArea): CatalogArea => ({
  id: a.id,
  code: a.code,
  unitType: a.unitType,
  name: a.name,
  fullName: a.fullName,
  nameEn: a.nameEn,
});

export function createCatalogService(deps: { dataSource: DataSource }) {
  const { dataSource } = deps;
  const areas = () => dataSource.getRepository(AdministrativeArea);

  return {
    async subjects(): Promise<CatalogSubject[]> {
      const rows = await dataSource.getRepository(Subject).find({
        where: { isActive: true },
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      return rows.map((s) => ({ id: s.id, code: s.code, nameVi: s.nameVi, nameEn: s.nameEn }));
    },

    async gradeLevels(): Promise<CatalogGradeLevel[]> {
      const rows = await dataSource.getRepository(GradeLevel).find({
        where: { isActive: true },
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      return rows.map((g) => ({
        id: g.id,
        code: g.code,
        stage: g.stage,
        nameVi: g.nameVi,
        nameEn: g.nameEn,
      }));
    },

    async provinces(): Promise<CatalogArea[]> {
      const rows = await areas().find({
        where: { level: 'province', isActive: true },
        order: { code: 'ASC' },
      });
      return rows.map(toArea);
    },

    /** Xã/phường của một tỉnh. Tỉnh không tồn tại hoặc ngừng dùng: 404. */
    async communes(provinceId: number): Promise<CatalogArea[]> {
      const province = await areas().existsBy({
        id: provinceId,
        level: 'province',
        isActive: true,
      });
      if (!province) throw notFound('Province');
      const rows = await areas().find({
        where: { level: 'commune', parentId: provinceId, isActive: true },
        order: { nameAscii: 'ASC' },
      });
      return rows.map(toArea);
    },

    /**
     * Tỉnh/xã theo id, kèm cấp và tỉnh chứa xã. Gồm cả đơn vị đã ngừng dùng, để dữ liệu đã lưu trước đó vẫn
     * hiện được tên. Id không tồn tại thì bỏ qua (không lỗi).
     */
    async areasByIds(ids: number[]): Promise<CatalogAreaRef[]> {
      const rows = await areas().find({ where: { id: In(ids) }, order: { id: 'ASC' } });
      return rows.map((a) => ({ ...toArea(a), level: a.level, parentId: a.parentId }));
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
