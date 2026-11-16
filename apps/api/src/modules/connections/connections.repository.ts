import type {
  ConnectionCancelReason,
  ConnectionEventType,
  ConnectionRequestListQuery,
  ConnectionRequestStatus,
} from '@tps/shared';
import { Brackets, type EntityManager, In } from 'typeorm';
import {
  ConnectionEventRow,
  ConnectionRequest,
  ConnectionTermsVersion,
} from './connection.entity.js';

/** Trạng thái còn mở: còn có thể chuyển tiếp (B.1). */
export const OPEN_STATUSES = [
  'pending',
  'negotiating',
] as const satisfies ConnectionRequestStatus[];

/** Cột hiển thị đi kèm một yêu cầu (tên, ảnh, tên con, xác nhận của phiên bản điều khoản mới nhất). */
export interface ConnectionDisplay {
  tutorName: string;
  tutorPublicCode: string;
  tutorAvatarKey: string | null;
  conversationId: string | null;
  classId: string | null;
  clientName: string;
  learnerName: string;
  latestTerms: { version: number; tutorConfirmed: boolean; clientConfirmed: boolean } | null;
}

/** Thông tin chỉ mở khi đã xác nhận hợp tác (D16). */
export interface RevealedInfo {
  tutor: { fullName: string | null; email: string | null; phone: string | null };
  client: { fullName: string | null; email: string | null; phone: string | null };
  learner: {
    fullName: string | null;
    nickname: string | null;
    schoolName: string | null;
    addressLine: string | null;
  };
}

export type NewConnectionRequest = Pick<
  ConnectionRequest,
  | 'direction'
  | 'tutorId'
  | 'clientUserId'
  | 'learnerId'
  | 'subjectId'
  | 'gradeLevelId'
  | 'goal'
  | 'goalNote'
  | 'teachingMode'
  | 'provinceId'
  | 'communeId'
  | 'tutorPostId'
  | 'requestPostId'
  | 'message'
  | 'expiresAt'
>;

export type NewTermsVersion = Omit<
  ConnectionTermsVersion,
  'id' | 'tutorConfirmedAt' | 'clientConfirmedAt' | 'createdAt'
>;

export interface EventInput {
  requestId: string;
  event: ConnectionEventType;
  actorUserId: string | null;
  fromStatus: ConnectionRequestStatus | null;
  toStatus: ConnectionRequestStatus | null;
  data?: Record<string, unknown> | null;
}

/** Hủy hàng loạt (do việc khác, không phải thao tác trên chính yêu cầu): lý do, sự kiện ghi lại, người làm. */
interface BulkCancel {
  reason: ConnectionCancelReason;
  event: ConnectionEventType;
  actorUserId: string | null;
  data?: Record<string, unknown>;
}

