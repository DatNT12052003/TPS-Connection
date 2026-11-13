// Thông tin cá nhân của người đang đăng nhập (G2 phần 5): tên hiển thị, họ tên thật, số điện thoại tự khai
// (C12), ngôn ngữ, ảnh đại diện. Gia sư đã xác minh danh tính thì họ tên thật bị khóa (D34).
// Không phụ thuộc Express.
import type { AccountProfile, UpdateAccountRequest, UploadRequest } from '@tps/shared';
import type { DataSource } from 'typeorm';
import { AppError } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import type { FilesService } from '../files/files.service.js';
import { StoredFile } from '../files/stored-file.entity.js';
import { TutorProfile } from '../tutors/tutor-profile.entity.js';
import { User } from './user.entity.js';
import { createUsersRepository } from './users.repository.js';

export function createAccountService(deps: {
  dataSource: DataSource;
  files: FilesService;
  /** URL công khai của tệp ở bucket public (storage.publicUrl). */
  publicFileUrl: (storageKey: string) => string;
  logger: Logger;
}) {
  const { dataSource, files, logger } = deps;

  /** Họ tên thật bị khóa khi người dùng là gia sư đã xác minh danh tính. */
  async function isFullNameLocked(userId: string): Promise<boolean> {
    return dataSource
      .getRepository(TutorProfile)
      .createQueryBuilder('p')
      .where('p.userId = :userId', { userId })
      .andWhere('p.identityVerifiedAt IS NOT NULL')
      .getExists();
  }

  async function get(userId: string): Promise<AccountProfile> {
    const account = await createUsersRepository(dataSource.manager).findWithRoles(userId);
    if (!account) throw new AppError('unauthenticated', 'Account no longer exists');
    const { user, roles } = account;
    const avatar = user.avatarFileId
      ? await dataSource.getRepository(StoredFile).findOneBy({ id: user.avatarFileId })
      : null;
    return {
      id: user.id,
      email: user.email ?? '',
      displayName: user.displayName,
      fullName: user.fullName,
      fullNameLocked: await isFullNameLocked(userId),
      phone: user.phone,
      phoneVerified: user.phoneVerifiedAt !== null,
      locale: user.locale,
      avatarUrl: avatar?.status === 'ready' ? deps.publicFileUrl(avatar.storageKey) : null,
      roles,
    };
  }

  /** Đổi ảnh đại diện: ghi id mới, đánh dấu tệp cũ đã xóa; sau khi commit thì xóa tệp cũ khỏi kho. */
  async function replaceAvatar(userId: string, fileId: string | null): Promise<void> {
    const old = await dataSource.transaction(async (manager) => {
      const user = await manager
        .getRepository(User)
        .createQueryBuilder('u')
        .where('u.id = :userId', { userId })
        .setLock('pessimistic_write')
        .getOne();
      if (!user) throw new AppError('unauthenticated', 'Account no longer exists');
      if (fileId) await files.claimUploaded(manager, userId, fileId, 'avatar');
      if (user.avatarFileId === fileId) return null;
      await manager.getRepository(User).update({ id: userId }, { avatarFileId: fileId });
      return user.avatarFileId ? files.markDeleted(manager, user.avatarFileId) : null;
    });
    if (old) await files.purgeObject(old);
  }

  return {
    get,

    async update(userId: string, input: UpdateAccountRequest): Promise<AccountProfile> {
      const users = dataSource.getRepository(User);
      if (input.fullName !== undefined) {
        const current = await users.findOneBy({ id: userId });
        if (current && current.fullName !== input.fullName && (await isFullNameLocked(userId))) {
          throw new AppError('validation_failed', 'Full name is locked after verification', [
            { path: 'fullName', code: 'full_name_locked', message: 'Full name is locked' },
          ]);
        }
      }
      const changes = Object.fromEntries(
        Object.entries(input).filter(([, v]) => v !== undefined),
      ) as Partial<Pick<User, 'displayName' | 'fullName' | 'phone' | 'locale'>>;
      // Số điện thoại mới luôn là tự khai, chưa xác thực (C12).
      const phoneChange = 'phone' in changes ? { phoneVerifiedAt: null } : {};
      await users.update({ id: userId }, { ...changes, ...phoneChange });
      logger.info({ userId, fields: Object.keys(changes) }, 'Account updated');
      return get(userId);
    },

    async createUpload(userId: string, input: UploadRequest) {
      return files.createUpload(dataSource.manager, userId, input);
    },

    async setAvatar(userId: string, fileId: string): Promise<AccountProfile> {
      await replaceAvatar(userId, fileId);
      return get(userId);
    },

    async removeAvatar(userId: string): Promise<void> {
      await replaceAvatar(userId, null);
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
