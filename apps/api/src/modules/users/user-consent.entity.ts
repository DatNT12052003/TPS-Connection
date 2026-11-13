import type { ConsentType } from '@tps/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Bằng chứng đồng ý xử lý dữ liệu (`user_consents`): loại, phiên bản văn bản, thời điểm, IP. */
@Entity({ name: 'user_consents' })
export class UserConsent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'consent_type', type: 'text' })
  consentType!: ConsentType;

  /** Phiên bản văn bản đã đồng ý, ví dụ "2026-11-01". */
  @Column({ type: 'text' })
  version!: string;

  /** Đồng ý cho dữ liệu của một người con (`child_data_processing`). */
  @Column({ name: 'learner_id', type: 'uuid', nullable: true })
  learnerId!: string | null;

  @CreateDateColumn({ name: 'granted_at', type: 'timestamptz' })
  grantedAt!: Date;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt!: Date | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;
}
