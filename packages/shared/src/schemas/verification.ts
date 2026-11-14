// Xác minh gia sư (G3, C4, B.4): gia sư nộp giấy tờ danh tính và giấy tờ của bằng cấp. Tệp tải lên trước qua
// `POST /files/uploads` (purpose `verification_document` hoặc `credential`), rồi gửi id tệp khi nộp.
import { z } from 'zod';
import {
  type TutorOccupation,
  VerificationDocumentType,
  VerificationRejectionCode,
  VerificationRequestKind,
  VerificationRequestStatus,
} from '../statuses.js';
import { Id } from './common.js';

/** Phiên bản văn bản "đồng ý dùng giấy tờ để xác minh", ghi vào `user_consents.version`. */
export const VERIFICATION_DOCUMENT_CONSENT_VERSION = '2026-11-14';

/** Số tệp tối đa khi nộp xác minh một bằng cấp (bằng nhiều trang, chứng chỉ hai mặt). */
export const MAX_CREDENTIAL_DOCUMENTS = 3;

/** Giấy tờ danh tính được nộp. CCCD hai mặt luôn bắt buộc; thẻ sinh viên khi gia sư là sinh viên (C4). */
export const IDENTITY_DOCUMENT_TYPES = [
  'national_id_front',
  'national_id_back',
  'student_card',
] as const satisfies readonly VerificationDocumentType[];
export type IdentityDocumentType = (typeof IDENTITY_DOCUMENT_TYPES)[number];

/** Giấy tờ bắt buộc khi nộp xác minh danh tính, theo nghề nghiệp tự khai (C4). */
export function requiredIdentityDocuments(
  occupation: TutorOccupation | null,
): IdentityDocumentType[] {
  return occupation === 'university_student'
    ? ['national_id_front', 'national_id_back', 'student_card']
    : ['national_id_front', 'national_id_back'];
}

// ---- Request ------------------------------------------------------------------------------------

export const SubmittedIdentityDocument = z.object({
  type: z.enum(IDENTITY_DOCUMENT_TYPES),
  fileId: Id,
});
export type SubmittedIdentityDocument = z.infer<typeof SubmittedIdentityDocument>;

/**
 * Nộp xác minh danh tính. Mỗi loại giấy tờ một ảnh; đủ loại bắt buộc thì API kiểm tra (phụ thuộc nghề nghiệp
 * đã lưu). Phải đồng ý cho nền tảng dùng giấy tờ để xác minh (lưu `user_consents`).
 */
export const SubmitIdentityVerificationRequest = z.object({
  documents: z
    .array(SubmittedIdentityDocument)
    .min(1, { error: 'documents_incomplete' })
    .max(IDENTITY_DOCUMENT_TYPES.length, { error: 'duplicate_document' })
    .refine((docs) => new Set(docs.map((d) => d.type)).size === docs.length, {
      error: 'duplicate_document',
    })
    .refine((docs) => new Set(docs.map((d) => d.fileId)).size === docs.length, {
      error: 'duplicate_document',
    }),
  acceptDocumentProcessing: z.literal(true, { error: 'must_accept_document_processing' }),
});
export type SubmitIdentityVerificationRequest = z.infer<typeof SubmitIdentityVerificationRequest>;

/** Nộp xác minh một bằng cấp/chứng chỉ: 1 đến 3 tệp (ảnh hoặc PDF). Loại giấy tờ suy ra từ loại bằng cấp. */
export const SubmitCredentialVerificationRequest = z.object({
  fileIds: z
    .array(Id)
    .min(1, { error: 'documents_incomplete' })
    .max(MAX_CREDENTIAL_DOCUMENTS, { error: 'too_many' })
    .refine((ids) => new Set(ids).size === ids.length, { error: 'duplicate_document' }),
});
export type SubmitCredentialVerificationRequest = z.infer<
  typeof SubmitCredentialVerificationRequest
>;

// ---- Response -----------------------------------------------------------------------------------

/** Một giấy tờ đã nộp, như gia sư thấy: không có đường dẫn tới ảnh (ảnh chỉ người duyệt xem, C1). */
export const VerificationDocumentInfo = z.object({
  type: VerificationDocumentType,
  fileName: z.string().nullable(),
  mimeType: z.string(),
  sizeBytes: z.int().positive(),
});
export type VerificationDocumentInfo = z.infer<typeof VerificationDocumentInfo>;

/** Một yêu cầu xác minh của chính gia sư. */
export const OwnVerificationRequest = z.object({
  id: Id,
  kind: VerificationRequestKind,
  status: VerificationRequestStatus,
  submittedAt: z.iso.datetime(),
  /** Hạn duyệt: hết ngày làm việc thứ hai sau khi nộp, giờ Việt Nam (C4, D26). */
  reviewDueAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
  rejectionCode: VerificationRejectionCode.nullable(),
  rejectionNote: z.string().nullable(),
  documents: z.array(VerificationDocumentInfo),
});
export type OwnVerificationRequest = z.infer<typeof OwnVerificationRequest>;

/** Tình trạng xác minh danh tính của chính gia sư (`GET /me/tutor-profile/verification`). */
export const OwnIdentityVerification = z.object({
  /** Yêu cầu xác minh danh tính gần nhất (mọi trạng thái); chưa nộp lần nào: null. */
  latest: OwnVerificationRequest.nullable(),
  /** Giấy tờ bắt buộc theo nghề nghiệp hiện tại (C4). */
  requiredDocuments: z.array(z.enum(IDENTITY_DOCUMENT_TYPES)),
  /** Nộp được ngay: hồ sơ `incomplete` và đã đủ trường bắt buộc (D34). */
  canSubmit: z.boolean(),
});
export type OwnIdentityVerification = z.infer<typeof OwnIdentityVerification>;
