// Tệp người dùng tải lên (G2 phần 5: ảnh đại diện). Trình duyệt PUT tệp thẳng lên kho lưu trữ bằng presigned
// URL; API ghi metadata (`files`, trạng thái `pending_upload`), rồi khi tệp được dùng (ví dụ đặt làm ảnh
// đại diện) thì kiểm tra tệp đã thật sự lên kho, đúng loại, đúng dung lượng, mới chuyển `ready`.
// Không phụ thuộc Express.
import { type FilePurpose, type UploadRequest, type UploadTicketResponse } from '@tps/shared';
import { type EntityManager, IsNull } from 'typeorm';
import { AppError } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import type { Storage } from '../../lib/storage.js';
import { StoredFile } from './stored-file.entity.js';

/**
 * Mục đích được tải lên qua endpoint chung ở giai đoạn hiện tại. Mục đích khác (giấy tờ xác minh, tệp tin
 * nhắn, bài tập) mở ở giai đoạn của nó, vì cần kiểm tra quyền theo nghiệp vụ.
 */
export const UPLOADABLE_PURPOSES: readonly FilePurpose[] = ['avatar'];

const fileNotUploaded = () =>
  new AppError('validation_failed', 'File is not uploaded', [
    { path: 'fileId', code: 'file_not_uploaded', message: 'File is not uploaded' },
  ]);

export function createFilesService(deps: {
  storage: Pick<Storage, 'createUploadTicket' | 'headObject' | 'deleteObject'>;
  logger: Logger;
}) {
  const { storage, logger } = deps;

  return {
    /** Cấp URL tải lên và ghi bản ghi `files` chờ tải. */
    async createUpload(
      manager: EntityManager,
      ownerId: string,
      input: UploadRequest,
    ): Promise<UploadTicketResponse> {
      if (!UPLOADABLE_PURPOSES.includes(input.purpose)) {
        throw new AppError('validation_failed', 'Purpose not allowed', [
          { path: 'purpose', code: 'file_purpose_not_allowed', message: 'Purpose not allowed' },
        ]);
      }
      const ticket = await storage.createUploadTicket({ ...input, ownerId });
      const files = manager.getRepository(StoredFile);
      const file = await files.save(
        files.create({
          ownerUserId: ownerId,
          bucket: ticket.bucket,
          storageKey: ticket.storageKey,
          purpose: input.purpose,
          originalName: input.fileName,
          mimeType: input.contentType,
          sizeBytes: input.sizeBytes,
        }),
      );
      return { fileId: file.id, ...ticket };
    },

    /**
     * Nhận một tệp đã tải lên để dùng: phải của đúng người, đúng mục đích, chưa xóa, và đã có trên kho với
     * đúng dung lượng, loại đã khai. Đánh dấu `ready`. Sai bất kỳ điều gì: 422 `file_not_uploaded`
     * (không nói rõ tệp của người khác hay không tồn tại).
     */
    async claimUploaded(
      manager: EntityManager,
      ownerId: string,
      fileId: string,
      purpose: FilePurpose,
    ): Promise<StoredFile> {
      const files = manager.getRepository(StoredFile);
      const file = await files.findOneBy({
        id: fileId,
        ownerUserId: ownerId,
        purpose,
        deletedAt: IsNull(),
      });
      if (!file || file.status === 'deleted') throw fileNotUploaded();
      if (file.status === 'pending_upload') {
        const stored = await storage.headObject(file.bucket, file.storageKey);
        if (
          !stored ||
          stored.sizeBytes !== Number(file.sizeBytes) ||
          stored.contentType !== file.mimeType
        ) {
          throw fileNotUploaded();
        }
        await files.update({ id: file.id }, { status: 'ready' });
        file.status = 'ready';
      }
      return file;
    },

    /** Đánh dấu tệp đã xóa (trong transaction). Xóa khỏi kho bằng `purgeObject` sau khi commit. */
    async markDeleted(manager: EntityManager, fileId: string): Promise<StoredFile | null> {
      const files = manager.getRepository(StoredFile);
      const file = await files.findOneBy({ id: fileId, deletedAt: IsNull() });
      if (!file) return null;
      await files.update({ id: fileId }, { status: 'deleted', deletedAt: () => 'now()' });
      return file;
    },

    /** Xóa nội dung tệp khỏi kho. Lỗi chỉ ghi log: job dọn tệp sẽ thử lại sau. */
    async purgeObject(file: StoredFile): Promise<void> {
      try {
        await storage.deleteObject(file.bucket, file.storageKey);
      } catch (err) {
        logger.warn({ err, fileId: file.id }, 'Could not delete object from storage');
      }
    },
  };
}

export type FilesService = ReturnType<typeof createFilesService>;