/** Truy cập yêu cầu kết nối, điều khoản, lịch sử. Không kiểm tra quyền (service làm). */
export function createConnectionsRepository(manager: EntityManager) {
  const requests = manager.getRepository(ConnectionRequest);
  const terms = manager.getRepository(ConnectionTermsVersion);
  const events = manager.getRepository(ConnectionEventRow);

  /**
   * Hủy mọi yêu cầu khớp `condition` (SQL, tham số bắt đầu từ $6) đang ở một trong `statuses`, ghi một sự kiện cho
   * mỗi yêu cầu. Một câu lệnh, khóa từng dòng nên không đè lên thao tác đang chạy. Trả số yêu cầu đã hủy.
   */
  async function cancelWhere(
    condition: string,
    params: unknown[],
    statuses: readonly ConnectionRequestStatus[],
    cancel: BulkCancel,
  ): Promise<number> {
    const rows = await manager.query<{ request_id: string }[]>(
      `WITH target AS (
         SELECT id, status FROM connection_requests
          WHERE status = ANY($1::text[]) AND ${condition}
          FOR UPDATE
       ), updated AS (
         UPDATE connection_requests r
            SET status = 'cancelled', cancel_reason = $2, closed_at = now(), updated_at = now()
           FROM target t
          WHERE r.id = t.id
         RETURNING r.id, t.status AS from_status
       )
       INSERT INTO connection_events (request_id, event, actor_user_id, from_status, to_status, data)
       SELECT id, $3, $4::uuid, from_status, 'cancelled', $5::jsonb FROM updated
       RETURNING request_id`,
      [
        statuses,
        cancel.reason,
        cancel.event,
        cancel.actorUserId,
        JSON.stringify(cancel.data ?? { reason: cancel.reason }),
        ...params,
      ],
    );
    return rows.length;
  }

  return {
    async create(data: NewConnectionRequest): Promise<ConnectionRequest> {
      return requests.save(requests.create({ ...data, status: 'pending' }));
    },

    /** Yêu cầu mà U là một bên (gia sư hoặc client). */
    findForParty(
      id: string,
      userId: string,
      options: { lock?: boolean } = {},
    ): Promise<ConnectionRequest | null> {
      const query = requests
        .createQueryBuilder('r')
        .where('r.id = :id', { id })
        .andWhere('(r.tutorId = :userId OR r.clientUserId = :userId)', { userId });
      if (options.lock) query.setLock('pessimistic_write');
      return query.getOne();
    },

    /** Nhiều yêu cầu theo id (job, không kiểm tra quyền). */
    findByIds(ids: string[]): Promise<ConnectionRequest[]> {
      return ids.length === 0 ? Promise.resolve([]) : requests.findBy({ id: In(ids) });
    },

    async update(id: string, changes: Partial<ConnectionRequest>): Promise<void> {
      await requests.update({ id }, changes);
    },

    /** Chỉ đổi `updated_at` (có hoạt động mới: điều khoản, xác nhận). */
    async touch(id: string): Promise<void> {
      await manager.query(`UPDATE connection_requests SET updated_at = now() WHERE id = $1`, [id]);
    },

    // ---- Tra cứu khi gửi yêu cầu -----------------------------------------------------------------

    /**
     * Gia sư đang hiển thị công khai (C8): đã xác minh, tài khoản đang hoạt động, chưa xóa. Null nếu không.
     */
    async publicTutor(tutorId: string): Promise<{ acceptingStudents: boolean } | null> {
      const [row] = await manager.query<{ accepting_students: boolean }[]>(
        `SELECT tp.accepting_students
           FROM tutor_profiles tp JOIN users u ON u.id = tp.user_id
          WHERE tp.user_id = $1 AND tp.profile_status = 'verified'
            AND u.status = 'active' AND u.deleted_at IS NULL`,
        [tutorId],
      );
      return row ? { acceptingStudents: row.accepting_students } : null;
    },

    /** Gia sư có nhận dạy môn này (ở khối nào cũng được) trong hồ sơ không? */
    async tutorTeaches(tutorId: string, subjectId: number): Promise<boolean> {
      const rows = await manager.query<unknown[]>(
        `SELECT 1 FROM tutor_teaching_subjects WHERE tutor_id = $1 AND subject_id = $2 LIMIT 1`,
        [tutorId, subjectId],
      );
      return rows.length > 0;
    },

    /** Bài tuyển đang mở, chưa ẩn, chưa xóa: gia sư đứng tên và các môn của bài. */
    async openTutorPost(postId: string): Promise<{ tutorId: string; subjectIds: number[] } | null> {
      const [row] = await manager.query<{ tutor_id: string; subject_ids: number[] }[]>(
        `SELECT p.tutor_id,
                coalesce(array_agg(DISTINCT s.subject_id) FILTER (WHERE s.subject_id IS NOT NULL), '{}')
                  AS subject_ids
           FROM tutor_posts p LEFT JOIN tutor_post_subjects s ON s.post_id = p.id
          WHERE p.id = $1 AND p.status = 'open' AND p.deleted_at IS NULL
            AND p.moderation_hidden_at IS NULL
          GROUP BY p.id`,
        [postId],
      );
      return row ? { tutorId: row.tutor_id, subjectIds: row.subject_ids } : null;
    },

    /** Hai người có chặn nhau (một trong hai chiều) không? */
    async isBlocked(a: string, b: string): Promise<boolean> {
      const rows = await manager.query<unknown[]>(
        `SELECT 1 FROM user_blocks
          WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
          LIMIT 1`,
        [a, b],
      );
      return rows.length > 0;
    },

    /** Đã có yêu cầu đang mở cho gia sư – người học – môn này chưa (D21)? Index: `connection_requests_open_uq`. */
    hasOpen(tutorId: string, learnerId: string, subjectId: number): Promise<boolean> {
      return requests
        .createQueryBuilder('r')
        .where('r.tutorId = :tutorId AND r.learnerId = :learnerId AND r.subjectId = :subjectId', {
          tutorId,
          learnerId,
          subjectId,
        })
        .andWhere(`r.status IN ('pending', 'negotiating')`)
        .getExists();
    },

    /** Số yêu cầu U đã gửi mà bên kia chưa trả lời. Index: `connection_requests_tutor_idx` / `_client_idx`. */
    async countPendingSent(userId: string): Promise<number> {
      const [row] = await manager.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM connection_requests
          WHERE status = 'pending'
            AND ((direction = 'client_to_tutor' AND client_user_id = $1)
              OR (direction = 'tutor_to_client' AND tutor_id = $1))`,
        [userId],
      );
      return row?.n ?? 0;
    },

    /** Danh sách yêu cầu của U, mới nhất trước. */
    async list(
      userId: string,
      filter: ConnectionRequestListQuery,
    ): Promise<{ rows: ConnectionRequest[]; total: number }> {
      const query = requests.createQueryBuilder('r');
      if (filter.as === 'tutor') query.where('r.tutorId = :userId', { userId });
      else if (filter.as === 'client') query.where('r.clientUserId = :userId', { userId });
      else query.where('(r.tutorId = :userId OR r.clientUserId = :userId)', { userId });

      if (filter.box) {
        // Đã nhận: bên còn lại gửi tới U. Đã gửi: U là bên gửi.
        const tutorSide = filter.box === 'received' ? 'client_to_tutor' : 'tutor_to_client';
        const clientSide = filter.box === 'received' ? 'tutor_to_client' : 'client_to_tutor';
        query.andWhere(
          new Brackets((b) => {
            b.where('(r.tutorId = :userId AND r.direction = :tutorSide)', { tutorSide }).orWhere(
              '(r.clientUserId = :userId AND r.direction = :clientSide)',
              { clientSide },
            );
          }),
        );
      }
      if (filter.state === 'open') query.andWhere(`r.status IN ('pending', 'negotiating')`);
      if (filter.state === 'closed') query.andWhere(`r.status NOT IN ('pending', 'negotiating')`);
      if (filter.status) query.andWhere('r.status = :status', { status: filter.status });
      if (filter.learnerId)
        query.andWhere('r.learnerId = :learnerId', { learnerId: filter.learnerId });
      if (filter.requestPostId) {
        query.andWhere('r.requestPostId = :requestPostId', { requestPostId: filter.requestPostId });
      }
      if (filter.tutorPostId) {
        query.andWhere('r.tutorPostId = :tutorPostId', { tutorPostId: filter.tutorPostId });
      }
      const [rows, total] = await query
        .orderBy('r.createdAt', 'DESC')
        .addOrderBy('r.id', 'DESC')
        .skip((filter.page - 1) * filter.pageSize)
        .take(filter.pageSize)
        .getManyAndCount();
      return { rows, total };
    },

    /** Cột hiển thị cho nhiều yêu cầu trong một truy vấn. */
    async displayOf(ids: string[]): Promise<Map<string, ConnectionDisplay>> {
      const result = new Map<string, ConnectionDisplay>();
      if (ids.length === 0) return result;
      const rows = await manager.query<
        {
          id: string;
          tutor_name: string;
          public_code: string;
          avatar_key: string | null;
          conversation_id: string | null;
          class_id: string | null;
          client_name: string;
          nickname: string | null;
          learner_full_name: string | null;
          terms_version: number | null;
          tutor_confirmed: boolean | null;
          client_confirmed: boolean | null;
        }[]
      >(
        `SELECT r.id,
                tu.display_name AS tutor_name, tp.public_code, f.storage_key AS avatar_key,
                cv.id AS conversation_id,
                tc.id AS class_id,
                cu.display_name AS client_name,
                l.nickname, l.full_name AS learner_full_name,
                lt.version AS terms_version,
                lt.tutor_confirmed_at IS NOT NULL AS tutor_confirmed,
                lt.client_confirmed_at IS NOT NULL AS client_confirmed
           FROM connection_requests r
           JOIN users tu ON tu.id = r.tutor_id
           JOIN tutor_profiles tp ON tp.user_id = r.tutor_id
           LEFT JOIN files f ON f.id = tu.avatar_file_id AND f.status = 'ready'
           LEFT JOIN conversations cv ON cv.connection_request_id = r.id
           LEFT JOIN tutoring_classes tc ON tc.created_from_request_id = r.id
           JOIN users cu ON cu.id = r.client_user_id
           JOIN learners l ON l.id = r.learner_id
           LEFT JOIN LATERAL (
             SELECT version, tutor_confirmed_at, client_confirmed_at FROM connection_terms t
              WHERE t.request_id = r.id ORDER BY version DESC LIMIT 1
           ) lt ON true
          WHERE r.id = ANY($1::uuid[])`,
        [ids],
      );
      for (const r of rows) {
        result.set(r.id, {
          tutorName: r.tutor_name,
          tutorPublicCode: r.public_code,
          tutorAvatarKey: r.avatar_key,
          conversationId: r.conversation_id,
          classId: r.class_id,
          clientName: r.client_name,
          learnerName: r.nickname ?? r.learner_full_name ?? '',
          latestTerms:
            r.terms_version === null
              ? null
              : {
                  version: r.terms_version,
                  tutorConfirmed: r.tutor_confirmed === true,
                  clientConfirmed: r.client_confirmed === true,
                },
        });
      }
      return result;
    },

    /** Liên hệ hai bên và danh tính trẻ. Chỉ gọi khi yêu cầu đã xác nhận hợp tác (D16). */
    async revealed(request: ConnectionRequest): Promise<RevealedInfo> {
      const contact = async (userId: string) => {
        const [row] = await manager.query<
          { full_name: string | null; email: string | null; phone: string | null }[]
        >(`SELECT full_name, email, phone FROM users WHERE id = $1`, [userId]);
        return {
          fullName: row?.full_name ?? null,
          email: row?.email ?? null,
          phone: row?.phone ?? null,
        };
      };
      const [learner] = await manager.query<
        {
          full_name: string | null;
          nickname: string | null;
          school_name: string | null;
          address_line: string | null;
        }[]
      >(`SELECT full_name, nickname, school_name, address_line FROM learners WHERE id = $1`, [
        request.learnerId,
      ]);
      return {
        tutor: await contact(request.tutorId),
        client: await contact(request.clientUserId),
        learner: {
          fullName: learner?.full_name ?? null,
          nickname: learner?.nickname ?? null,
          schoolName: learner?.school_name ?? null,
          addressLine: learner?.address_line ?? null,
        },
      };
    },

    // ---- Điều khoản ------------------------------------------------------------------------------

    latestTerms(requestId: string): Promise<ConnectionTermsVersion | null> {
      return terms.findOne({ where: { requestId }, order: { version: 'DESC' } });
    },

    termsById(id: string): Promise<ConnectionTermsVersion | null> {
      return terms.findOneBy({ id });
    },

    async insertTerms(data: NewTermsVersion): Promise<ConnectionTermsVersion> {
      return terms.save(terms.create(data));
    },

    async markTermsConfirmed(termsId: string, party: 'tutor' | 'client'): Promise<void> {
      await terms.update(
        { id: termsId },
        party === 'tutor' ? { tutorConfirmedAt: new Date() } : { clientConfirmedAt: new Date() },
      );
    },

    // ---- Lịch sử ---------------------------------------------------------------------------------

    async addEvent(input: EventInput): Promise<void> {
      await manager.query(
        `INSERT INTO connection_events (request_id, event, actor_user_id, from_status, to_status, data)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          input.requestId,
          input.event,
          input.actorUserId,
          input.fromStatus,
          input.toStatus,
          input.data ? JSON.stringify(input.data) : null,
        ],
      );
    },

    events(requestId: string): Promise<ConnectionEventRow[]> {
      return events.find({ where: { requestId }, order: { id: 'ASC' } });
    },

    // ---- Hủy do việc khác --------------------------------------------------------------------------

    /** Bài tìm gia sư bị ẩn, đóng hoặc xóa: các ứng tuyển còn chờ tự hủy (D31). */
    cancelPendingApplications(requestPostId: string): Promise<number> {
      return cancelWhere(
        `direction = 'tutor_to_client' AND request_post_id = $6`,
        [requestPostId],
        ['pending'],
        { reason: 'source_closed', event: 'cancelled_by_system', actorUserId: null },
      );
    },

    /** Phụ huynh xóa hồ sơ con: hủy mọi yêu cầu đang mở của con. Index: `connection_requests_learner_open_idx`. */
    cancelOpenForLearner(learnerId: string, actorUserId: string): Promise<number> {
      return cancelWhere(`learner_id = $6`, [learnerId], OPEN_STATUSES, {
        reason: 'ended_by_party',
        event: 'cancelled_by_party',
        actorUserId,
        data: { reason: 'ended_by_party', cause: 'learner_deleted' },
      });
    },

    /** Một người chặn người kia: hủy mọi yêu cầu đang mở giữa hai người, người chặn là người hủy. */
    cancelOpenBetween(blockerId: string, blockedId: string): Promise<number> {
      return cancelWhere(
        `((tutor_id = $6 AND client_user_id = $7) OR (tutor_id = $7 AND client_user_id = $6))`,
        [blockerId, blockedId],
        OPEN_STATUSES,
        {
          reason: 'ended_by_party',
          event: 'cancelled_by_party',
          actorUserId: blockerId,
          data: { reason: 'ended_by_party', cause: 'blocked' },
        },
      );
    },

    /** Tài khoản bị khóa: hủy mọi yêu cầu đang mở mà người đó là một bên (B.1). */
    cancelOpenForUser(userId: string): Promise<number> {
      return cancelWhere(`(tutor_id = $6 OR client_user_id = $6)`, [userId], OPEN_STATUSES, {
        reason: 'ended_by_party',
        event: 'cancelled_by_system',
        actorUserId: null,
        data: { reason: 'ended_by_party', cause: 'account_locked' },
      });
    },

    // ---- Job hết hạn (C3, D30) -------------------------------------------------------------------

    /**
     * Hủy tối đa `limit` yêu cầu đã quá `expires_at`. Bỏ qua dòng đang bị khóa (thao tác của người dùng đang chạy;
     * lần chạy sau xử lý). Index: `connection_requests_expiry_idx`.
     */
    async expireOverdue(limit: number): Promise<number> {
      const rows = await manager.query<unknown[]>(
        `WITH due AS (
           SELECT id, status FROM connection_requests
            WHERE status IN ('pending', 'negotiating') AND expires_at <= now()
            ORDER BY expires_at
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         ), updated AS (
           UPDATE connection_requests r
              SET status = 'cancelled',
                  cancel_reason = CASE d.status WHEN 'pending' THEN 'expired_pending'
                                                ELSE 'expired_negotiating' END,
                  closed_at = now(), updated_at = now()
             FROM due d
            WHERE r.id = d.id
           RETURNING r.id, d.status AS from_status, r.cancel_reason
         )
         INSERT INTO connection_events (request_id, event, from_status, to_status, data)
         SELECT id, 'expired', from_status, 'cancelled', jsonb_build_object('reason', cancel_reason)
           FROM updated
         RETURNING request_id`,
        [limit],
      );
      return rows.length;
    },

    /**
     * Ghi nhắc sắp hết hạn: còn 24 giờ với yêu cầu chờ phản hồi, còn 3 ngày với yêu cầu đang trao đổi (D30). Mỗi
     * giai đoạn nhắc một lần (chấp nhận thì đặt lại `expiry_reminded_at`). Trả id các yêu cầu vừa được nhắc.
     */
    async markExpiryReminders(
      limit: number,
      windows: { pendingHours: number; negotiatingDays: number },
    ): Promise<string[]> {
      const rows = await manager.query<{ request_id: string }[]>(
        `WITH due AS (
           SELECT id, status FROM connection_requests
            WHERE expiry_reminded_at IS NULL
              AND expires_at > now()
              AND ((status = 'pending' AND expires_at <= now() + make_interval(hours => $2))
                OR (status = 'negotiating' AND expires_at <= now() + make_interval(days => $3)))
            ORDER BY expires_at
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         ), updated AS (
           UPDATE connection_requests r SET expiry_reminded_at = now()
             FROM due d
            WHERE r.id = d.id
           RETURNING r.id, d.status, r.expires_at
         )
         INSERT INTO connection_events (request_id, event, from_status, to_status, data)
         SELECT id, 'expiry_reminded', status, status, jsonb_build_object('expiresAt', expires_at)
           FROM updated
         RETURNING request_id`,
        [limit, windows.pendingHours, windows.negotiatingDays],
      );
      return rows.map((r) => r.request_id);
    },
  };
}

export type ConnectionsRepository = ReturnType<typeof createConnectionsRepository>;
