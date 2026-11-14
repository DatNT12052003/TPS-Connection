// Duyệt xác minh, phía Manager (G3 đợt 2; C1, C4, D20, B.4.1, B.4.2).
//   - Hàng chờ các yêu cầu đang chờ, sắp theo hạn duyệt (2 ngày làm việc, D26).
//   - Màn duyệt: thông tin gia sư tự khai, bằng cấp, danh sách giấy tờ (không có URL), các lần nộp trước.
//   - Xem ảnh: chỉ khi yêu cầu đang chờ; cấp URL đọc rất ngắn hạn và ghi nhật ký mỗi lần xem (C1).
//   - Duyệt / từ chối (kèm lý do) trong một transaction cùng nhật ký; đặt lịch xóa ảnh sau 30 ngày (C4);
//     gửi email kết quả sau khi commit.
// Manager kiêm gia sư không duyệt, không xem giấy tờ của chính mình. Không phụ thuộc Express.
import {
  DOCUMENT_RETENTION_DAYS,
  DOCUMENT_VIEW_URL_TTL_SECONDS,
  type DocumentViewUrl,
  type RejectVerificationRequest,
  VERIFICATION_QUEUE_PAGE_SIZE,
  type VerificationQueue,
  type VerificationQueueQuery,
  type VerificationRequestDetail,
} from '@tps/shared';
import type { DataSource, EntityManager } from 'typeorm';
import type { EmailMessage } from '../../lib/email/email-sender.js';
import { forbidden, invalidStateTransition, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import type { Storage } from '../../lib/storage.js';
import { createAuditRepository } from '../audit/audit.repository.js';
import { TutorCredential } from '../tutors/tutor-credential.entity.js';
import { TutorProfile } from '../tutors/tutor-profile.entity.js';
import { buildVerificationResultEmail } from './verification.emails.js';
import { createVerificationReviewRepository } from './verification-review.repository.js';
import type { VerificationRequest } from './verification-request.entity.js';
import { createVerificationRepository } from './verification.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Người duyệt và ngữ cảnh request, để ghi nhật ký. */
export interface Reviewer {
  userId: string;
  ipAddress: string | null;
}

export function createVerificationReviewService(deps: {
  dataSource: DataSource;
  storage: Pick<Storage, 'createDownloadUrl'>;
  sendEmail: (message: EmailMessage) => Promise<unknown>;
  /** Gốc URL của web, để dựng liên kết trong email. */
  webUrl: string;
  logger: Logger;
  now?: () => Date;
}) {
  const { dataSource, storage, logger } = deps;
  const now = deps.now ?? (() => new Date());

  /**
   * Khóa yêu cầu đang chờ để quyết định; người duyệt không được là chính gia sư đó. Khóa theo cùng thứ tự với
   * phía gia sư (hồ sơ hoặc bằng cấp trước, rồi yêu cầu) để hai bên không chờ nhau thành deadlock.
   */
  async function lockPending(
    manager: EntityManager,
    requestId: string,
    reviewer: Reviewer,
  ): Promise<VerificationRequest> {
    const repo = createVerificationReviewRepository(manager);
    const unlocked = await repo.findRequest(requestId);
    if (!unlocked) throw notFound('Verification request');
    if (unlocked.kind === 'identity') {
      await manager
        .getRepository(TutorProfile)
        .createQueryBuilder('p')
        .where('p.userId = :id', { id: unlocked.tutorId })
        .setLock('pessimistic_write')
        .getOne();
    } else {
      await manager
        .getRepository(TutorCredential)
        .createQueryBuilder('c')
        .where('c.id = :id', { id: unlocked.credentialId })
        .setLock('pessimistic_write')
        .getOne();
    }
    const request = await repo.findRequest(requestId, { lock: true });
    if (!request) throw notFound('Verification request');
    if (request.tutorId === reviewer.userId) {
      throw forbidden('Cannot review your own verification request');
    }
    if (request.status !== 'pending') {
      throw invalidStateTransition('Verification request is not pending');
    }
    return request;
  }

  /** Gửi email kết quả sau khi commit. Lỗi xếp hàng chỉ ghi log: quyết định đã lưu, gia sư vẫn thấy trên web. */
  async function notifyTutor(requestId: string, outcome: 'approved' | 'rejected'): Promise<void> {
    try {
      const detail = await createVerificationReviewRepository(dataSource.manager).detail(requestId);
      const email = detail?.tutor.email;
      if (!detail || !email) return;
      const { request, tutor, credential } = detail;
      await deps.sendEmail(
        buildVerificationResultEmail({
          locale: tutor.locale,
          to: email,
          name: tutor.displayName,
          kind: request.kind,
          credentialTitle: credential?.title ?? null,
          outcome,
          rejectionCode: request.rejectionCode,
          rejectionNote: request.rejectionNote,
          link: `${deps.webUrl.replace(/\/+$/, '')}/app/profile`,
        }),
      );
    } catch (err) {
      logger.error({ err, requestId }, 'Could not enqueue verification result email');
    }
  }

  return {
    async queue(query: VerificationQueueQuery): Promise<VerificationQueue> {
      const repo = createVerificationReviewRepository(dataSource.manager);
      const pageSize = VERIFICATION_QUEUE_PAGE_SIZE;
      const [rows, counts] = await Promise.all([
        repo.queue(query.kind, pageSize, (query.page - 1) * pageSize),
        repo.pendingCounts(),
      ]);
      const all = counts.identity + counts.credential;
      return {
        items: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          tutorId: r.tutor_id,
          tutorName: r.tutor_name,
          occupation: r.occupation,
          credentialTitle: r.credential_title,
          credentialKind: r.credential_kind,
          submittedAt: r.submitted_at.toISOString(),
          reviewDueAt: r.review_due_at.toISOString(),
          attempt: r.attempt,
        })),
        counts: { all, ...counts },
        page: query.page,
        pageSize,
        total: query.kind ? counts[query.kind] : all,
      };
    },

    async detail(requestId: string, reviewer: Reviewer): Promise<VerificationRequestDetail> {
      const repo = createVerificationReviewRepository(dataSource.manager);
      const row = await repo.detail(requestId);
      if (!row) throw notFound('Verification request');
      const { request } = row;
      const [history, documents] = await Promise.all([
        repo.history(request),
        createVerificationRepository(dataSource.manager).documentsOf([request.id]),
      ]);
      return {
        id: request.id,
        kind: request.kind,
        status: request.status,
        submittedAt: request.submittedAt.toISOString(),
        reviewDueAt: request.reviewDueAt.toISOString(),
        reviewedAt: request.reviewedAt?.toISOString() ?? null,
        rejectionCode: request.rejectionCode,
        rejectionNote: request.rejectionNote,
        attempt: row.attempt,
        tutor: {
          id: row.tutor.id,
          fullName: row.tutor.fullName,
          displayName: row.tutor.displayName,
          occupation: row.tutor.occupation,
          institution: row.tutor.institution,
        },
        credential: row.credential,
        documents: documents
          .filter((d) => d.fileStatus === 'ready')
          .map((d) => ({
            id: d.documentId,
            type: d.documentType,
            mimeType: d.mimeType,
            sizeBytes: d.sizeBytes,
          })),
        history: history.map((h) => ({
          id: h.id,
          status: h.status,
          submittedAt: h.submitted_at.toISOString(),
          reviewedAt: h.reviewed_at?.toISOString() ?? null,
          rejectionCode: h.rejection_code,
          rejectionNote: h.rejection_note,
        })),
        isOwnRequest: request.tutorId === reviewer.userId,
      };
    },

    /**
     * URL xem một giấy tờ (C1): chỉ khi yêu cầu đang chờ duyệt, sống {@link DOCUMENT_VIEW_URL_TTL_SECONDS}
     * giây. Nhật ký ghi trước khi ký URL, trong transaction: không ghi được nhật ký thì không có URL.
     */
    async viewDocument(
      requestId: string,
      documentId: string,
      reviewer: Reviewer,
    ): Promise<DocumentViewUrl> {
      const target = await dataSource.transaction(async (manager) => {
        const request = await createVerificationReviewRepository(manager).findRequest(requestId);
        if (!request) throw notFound('Verification request');
        if (request.tutorId === reviewer.userId) {
          throw forbidden('Cannot review your own verification request');
        }
        if (request.status !== 'pending') {
          throw invalidStateTransition('Documents can only be viewed while the request is pending');
        }
        const doc = await createVerificationRepository(manager).documentFile(requestId, documentId);
        if (!doc || doc.file.status !== 'ready') throw notFound('Document');
        await createAuditRepository(manager).record({
          actorUserId: reviewer.userId,
          actorRole: 'manager',
          action: 'verification.document_viewed',
          entityType: 'verification_request',
          entityId: requestId,
          metadata: { documentId, documentType: doc.documentType, tutorId: request.tutorId },
          ipAddress: reviewer.ipAddress,
        });
        return doc.file;
      });
      const url = await storage.createDownloadUrl(target.bucket, target.storageKey, {
        expiresInSeconds: DOCUMENT_VIEW_URL_TTL_SECONDS,
      });
      return {
        url,
        mimeType: target.mimeType,
        expiresAt: new Date(now().getTime() + DOCUMENT_VIEW_URL_TTL_SECONDS * 1000).toISOString(),
      };
    },

    /**
     * Duyệt (B.4.1 / B.4.2). Danh tính: hồ sơ `pending_verification` → `verified`, ghi `identity_verified_at`.
     * Bằng cấp: `verified`; bằng cấp loại `degree` bật `has_verified_degree` (D20). Ảnh xóa sau 30 ngày (C4).
     */
    async approve(requestId: string, reviewer: Reviewer): Promise<VerificationRequestDetail> {
      await dataSource.transaction(async (manager) => {
        const request = await lockPending(manager, requestId, reviewer);
        const at = now();
        const profiles = manager.getRepository(TutorProfile);
        if (request.kind === 'identity') {
          const profile = await profiles.findOneBy({ userId: request.tutorId });
          if (profile?.profileStatus !== 'pending_verification') {
            throw invalidStateTransition('Tutor profile is not pending verification');
          }
          await profiles.update(
            { userId: request.tutorId },
            { profileStatus: 'verified', identityVerifiedAt: at },
          );
        } else {
          const credentials = manager.getRepository(TutorCredential);
          const credential = await credentials.findOneBy({ id: request.credentialId ?? '' });
          if (credential?.verificationStatus !== 'pending') {
            throw invalidStateTransition('Credential is not pending verification');
          }
          await credentials.update(
            { id: credential.id },
            { verificationStatus: 'verified', verifiedAt: at },
          );
          if (credential.kind === 'degree') {
            await profiles.update({ userId: request.tutorId }, { hasVerifiedDegree: true });
          }
        }
        await finish(manager, request, reviewer, at, { status: 'approved' });
      });
      logger.info({ requestId, reviewerId: reviewer.userId }, 'Verification approved');
      await notifyTutor(requestId, 'approved');
      return this.detail(requestId, reviewer);
    },

    /**
     * Từ chối kèm lý do (B.4.1 / B.4.2). Danh tính: hồ sơ về `incomplete`, gia sư sửa và nộp lại. Bằng cấp:
     * `rejected`. Ảnh giấy tờ cũng xóa sau 30 ngày (không còn dùng cho việc gì khác).
     */
    async reject(
      requestId: string,
      input: RejectVerificationRequest,
      reviewer: Reviewer,
    ): Promise<VerificationRequestDetail> {
      await dataSource.transaction(async (manager) => {
        const request = await lockPending(manager, requestId, reviewer);
        if (request.kind === 'identity') {
          await manager
            .getRepository(TutorProfile)
            .update(
              { userId: request.tutorId, profileStatus: 'pending_verification' },
              { profileStatus: 'incomplete' },
            );
        } else {
          await manager
            .getRepository(TutorCredential)
            .update(
              { id: request.credentialId ?? '', verificationStatus: 'pending' },
              { verificationStatus: 'rejected' },
            );
        }
        await finish(manager, request, reviewer, now(), {
          status: 'rejected',
          rejectionCode: input.rejectionCode,
          rejectionNote: input.rejectionNote ?? null,
        });
      });
      logger.info({ requestId, reviewerId: reviewer.userId }, 'Verification rejected');
      await notifyTutor(requestId, 'rejected');
      return this.detail(requestId, reviewer);
    },
  };

  /** Ghi kết quả, lịch xóa ảnh và nhật ký cho một quyết định (trong transaction). */
  async function finish(
    manager: EntityManager,
    request: VerificationRequest,
    reviewer: Reviewer,
    at: Date,
    outcome:
      | { status: 'approved' }
      | {
          status: 'rejected';
          rejectionCode: RejectVerificationRequest['rejectionCode'];
          rejectionNote: string | null;
        },
  ): Promise<void> {
    const purgeAt = new Date(at.getTime() + DOCUMENT_RETENTION_DAYS * DAY_MS);
    await createVerificationReviewRepository(manager).markReviewed(request.id, {
      status: outcome.status,
      reviewedBy: reviewer.userId,
      reviewedAt: at,
      rejectionCode: outcome.status === 'rejected' ? outcome.rejectionCode : null,
      rejectionNote: outcome.status === 'rejected' ? outcome.rejectionNote : null,
      documentsPurgeAt: purgeAt,
    });
    await createVerificationRepository(manager).schedulePurge(request.id, purgeAt);
    await createAuditRepository(manager).record({
      actorUserId: reviewer.userId,
      actorRole: 'manager',
      action: outcome.status === 'approved' ? 'verification.approved' : 'verification.rejected',
      entityType: 'verification_request',
      entityId: request.id,
      metadata: {
        kind: request.kind,
        tutorId: request.tutorId,
        ...(request.credentialId && { credentialId: request.credentialId }),
        ...(outcome.status === 'rejected' && { rejectionCode: outcome.rejectionCode }),
      },
      ipAddress: reviewer.ipAddress,
    });
  }
}

export type VerificationReviewService = ReturnType<typeof createVerificationReviewService>;
