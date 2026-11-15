import type { FileBucket, FilePurpose, FileStatus } from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Metadata của một tệp trong kho lưu trữ (`files`); nội dung tệp nằm ở SeaweedFS (lib/storage.ts).
 * Tên `StoredFile` để không trùng kiểu `File` có sẵn của Node/DOM.
 */
@Entity({ name: 'files' })
export class StoredFile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId!: string;

  @Column({ type: 'text' })
  bucket!: FileBucket;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ type: 'text' })
  purpose!: FilePurpose;

  /** Tên tệp người dùng tải lên. Không dùng trong khóa lưu trữ (có thể chứa họ tên). */
  @Column({ name: 'original_name', type: 'text', nullable: true })
  originalName!: string | null;

  @Column({ name: 'mime_type', type: 'text' })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: number;

  @Column({ name: 'checksum_sha256', type: 'text', nullable: true })
  checksumSha256!: string | null;

  /** pending_upload: đã cấp URL tải lên, chưa xác nhận tệp đã lên kho. */
  @Column({ type: 'text', default: 'pending_upload' })
  status!: FileStatus;

  /** Job xóa tệp khỏi kho sau thời điểm này (ảnh giấy tờ: 30 ngày sau khi duyệt, C4). */
  @Column({ name: 'purge_after', type: 'timestamptz', nullable: true })
  purgeAfter!: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
