import type { ReportReason } from '@tps/shared';
import type { EntityManager } from 'typeorm';

/** Đối tượng bị báo cáo: đúng một cột. */
export interface ReportTarget {
  reportedUserId?: string;
  tutorPostId?: string;
  requestPostId?: string;
  messageId?: string;
}

/** Chặn và báo cáo. Không kiểm tra quyền (service làm). */
export function createSafetyRepository(manager: EntityManager) {
  return {
    /** Người U đã chặn, mới nhất trước. */
    async blocksOf(userId: string): Promise<
      {
        userId: string;
        displayName: string;
        avatarKey: string | null;
        blockedAt: Date;
      }[]
    > {
      const rows = await manager.query<
        { id: string; display_name: string; avatar_key: string | null; created_at: Date }[]
      >(
        `SELECT u.id, u.display_name, f.storage_key AS avatar_key, b.created_at
           FROM user_blocks b
           JOIN users u ON u.id = b.blocked_id
           LEFT JOIN files f ON f.id = u.avatar_file_id AND f.status = 'ready'
          WHERE b.blocker_id = $1
          ORDER BY b.created_at DESC`,
        [userId],
      );
      return rows.map((r) => ({
        userId: r.id,
        displayName: r.display_name,
        avatarKey: r.avatar_key,
        blockedAt: r.created_at,
      }));
    },

    async block(blockerId: string, blockedId: string): Promise<void> {
      await manager.query(
        `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [blockerId, blockedId],
      );
    },

    /** Bỏ chặn. False nếu U chưa chặn người này. */
    async unblock(blockerId: string, blockedId: string): Promise<boolean> {
      const rows = await manager.query<unknown[]>(
        `WITH deleted AS (
           DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING blocked_id
         )
         SELECT blocked_id FROM deleted`,
        [blockerId, blockedId],
      );
      return rows.length > 0;
    },

    /** Gia sư có tồn tại (có hồ sơ gia sư, tài khoản chưa xóa)? */
    async tutorExists(tutorId: string): Promise<boolean> {
      const rows = await manager.query<unknown[]>(
        `SELECT 1 FROM tutor_profiles tp JOIN users u ON u.id = tp.user_id
          WHERE tp.user_id = $1 AND u.deleted_at IS NULL`,
        [tutorId],
      );
      return rows.length > 0;
    },

    /** Bài tuyển chưa xóa và gia sư đứng tên. */
    async tutorPostAuthor(postId: string): Promise<string | null> {
      const [row] = await manager.query<{ tutor_id: string }[]>(
        `SELECT tutor_id FROM tutor_posts WHERE id = $1 AND deleted_at IS NULL`,
        [postId],
      );
      return row?.tutor_id ?? null;
    },

    /** Người gửi một tin của hội thoại; null nếu không có tin đó hoặc là tin hệ thống. */
    async messageSender(conversationId: string, messageId: string): Promise<string | null> {
      const [row] = await manager.query<{ sender_id: string | null }[]>(
        `SELECT sender_id FROM messages WHERE id = $1 AND conversation_id = $2`,
        [messageId, conversationId],
      );
      return row?.sender_id ?? null;
    },

    /** Ghi báo cáo; đã có báo cáo đang mở của U cho đối tượng này thì bỏ qua. */
    async report(
      reporterId: string,
      target: ReportTarget,
      reason: ReportReason,
      description: string | null,
    ): Promise<void> {
      await manager.query(
        `INSERT INTO violation_reports
           (reporter_id, reported_user_id, tutor_post_id, request_post_id, message_id, reason_code, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          reporterId,
          target.reportedUserId ?? null,
          target.tutorPostId ?? null,
          target.requestPostId ?? null,
          target.messageId ?? null,
          reason,
          description,
        ],
      );
    },
  };
}
