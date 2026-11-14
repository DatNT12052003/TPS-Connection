// Xác minh gia sư, phía gia sư (G3 đợt 1; C4, B.4.1, B.4.2). Gia sư nộp giấy tờ danh tính (CCCD hai mặt, thêm
// thẻ sinh viên nếu là sinh viên) khi hồ sơ đã đủ trường bắt buộc (D34); hồ sơ chuyển `pending_verification`.
// Gia sư hủy được yêu cầu đang chờ. Bằng cấp nộp riêng từng cái để lấy huy hiệu (D5, D20).
// Ảnh giấy tờ không bao giờ trả về cho gia sư hay ai khác ở đây; người duyệt xem ở phần Manager (đợt 2).
// Không phụ thuộc Express.
import {
  type IdentityDocumentType,
  type OwnIdentityVerification,
  type OwnVerificationRequest,
  requiredIdentityDocuments,
  type SubmitCredentialVerificationRequest,
  type SubmitIdentityVerificationRequest,
  type TutorCredential as TutorCredentialDto,
  VERIFICATION_DOCUMENT_CONSENT_VERSION,
} from '@tps/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AppError, invalidStateTransition, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import type { FilesService } from '../files/files.service.js';
import type { StoredFile } from '../files/stored-file.entity.js';
import { createTutorsRepository } from '../tutors/tutors.repository.js';
import { missingForVerification, toCredentialDto } from '../tutors/tutors.service.js';
import { createUsersRepository } from '../users/users.repository.js';
import { reviewDueAt } from './review-deadline.js';
import type { VerificationRequest } from './verification-request.entity.js';
import { createVerificationRepository, type DocumentWithFile } from './verification.repository.js';

const fieldError = (path: string, code: string, message: string) =>
  new AppError('validation_failed', message, [{ path, code, message }]);

function toRequestDto(
  request: VerificationRequest,
  documents: DocumentWithFile[],
): OwnVerificationRequest {
  return {
    id: request.id,
    kind: request.kind,
    status: request.status,
    submittedAt: request.submittedAt.toISOString(),
    reviewDueAt: request.reviewDueAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    rejectionCode: request.rejectionCode,
    rejectionNote: request.rejectionNote,
    documents: documents
      .filter((d) => d.requestId === request.id)
      .map((d) => ({
        type: d.documentType,
        fileName: d.fileName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
      })),
  };
}

