import type { VerificationDocumentType } from '@tps/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Một giấy tờ của một yêu cầu xác minh (`verification_documents`). Một tệp chỉ thuộc một yêu cầu. */
@Entity({ name: 'verification_documents' })
export class VerificationDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @Column({ name: 'document_type', type: 'text' })
  documentType!: VerificationDocumentType;

  @Column({ name: 'file_id', type: 'uuid' })
  fileId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
