import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Một dòng nhật ký kiểm toán (`audit_logs`). Chỉ ghi thêm; database chặn sửa, xóa. */
@Entity({ name: 'audit_logs' })
export class AuditLog {
  /** bigint identity, đọc thành number (int8 parse). DB sinh giá trị. */
  @PrimaryColumn({ type: 'bigint', generatedIdentity: 'ALWAYS', insert: false })
  id!: number;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'actor_role', type: 'text' })
  actorRole!: AuditActorRole;

  @Column({ type: 'text' })
  action!: AuditAction;

  @Column({ name: 'entity_type', type: 'text' })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'text' })
  entityId!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

export type AuditActorRole = 'manager' | 'admin' | 'system';

/** Các hành động được ghi. Thêm hành động mới thì thêm vào đây (dạng `<nhóm>.<việc>`). */
export type AuditAction =
  | 'verification.document_viewed'
  | 'verification.approved'
  | 'verification.rejected'
  | 'verification.documents_purged'
  | 'account.locked'
  | 'account.unlocked'
  | 'role.granted'
  | 'role.revoked'
  | 'catalog.subject_created'
  | 'catalog.subject_updated'
  | 'catalog.grade_level_created'
  | 'catalog.grade_level_updated';
