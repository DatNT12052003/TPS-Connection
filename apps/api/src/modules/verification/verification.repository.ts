import type {
  FileStatus,
  VerificationDocumentType,
  VerificationRejectionCode,
  VerificationRequestKind,
} from '@tps/shared';
import { type EntityManager, In } from 'typeorm';
import { StoredFile } from '../files/stored-file.entity.js';
import { VerificationDocument } from './verification-document.entity.js';
import { VerificationRequest } from './verification-request.entity.js';

/** Giấy tờ kèm metadata của tệp (không có khóa lưu trữ: chỉ người duyệt mới mở được ảnh). */
export interface DocumentWithFile {
  documentId: string;
  requestId: string;
  documentType: VerificationDocumentType;
  fileStatus: FileStatus;
  fileId: string;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number;
}

/** Truy cập yêu cầu xác minh và giấy tờ. Không kiểm tra quyền (service làm). */
export function createVerificationRepository(manager: EntityManager) {
  const requests = manager.getRepository(VerificationRequest);
  const documents = manager.getRepository(VerificationDocument);

  return {
    /** Yêu cầu gần nhất của gia sư theo loại (danh tính) hoặc theo bằng cấp. */
    findLatest(
      tutorId: string,
      kind: VerificationRequestKind,
      credentialId: string | null = null,
    ): Promise<VerificationRequest | null> {
      const query = requests
        .createQueryBuilder('r')
        .where('r.tutorId = :tutorId', { tutorId })
        .andWhere('r.kind = :kind', { kind })
        .orderBy('r.submittedAt', 'DESC')
        .addOrderBy('r.id', 'DESC');
      if (credentialId) query.andWhere('r.credentialId = :credentialId', { credentialId });
      return query.getOne();
    },

    /** Yêu cầu đang chờ (khóa dòng khi `lock`). Mỗi gia sư có tối đa một cho danh tính, một cho mỗi bằng cấp. */
    findPending(
      tutorId: string,
      kind: VerificationRequestKind,
      options: { credentialId?: string; lock?: boolean } = {},
    ): Promise<VerificationRequest | null> {
      const query = requests
        .createQueryBuilder('r')
        .where('r.tutorId = :tutorId', { tutorId })
        .andWhere('r.kind = :kind', { kind })
        .andWhere(`r.status = 'pending'`);
      if (options.credentialId) {
        query.andWhere('r.credentialId = :credentialId', { credentialId: options.credentialId });
      }
      if (options.lock) query.setLock('pessimistic_write');
      return query.getOne();
    },

    create(
      data: Pick<
        VerificationRequest,
        'tutorId' | 'kind' | 'credentialId' | 'submittedAt' | 'reviewDueAt'
      >,
    ): Promise<VerificationRequest> {
      return requests.save(requests.create(data));
    },

    async addDocuments(
      requestId: string,
      docs: { documentType: VerificationDocumentType; fileId: string }[],
    ): Promise<void> {
      await documents.insert(docs.map((d) => ({ requestId, ...d })));
    },

    async cancel(id: string): Promise<void> {
      await requests.update({ id }, { status: 'cancelled', cancelledAt: () => 'now()' });
    },

    /** Giấy tờ của các yêu cầu, kèm tên, loại, dung lượng tệp. Thứ tự theo lúc thêm. */
    async documentsOf(requestIds: string[]): Promise<DocumentWithFile[]> {
      if (requestIds.length === 0) return [];
      const rows = await documents
        .createQueryBuilder('d')
        .innerJoin(StoredFile, 'f', 'f.id = d.file_id')
        .select('d.id', 'documentId')
        .addSelect('d.request_id', 'requestId')
        .addSelect('d.document_type', 'documentType')
        .addSelect('f.status', 'fileStatus')
        .addSelect('d.file_id', 'fileId')
        .addSelect('f.original_name', 'fileName')
        .addSelect('f.mime_type', 'mimeType')
        .addSelect('f.size_bytes', 'sizeBytes')
        .where('d.request_id IN (:...requestIds)', { requestIds })
        .orderBy('d.created_at', 'ASC')
        .addOrderBy('d.id', 'ASC')
        .getRawMany<DocumentWithFile>();
      return rows.map((r) => ({ ...r, sizeBytes: Number(r.sizeBytes) }));
    },

    /** Tệp của một giấy tờ thuộc đúng yêu cầu này (không tìm theo id giấy tờ trần). */
    async documentFile(
      requestId: string,
      documentId: string,
    ): Promise<{ documentType: VerificationDocumentType; file: StoredFile } | null> {
      const doc = await documents.findOneBy({ id: documentId, requestId });
      if (!doc) return null;
      const file = await manager.getRepository(StoredFile).findOneBy({ id: doc.fileId });
      return file ? { documentType: doc.documentType, file } : null;
    },

    /** Đặt lịch xóa tệp giấy tờ của một yêu cầu (`files.purge_after`, C4). */
    async schedulePurge(requestId: string, at: Date): Promise<void> {
      await manager.query(
        `UPDATE files SET purge_after = $2
          WHERE id IN (SELECT file_id FROM verification_documents WHERE request_id = $1)`,
        [requestId, at],
      );
    },

    /** Những tệp trong danh sách đã gắn vào một yêu cầu xác minh nào đó. */
    async usedFileIds(fileIds: string[]): Promise<Set<string>> {
      if (fileIds.length === 0) return new Set();
      const rows = await documents.find({
        select: { fileId: true },
        where: { fileId: In(fileIds) },
      });
      return new Set(rows.map((r) => r.fileId));
    },

    /** Lý do từ chối gần nhất của từng bằng cấp (chỉ bằng cấp đã có lần bị từ chối). */
    async latestCredentialRejections(
      credentialIds: string[],
    ): Promise<Map<string, { code: VerificationRejectionCode; note: string | null }>> {
      if (credentialIds.length === 0) return new Map();
      const rows = await manager.query<
        {
          credential_id: string;
          rejection_code: VerificationRejectionCode;
          rejection_note: string | null;
        }[]
      >(
        `SELECT DISTINCT ON (credential_id) credential_id, rejection_code, rejection_note
           FROM verification_requests
          WHERE credential_id = ANY($1::uuid[]) AND status = 'rejected'
          ORDER BY credential_id, reviewed_at DESC, id DESC`,
        [credentialIds],
      );
      return new Map(
        rows.map((r) => [r.credential_id, { code: r.rejection_code, note: r.rejection_note }]),
      );
    },

    /**
     * Xóa lịch sử xác minh của một bằng cấp gia sư tự xóa (chỉ bằng cấp tự khai hoặc bị từ chối, không có yêu
     * cầu đang chờ). Trả id các tệp giấy tờ để service đánh dấu xóa và dọn khỏi kho.
     */
    async deleteForCredential(credentialId: string): Promise<string[]> {
      const rows = await requests.find({ select: { id: true }, where: { credentialId } });
      const requestIds = rows.map((r) => r.id);
      if (requestIds.length === 0) return [];
      const docs = await documents.find({
        select: { fileId: true },
        where: { requestId: In(requestIds) },
      });
      await documents.delete({ requestId: In(requestIds) });
      await requests.delete({ id: In(requestIds) });
      return docs.map((d) => d.fileId);
    },
  };
}

export type VerificationRepository = ReturnType<typeof createVerificationRepository>;
