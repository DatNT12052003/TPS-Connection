// Báo cáo vi phạm (`violation_reports`). Thiết kế: docs/thiet_ke_co_so_du_lieu.md mục 10; migration
// CreateNotificationsAndReports. Đúng một trong các cột đối tượng có giá trị.
import type { ReportReason, ViolationReportStatus } from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'violation_reports' })
export class ViolationReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId!: string;

  @Column({ name: 'reported_user_id', type: 'uuid', nullable: true })
  reportedUserId!: string | null;

  @Column({ name: 'tutor_post_id', type: 'uuid', nullable: true })
  tutorPostId!: string | null;

  @Column({ name: 'request_post_id', type: 'uuid', nullable: true })
  requestPostId!: string | null;

  @Column({ name: 'message_id', type: 'uuid', nullable: true })
  messageId!: string | null;

  @Column({ name: 'review_id', type: 'uuid', nullable: true })
  reviewId!: string | null;

  @Column({ name: 'reason_code', type: 'text' })
  reasonCode!: ReportReason;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', default: 'open' })
  status!: ViolationReportStatus;

  @Column({ name: 'case_id', type: 'uuid', nullable: true })
  caseId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
