// Xác minh gia sư (G3, C4, B.4): gia sư nộp giấy tờ danh tính và giấy tờ của bằng cấp. Tệp tải lên trước qua
// `POST /files/uploads` (purpose `verification_document` hoặc `credential`), rồi gửi id tệp khi nộp.
import { z } from 'zod';
import {
  CredentialKind,
  TutorOccupation,
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

// ---- Phía Manager (G3 đợt 2) ----------------------------------------------------------------------

/** Ảnh giấy tờ được xóa sau từng này ngày kể từ khi duyệt (C4, chờ luật sư xác nhận). */
export const DOCUMENT_RETENTION_DAYS = 30;

/** URL xem ảnh giấy tờ cho người duyệt sống ngắn: đủ để mở ảnh, không đủ để chia sẻ đi. */
export const DOCUMENT_VIEW_URL_TTL_SECONDS = 120;

export const VERIFICATION_QUEUE_PAGE_SIZE = 20;

export const VerificationQueueQuery = z.object({
  kind: VerificationRequestKind.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type VerificationQueueQuery = z.infer<typeof VerificationQueueQuery>;

export const VerificationRequestIdParams = z.object({ requestId: Id });
export type VerificationRequestIdParams = z.infer<typeof VerificationRequestIdParams>;

export const VerificationDocumentParams = z.object({ requestId: Id, documentId: Id });
export type VerificationDocumentParams = z.infer<typeof VerificationDocumentParams>;

/** Một dòng trong hàng chờ duyệt (chỉ yêu cầu đang chờ), sắp theo hạn duyệt. */
export const VerificationQueueItem = z.object({
  id: Id,
  kind: VerificationRequestKind,
  tutorId: Id,
  /** Họ tên thật (người duyệt đối chiếu với giấy tờ); chưa có thì tên hiển thị. */
  tutorName: z.string(),
  occupation: TutorOccupation.nullable(),
  credentialTitle: z.string().nullable(),
  credentialKind: CredentialKind.nullable(),
  submittedAt: z.iso.datetime(),
  reviewDueAt: z.iso.datetime(),
  /** Lần nộp thứ mấy cho cùng danh tính / cùng bằng cấp. */
  attempt: z.int().positive(),
});
export type VerificationQueueItem = z.infer<typeof VerificationQueueItem>;

export const VerificationQueue = z.object({
  items: z.array(VerificationQueueItem),
  /** Số yêu cầu đang chờ theo loại, cho các nút lọc. */
  counts: z.object({ all: z.int(), identity: z.int(), credential: z.int() }),
  page: z.int(),
  pageSize: z.int(),
  total: z.int(),
});
export type VerificationQueue = z.infer<typeof VerificationQueue>;

/** Một giấy tờ trong màn duyệt: không có URL; xem ảnh bằng một yêu cầu riêng (được ghi nhật ký). */
export const ReviewDocument = z.object({
  id: Id,
  type: VerificationDocumentType,
  mimeType: z.string(),
  sizeBytes: z.int().positive(),
});
export type ReviewDocument = z.infer<typeof ReviewDocument>;

/** Màn duyệt một yêu cầu xác minh. */
export const VerificationRequestDetail = z.object({
  id: Id,
  kind: VerificationRequestKind,
  status: VerificationRequestStatus,
  submittedAt: z.iso.datetime(),
  reviewDueAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
  rejectionCode: VerificationRejectionCode.nullable(),
  rejectionNote: z.string().nullable(),
  attempt: z.int().positive(),
  tutor: z.object({
    id: Id,
    fullName: z.string().nullable(),
    displayName: z.string(),
    occupation: TutorOccupation.nullable(),
    institution: z.string().nullable(),
  }),
  credential: z
    .object({
      id: Id,
      kind: CredentialKind,
      title: z.string(),
      issuer: z.string().nullable(),
      issuedYear: z.int().nullable(),
    })
    .nullable(),
  /** Rỗng khi ảnh đã bị xóa theo hạn lưu giữ. */
  documents: z.array(ReviewDocument),
  /** Các lần nộp trước cho cùng danh tính / cùng bằng cấp, mới nhất trước. */
  history: z.array(
    z.object({
      id: Id,
      status: VerificationRequestStatus,
      submittedAt: z.iso.datetime(),
      reviewedAt: z.iso.datetime().nullable(),
      rejectionCode: VerificationRejectionCode.nullable(),
      rejectionNote: z.string().nullable(),
    }),
  ),
  /** Người đang xem là chính gia sư này (Manager kiêm gia sư): không được duyệt yêu cầu của mình. */
  isOwnRequest: z.boolean(),
});
export type VerificationRequestDetail = z.infer<typeof VerificationRequestDetail>;

export const DocumentViewUrl = z.object({
  url: z.url(),
  mimeType: z.string(),
  expiresAt: z.iso.datetime(),
});
export type DocumentViewUrl = z.infer<typeof DocumentViewUrl>;

/** Từ chối: chọn lý do; lý do "khác" bắt buộc ghi chú. Gia sư đọc được cả hai. */
export const RejectVerificationRequest = z
  .object({
    rejectionCode: VerificationRejectionCode,
    rejectionNote: z
      .string()
      .trim()
      .max(1000, { error: 'too_long' })
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
  })
  .refine((v) => v.rejectionCode !== 'other' || Boolean(v.rejectionNote), {
    path: ['rejectionNote'],
    error: 'required',
  });
export type RejectVerificationRequest = z.infer<typeof RejectVerificationRequest>;
