// Ghi nhật ký kiểm toán (C1). Gọi trong cùng transaction với thao tác được ghi, để thao tác và nhật ký cùng
// thành công hoặc cùng hủy. Không đưa dữ liệu cá nhân vào `metadata`.
import type { EntityManager } from 'typeorm';
import type { AuditAction, AuditActorRole } from './audit-log.entity.js';

export interface AuditEntry {
  actorUserId: string | null;
  actorRole: AuditActorRole;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export function createAuditRepository(manager: EntityManager) {
  return {
    async record(entry: AuditEntry): Promise<void> {
      await manager.query(
        `INSERT INTO audit_logs
           (actor_user_id, actor_role, action, entity_type, entity_id, metadata, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::inet)`,
        [
          entry.actorUserId,
          entry.actorRole,
          entry.action,
          entry.entityType,
          entry.entityId,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
          entry.ipAddress ?? null,
        ],
      );
    },
  };
}
