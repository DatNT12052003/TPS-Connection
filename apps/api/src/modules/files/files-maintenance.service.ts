// Việc dọn tệp định kỳ (docs/thiet_ke_co_so_du_lieu.md mục 13), chạy bởi job hằng ngày (jobs/maintenance.ts):
//   - Xóa ảnh giấy tờ xác minh đã quá hạn lưu giữ (30 ngày sau khi duyệt, C4): xóa trên kho TRƯỚC, thành công
//     mới đánh dấu `files` đã xóa và ghi `documents_purged_at`; lỗi thì lần chạy sau thử lại.
//   - Dọn tệp `pending_upload` quá 24 giờ (người dùng xin URL tải lên rồi bỏ dở).
// Kết quả của job xóa giấy tờ được ghi nhật ký kiểm toán với vai trò `system`.
import type { DataSource } from 'typeorm';
import type { Logger } from '../../lib/logger.js';
import type { Storage } from '../../lib/storage.js';
import { createAuditRepository } from '../audit/audit.repository.js';

/** Tệp tải lên bỏ dở quá từng này giờ thì dọn. */
export const STALE_UPLOAD_HOURS = 24;
/** Số dòng xử lý mỗi lần chạy, để một lần chạy không kéo dài; phần còn lại để lần sau. */
const BATCH = 200;

interface FileRow {
  id: string;
  bucket: 'public' | 'private';
  storage_key: string;
}

export function createFilesMaintenanceService(deps: {
  dataSource: DataSource;
  storage: Pick<Storage, 'deleteObject'>;
  logger: Logger;
}) {
  const { dataSource, storage, logger } = deps;

  /** Xóa từng tệp trên kho; trả về id các tệp đã xóa được. */
  async function deleteObjects(files: FileRow[]): Promise<string[]> {
    const done: string[] = [];
    for (const file of files) {
      try {
        await storage.deleteObject(file.bucket, file.storage_key);
        done.push(file.id);
      } catch (err) {
        logger.warn({ err, fileId: file.id }, 'Could not delete object; will retry');
      }
    }
    return done;
  }

  async function markDeleted(fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;
    await dataSource.query(
      `UPDATE files SET status = 'deleted', deleted_at = coalesce(deleted_at, now())
        WHERE id = ANY($1::uuid[])`,
      [fileIds],
    );
  }

  return {
    /** Xóa ảnh giấy tờ của các yêu cầu đã đến hạn xóa. Trả số yêu cầu đã xóa xong. */
    async purgeVerificationDocuments(): Promise<number> {
      const due = await dataSource.query<{ id: string }[]>(
        `SELECT id FROM verification_requests
          WHERE documents_purge_at <= now() AND documents_purged_at IS NULL
          ORDER BY documents_purge_at LIMIT $1`,
        [BATCH],
      );
      let purged = 0;
      for (const { id } of due) {
        const files = await dataSource.query<FileRow[]>(
          `SELECT f.id, f.bucket, f.storage_key FROM verification_documents d
             JOIN files f ON f.id = d.file_id
            WHERE d.request_id = $1 AND f.status <> 'deleted'`,
          [id],
        );
        const deleted = await deleteObjects(files);
        await markDeleted(deleted);
        if (deleted.length < files.length) continue;
        await dataSource.transaction(async (manager) => {
          await manager.query(
            `UPDATE verification_requests SET documents_purged_at = now() WHERE id = $1`,
            [id],
          );
          await createAuditRepository(manager).record({
            actorUserId: null,
            actorRole: 'system',
            action: 'verification.documents_purged',
            entityType: 'verification_request',
            entityId: id,
            metadata: { files: files.length },
          });
        });
        purged += 1;
      }
      if (due.length > 0) logger.info({ due: due.length, purged }, 'Verification documents purged');
      return purged;
    },

    /** Dọn tệp tải lên bỏ dở (`pending_upload` quá 24 giờ). Trả số tệp đã dọn. */
    async cleanupStaleUploads(): Promise<number> {
      const stale = await dataSource.query<FileRow[]>(
        `SELECT id, bucket, storage_key FROM files
          WHERE status = 'pending_upload' AND deleted_at IS NULL
            AND created_at < now() - make_interval(hours => $1)
          ORDER BY created_at LIMIT $2`,
        [STALE_UPLOAD_HOURS, BATCH],
      );
      // Thường chưa có gì trên kho (người dùng không tải lên), xóa vẫn an toàn (S3 DELETE không lỗi khi thiếu).
      const deleted = await deleteObjects(stale);
      await markDeleted(deleted);
      if (stale.length > 0) logger.info({ cleaned: deleted.length }, 'Stale uploads cleaned');
      return deleted.length;
    },
  };
}

export type FilesMaintenanceService = ReturnType<typeof createFilesMaintenanceService>;
