import type {
  VerificationRejectionCode,
  VerificationRequestKind,
  VerificationRequestStatus,
} from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Một lần gia sư nộp xác minh (`verification_requests`, B.4.2): danh tính hoặc một bằng cấp. Nộp lại sau khi
 * bị từ chối là một dòng mới, để giữ lịch sử từng lần duyệt.
 */
@Entity({ name: 'verification_requests' })
export class VerificationRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tutor_id', type: 'uuid' })
  tutorId!: string;

  @Column({ type: 'text' })
  kind!: VerificationRequestKind;

  /** Bằng cấp được xác minh; chỉ có khi `kind = credential`. */
  @Column({ name: 'credential_id', type: 'uuid', nullable: true })
  credentialId!: string | null;

  @Column({ type: 'text', default: 'pending' })
  status!: VerificationRequestStatus;

  @Column({ name: 'submitted_at', type: 'timestamptz', default: () => 'now()' })
  submittedAt!: Date;

  /** Hết ngày làm việc thứ hai sau khi nộp, giờ Việt Nam (C4, D26). */
  @Column({ name: 'review_due_at', type: 'timestamptz' })
  reviewDueAt!: Date;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'rejection_code', type: 'text', nullable: true })
  rejectionCode!: VerificationRejectionCode | null;

  /** Ghi chú cho gia sư; bắt buộc khi `rejection_code = other`. */
  @Column({ name: 'rejection_note', type: 'text', nullable: true })
  rejectionNote!: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  /** Duyệt xong: xóa ảnh giấy tờ sau mốc này (30 ngày, C4). */
  @Column({ name: 'documents_purge_at', type: 'timestamptz', nullable: true })
  documentsPurgeAt!: Date | null;

  @Column({ name: 'documents_purged_at', type: 'timestamptz', nullable: true })
  documentsPurgedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