export function createVerificationService(deps: {
  dataSource: DataSource;
  files: FilesService;
  logger: Logger;
}) {
  const { dataSource, files, logger } = deps;

  /**
   * Nhận các tệp đã tải lên cho một yêu cầu: của đúng gia sư, đúng mục đích, đã lên kho, và chưa gắn vào yêu
   * cầu nào khác (nộp lại sau khi bị từ chối phải tải ảnh mới). Lỗi chỉ ra đúng ô.
   */
  async function claimDocuments(
    manager: EntityManager,
    tutorId: string,
    fileIds: { fileId: string; path: string }[],
    purpose: 'verification_document' | 'credential',
  ): Promise<void> {
    const used = await createVerificationRepository(manager).usedFileIds(
      fileIds.map((f) => f.fileId),
    );
    for (const { fileId, path } of fileIds) {
      if (used.has(fileId)) throw fieldError(path, 'file_not_uploaded', 'File is already used');
      try {
        await files.claimUploaded(manager, tutorId, fileId, purpose);
      } catch (err) {
        if (err instanceof AppError && err.code === 'validation_failed') {
          throw fieldError(path, 'file_not_uploaded', 'File is not uploaded');
        }
        throw err;
      }
    }
  }

  /** Đánh dấu xóa các tệp giấy tờ trong transaction; trả về để xóa khỏi kho sau khi commit. */
  async function markFilesDeleted(manager: EntityManager, fileIds: string[]) {
    const deleted: StoredFile[] = [];
    for (const fileId of fileIds) {
      const file = await files.markDeleted(manager, fileId);
      if (file) deleted.push(file);
    }
    return deleted;
  }

  async function purgeAll(deleted: StoredFile[]): Promise<void> {
    await Promise.all(deleted.map((file) => files.purgeObject(file)));
  }

  async function documentFileIds(manager: EntityManager, requestId: string): Promise<string[]> {
    const docs = await createVerificationRepository(manager).documentsOf([requestId]);
    return docs.map((d) => d.fileId);
  }

  async function getIdentity(tutorId: string): Promise<OwnIdentityVerification> {
    const tutors = createTutorsRepository(dataSource.manager);
    const verification = createVerificationRepository(dataSource.manager);
    const profile = await tutors.ensureProfile(tutorId);
    const [items, user, latest] = await Promise.all([
      tutors.items(tutorId),
      createUsersRepository(dataSource.manager).findById(tutorId),
      verification.findLatest(tutorId, 'identity'),
    ]);
    const documents = latest ? await verification.documentsOf([latest.id]) : [];
    const missing = missingForVerification(profile, items, user?.fullName ?? null);
    return {
      latest: latest ? toRequestDto(latest, documents) : null,
      requiredDocuments: requiredIdentityDocuments(profile.occupation),
      canSubmit: profile.profileStatus === 'incomplete' && missing.length === 0,
    };
  }

  /** Bằng cấp của gia sư dạng DTO, kèm lý do từ chối gần nhất nếu đang bị từ chối. */
  async function credentialDto(
    manager: EntityManager,
    tutorId: string,
    credentialId: string,
  ): Promise<TutorCredentialDto> {
    const credential = await createTutorsRepository(manager).findCredential(tutorId, credentialId);
    if (!credential) throw notFound('Credential');
    const rejections = await createVerificationRepository(manager).latestCredentialRejections([
      credential.id,
    ]);
    return toCredentialDto(credential, rejections.get(credential.id));
  }

  return {
    getIdentity,

    /**
     * Nộp xác minh danh tính (B.4.1 `incomplete` → `pending_verification`). Cần: hồ sơ đang `incomplete`, đủ
     * trường bắt buộc (D34), đủ giấy tờ theo nghề nghiệp (C4), đồng ý dùng giấy tờ để xác minh.
     */
    async submitIdentity(
      tutorId: string,
      input: SubmitIdentityVerificationRequest,
      ipAddress: string | null,
    ): Promise<OwnIdentityVerification> {
      await dataSource.transaction(async (manager) => {
        const tutors = createTutorsRepository(manager);
        await tutors.ensureProfile(tutorId);
        // Khóa dòng hồ sơ: hai lần nộp cùng lúc chạy lần lượt.
        const profile = await tutors.findProfile(tutorId, { lock: true });
        if (!profile || profile.profileStatus !== 'incomplete') {
          throw invalidStateTransition('Profile is already pending verification or verified');
        }
        const [items, user] = await Promise.all([
          tutors.items(tutorId),
          createUsersRepository(manager).findById(tutorId),
        ]);
        if (missingForVerification(profile, items, user?.fullName ?? null).length > 0) {
          throw invalidStateTransition('Profile is missing required fields');
        }

        const required = requiredIdentityDocuments(profile.occupation);
        input.documents.forEach((doc, index) => {
          if (!required.includes(doc.type)) {
            throw fieldError(
              `documents.${index}.type`,
              'document_type_not_allowed',
              'Document type is not used for this request',
            );
          }
        });
        const given = new Set<IdentityDocumentType>(input.documents.map((d) => d.type));
        if (required.some((type) => !given.has(type))) {
          throw fieldError('documents', 'documents_incomplete', 'Required documents are missing');
        }

        await claimDocuments(
          manager,
          tutorId,
          input.documents.map((d, index) => ({
            fileId: d.fileId,
            path: `documents.${index}.fileId`,
          })),
          'verification_document',
        );

        const verification = createVerificationRepository(manager);
        const now = new Date();
        const request = await verification.create({
          tutorId,
          kind: 'identity',
          credentialId: null,
          submittedAt: now,
          reviewDueAt: reviewDueAt(now),
        });
        await verification.addDocuments(
          request.id,
          input.documents.map((d) => ({ documentType: d.type, fileId: d.fileId })),
        );
        await tutors.setProfileStatus(tutorId, 'pending_verification');
        await createUsersRepository(manager).recordConsents(
          tutorId,
          ['verification_document_processing'],
          VERIFICATION_DOCUMENT_CONSENT_VERSION,
          ipAddress,
        );
        logger.info({ userId: tutorId, requestId: request.id }, 'Identity verification submitted');
      });
      return getIdentity(tutorId);
    },

    /**
     * Gia sư hủy yêu cầu xác minh danh tính đang chờ (B.4.1 `pending_verification` → `incomplete`). Ảnh giấy
     * tờ không còn dùng nên xóa ngay.
     */
    async cancelIdentity(tutorId: string): Promise<void> {
      const deleted = await dataSource.transaction(async (manager) => {
        const tutors = createTutorsRepository(manager);
        const profile = await tutors.findProfile(tutorId, { lock: true });
        const verification = createVerificationRepository(manager);
        const pending = profile
          ? await verification.findPending(tutorId, 'identity', { lock: true })
          : null;
        if (!profile || !pending) throw notFound('Pending verification request');
        await verification.cancel(pending.id);
        if (profile.profileStatus === 'pending_verification') {
          await tutors.setProfileStatus(tutorId, 'incomplete');
        }
        logger.info({ userId: tutorId, requestId: pending.id }, 'Identity verification cancelled');
        return markFilesDeleted(manager, await documentFileIds(manager, pending.id));
      });
      await purgeAll(deleted);
    },

    /**
     * Nộp xác minh một bằng cấp (B.4.2): bằng cấp tự khai hoặc bị từ chối → `pending`. Loại giấy tờ theo loại
     * bằng cấp. Không cần đã xác minh danh tính.
     */
    async submitCredential(
      tutorId: string,
      credentialId: string,
      input: SubmitCredentialVerificationRequest,
    ): Promise<TutorCredentialDto> {
      return dataSource.transaction(async (manager) => {
        const tutors = createTutorsRepository(manager);
        const credential = await tutors.findCredential(tutorId, credentialId, { lock: true });
        if (!credential) throw notFound('Credential');
        if (
          credential.verificationStatus !== 'self_declared' &&
          credential.verificationStatus !== 'rejected'
        ) {
          throw invalidStateTransition('Credential is pending review or verified');
        }
        await claimDocuments(
          manager,
          tutorId,
          input.fileIds.map((fileId, index) => ({ fileId, path: `fileIds.${index}` })),
          'credential',
        );
        const verification = createVerificationRepository(manager);
        const now = new Date();
        const request = await verification.create({
          tutorId,
          kind: 'credential',
          credentialId,
          submittedAt: now,
          reviewDueAt: reviewDueAt(now),
        });
        await verification.addDocuments(
          request.id,
          input.fileIds.map((fileId) => ({ documentType: credential.kind, fileId })),
        );
        await tutors.updateCredential(credentialId, { verificationStatus: 'pending' });
        logger.info(
          { userId: tutorId, credentialId, requestId: request.id },
          'Credential verification submitted',
        );
        return credentialDto(manager, tutorId, credentialId);
      });
    },

    /** Gia sư hủy yêu cầu xác minh bằng cấp đang chờ: bằng cấp về tự khai, ảnh xóa ngay. */
    async cancelCredential(tutorId: string, credentialId: string): Promise<void> {
      const deleted = await dataSource.transaction(async (manager) => {
        const tutors = createTutorsRepository(manager);
        const credential = await tutors.findCredential(tutorId, credentialId, { lock: true });
        const verification = createVerificationRepository(manager);
        const pending = credential
          ? await verification.findPending(tutorId, 'credential', { credentialId, lock: true })
          : null;
        if (!credential || !pending) throw notFound('Pending verification request');
        await verification.cancel(pending.id);
        await tutors.updateCredential(credentialId, { verificationStatus: 'self_declared' });
        logger.info(
          { userId: tutorId, credentialId, requestId: pending.id },
          'Credential verification cancelled',
        );
        return markFilesDeleted(manager, await documentFileIds(manager, pending.id));
      });
      await purgeAll(deleted);
    },
  };
}

export type VerificationService = ReturnType<typeof createVerificationService>;
