// Truy vấn cho phía Manager: hàng chờ, chi tiết một yêu cầu, lịch sử các lần nộp. Không kiểm tra quyền.
import type {
  CredentialKind,
  TutorOccupation,
  VerificationRejectionCode,
  VerificationRequestKind,
  VerificationRequestStatus,
} from '@tps/shared';
import type { EntityManager } from 'typeorm';
import { VerificationRequest } from './verification-request.entity.js';

/** Lần nộp thứ mấy: đếm các yêu cầu cùng gia sư, cùng loại, cùng bằng cấp, nộp không muộn hơn yêu cầu này. */
const ATTEMPT_SQL = `(
  SELECT count(*)::int FROM verification_requests r2
   WHERE r2.tutor_id = r.tutor_id AND r2.kind = r.kind
     AND r2.credential_id IS NOT DISTINCT FROM r.credential_id
     AND (r2.submitted_at, r2.id) <= (r.submitted_at, r.id)
)`;

export interface QueueRow {
  id: string;
  kind: VerificationRequestKind;
  tutor_id: string;
  tutor_name: string;
  occupation: TutorOccupation | null;
  credential_title: string | null;
  credential_kind: CredentialKind | null;
  submitted_at: Date;
  review_due_at: Date;
  attempt: number;
}

export interface DetailRow {
  request: VerificationRequest;
  attempt: number;
  tutor: {
    id: string;
    fullName: string | null;
    displayName: string;
    email: string | null;
    locale: 'vi' | 'en';
    occupation: TutorOccupation | null;
    institution: string | null;
  };
  credential: {
    id: string;
    kind: CredentialKind;
    title: string;
    issuer: string | null;
    issuedYear: number | null;
  } | null;
}

export interface HistoryRow {
  id: string;
  status: VerificationRequestStatus;
  submitted_at: Date;
  reviewed_at: Date | null;
  rejection_code: VerificationRejectionCode | null;
  rejection_note: string | null;
}

export function createVerificationReviewRepository(manager: EntityManager) {
  return {
    /** Yêu cầu đang chờ, sắp theo hạn duyệt (index `verification_requests_queue_idx`). */
    queue(kind: VerificationRequestKind | undefined, limit: number, offset: number) {
      return manager.query<QueueRow[]>(
        `SELECT r.id, r.kind, r.tutor_id, coalesce(u.full_name, u.display_name) AS tutor_name,
                p.occupation, c.title AS credential_title, c.kind AS credential_kind,
                r.submitted_at, r.review_due_at, ${ATTEMPT_SQL} AS attempt
           FROM verification_requests r
           JOIN users u ON u.id = r.tutor_id
           JOIN tutor_profiles p ON p.user_id = r.tutor_id
           LEFT JOIN tutor_credentials c ON c.id = r.credential_id
          WHERE r.status = 'pending' AND ($1::text IS NULL OR r.kind = $1)
          ORDER BY r.review_due_at, r.submitted_at, r.id
          LIMIT $2 OFFSET $3`,
        [kind ?? null, limit, offset],
      );
    },

    async pendingCounts(): Promise<{ identity: number; credential: number }> {
      const rows = await manager.query<{ kind: VerificationRequestKind; count: number }[]>(
        `SELECT kind, count(*)::int AS count FROM verification_requests
          WHERE status = 'pending' GROUP BY kind`,
      );
      const of = (kind: VerificationRequestKind) => rows.find((r) => r.kind === kind)?.count ?? 0;
      return { identity: of('identity'), credential: of('credential') };
    },

    /** Yêu cầu theo id (khóa dòng khi `lock`). */
    findRequest(id: string, options: { lock?: boolean } = {}) {
      const query = manager
        .getRepository(VerificationRequest)
        .createQueryBuilder('r')
        .where('r.id = :id', { id });
      if (options.lock) query.setLock('pessimistic_write');
      return query.getOne();
    },

    /** Yêu cầu kèm gia sư và bằng cấp, cho màn duyệt và email kết quả. */
    async detail(id: string): Promise<DetailRow | null> {
      const request = await this.findRequest(id);
      if (!request) return null;
      const [row] = await manager.query<
        {
          attempt: number;
          full_name: string | null;
          display_name: string;
          email: string | null;
          locale: 'vi' | 'en';
          occupation: TutorOccupation | null;
          institution: string | null;
          c_id: string | null;
          c_kind: CredentialKind | null;
          c_title: string | null;
          c_issuer: string | null;
          c_issued_year: number | null;
        }[]
      >(
        `SELECT ${ATTEMPT_SQL} AS attempt, u.full_name, u.display_name, u.email, u.locale,
                p.occupation, p.institution, c.id AS c_id, c.kind AS c_kind, c.title AS c_title,
                c.issuer AS c_issuer, c.issued_year AS c_issued_year
           FROM verification_requests r
           JOIN users u ON u.id = r.tutor_id
           JOIN tutor_profiles p ON p.user_id = r.tutor_id
           LEFT JOIN tutor_credentials c ON c.id = r.credential_id
          WHERE r.id = $1`,
        [id],
      );
      if (!row) return null;
      return {
        request,
        attempt: row.attempt,
        tutor: {
          id: request.tutorId,
          fullName: row.full_name,
          displayName: row.display_name,
          email: row.email,
          locale: row.locale,
          occupation: row.occupation,
          institution: row.institution,
        },
        credential:
          row.c_id && row.c_kind && row.c_title
            ? {
                id: row.c_id,
                kind: row.c_kind,
                title: row.c_title,
                issuer: row.c_issuer,
                issuedYear: row.c_issued_year,
              }
            : null,
      };
    },

    /** Các lần nộp trước (cùng gia sư, cùng loại, cùng bằng cấp), mới nhất trước. */
    history(request: VerificationRequest) {
      return manager.query<HistoryRow[]>(
        `SELECT id, status, submitted_at, reviewed_at, rejection_code, rejection_note
           FROM verification_requests
          WHERE tutor_id = $1 AND kind = $2 AND credential_id IS NOT DISTINCT FROM $3
            AND (submitted_at, id) < ($4, $5)
          ORDER BY submitted_at DESC, id DESC
          LIMIT 20`,
        [request.tutorId, request.kind, request.credentialId, request.submittedAt, request.id],
      );
    },

    async markReviewed(
      id: string,
      data: Pick<
        VerificationRequest,
        | 'status'
        | 'reviewedBy'
        | 'reviewedAt'
        | 'rejectionCode'
        | 'rejectionNote'
        | 'documentsPurgeAt'
      >,
    ): Promise<void> {
      await manager.getRepository(VerificationRequest).update({ id }, data);
    },
  };
}
