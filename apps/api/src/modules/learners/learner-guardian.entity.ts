import type { GuardianEndReason, GuardianRelationship } from '@tps/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Phụ huynh quản lý một người học (`learner_guardians`). Dòng có `endedAt` NULL là quan hệ đang hiệu lực;
 * mỗi người học chỉ một dòng như vậy (C9, index `learner_guardians_one_active_uq`). Đổi người quản lý thì
 * kết thúc dòng cũ và thêm dòng mới, để giữ lịch sử.
 */
@Entity({ name: 'learner_guardians' })
export class LearnerGuardian {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'learner_id', type: 'uuid' })
  learnerId!: string;

  @Column({ name: 'guardian_user_id', type: 'uuid' })
  guardianUserId!: string;

  @Column({ type: 'text' })
  relationship!: GuardianRelationship;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ name: 'ended_reason', type: 'text', nullable: true })
  endedReason!: GuardianEndReason | null;

  /** Admin đổi người quản lý (C9). */
  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedBy!: string | null;
}
