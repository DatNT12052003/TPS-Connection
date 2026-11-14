import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Người dùng chặn người dùng khác (`user_blocks`). */
@Entity({ name: 'user_blocks' })
export class UserBlock {
  @PrimaryColumn({ name: 'blocker_id', type: 'uuid' })
  blockerId!: string;

  @PrimaryColumn({ name: 'blocked_id', type: 'uuid' })
  blockedId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
