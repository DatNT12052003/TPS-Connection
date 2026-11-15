import type { Role } from '@tps/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Vai trò của một người dùng (`user_roles`). Vai trò hiện hành là dòng có `revokedAt` NULL; thu hồi thì ghi
 * `revokedAt` thay vì xóa, để giữ lịch sử ai cấp, ai thu hồi.
 */
@Entity({ name: 'user_roles' })
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'role_code', type: 'text' })
  roleCode!: Role;

  @CreateDateColumn({ name: 'granted_at', type: 'timestamptz' })
  grantedAt!: Date;

  /** NULL: tự đăng ký. */
  @Column({ name: 'granted_by', type: 'uuid', nullable: true })
  grantedBy!: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy!: string | null;
}
