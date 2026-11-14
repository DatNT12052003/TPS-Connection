import type { SanctionType } from '@tps/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Một biện pháp với tài khoản (`account_sanctions`): cảnh cáo, hạn chế, khóa. `users.status` là trạng thái
 * hiện tại; bảng này giữ lý do và lịch sử. Mở khóa: ghi `liftedAt`, `liftedBy`.
 */
@Entity({ name: 'account_sanctions' })
export class AccountSanction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'text' })
  type!: SanctionType;

  @Column({ type: 'text' })
  reason!: string;

  /** Vụ việc kiểm duyệt dẫn tới biện pháp này (G8). */
  @Column({ name: 'case_id', type: 'uuid', nullable: true })
  caseId!: string | null;

  @Column({ name: 'starts_at', type: 'timestamptz', default: () => 'now()' })
  startsAt!: Date;

  /** null: vô thời hạn. */
  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt!: Date | null;

  @Column({ name: 'lifted_at', type: 'timestamptz', nullable: true })
  liftedAt!: Date | null;

  @Column({ name: 'lifted_by', type: 'uuid', nullable: true })
  liftedBy!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
