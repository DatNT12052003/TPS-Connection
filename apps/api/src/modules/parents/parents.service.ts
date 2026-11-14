// Hồ sơ phụ huynh (G2 phần 4): tỉnh, xã, địa chỉ. Chỉ chính phụ huynh đọc và sửa hồ sơ của mình; không
// có endpoint đọc hồ sơ phụ huynh khác. Không phụ thuộc Express.
import type { ParentProfile as ParentProfileDto, UpdateParentProfileRequest } from '@tps/shared';
import type { DataSource } from 'typeorm';
import type { Logger } from '../../lib/logger.js';
import { assertCatalogRefs } from '../catalog/catalog-checks.js';
import { ParentProfile } from './parent-profile.entity.js';

const toDto = (profile: ParentProfile | null): ParentProfileDto => ({
  provinceId: profile?.provinceId ?? null,
  communeId: profile?.communeId ?? null,
  addressLine: profile?.addressLine ?? null,
  updatedAt: profile?.updatedAt.toISOString() ?? null,
});

export function createParentsService(deps: { dataSource: DataSource; logger: Logger }) {
  const { dataSource, logger } = deps;
  const profiles = () => dataSource.getRepository(ParentProfile);

  return {
    /** Hồ sơ của chính phụ huynh. Chưa lưu lần nào: trả hồ sơ trống. */
    async getOwn(userId: string): Promise<ParentProfileDto> {
      return toDto(await profiles().findOneBy({ userId }));
    },

    /** Tạo hoặc thay toàn bộ hồ sơ của chính phụ huynh. */
    async replaceOwn(userId: string, input: UpdateParentProfileRequest): Promise<ParentProfileDto> {
      await assertCatalogRefs(dataSource.manager, {
        location: { provinceId: input.provinceId, communeId: input.communeId },
      });
      await profiles().upsert(
        {
          userId,
          provinceId: input.provinceId,
          communeId: input.communeId,
          addressLine: input.addressLine,
        },
        ['userId'],
      );
      logger.info({ userId }, 'Parent profile saved');
      return toDto(await profiles().findOneBy({ userId }));
    },
  };
}

export type ParentsService = ReturnType<typeof createParentsService>;
