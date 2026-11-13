// Tệp người dùng tải lên: mục đích, bucket, loại và dung lượng cho phép. API kiểm tra trước khi cấp
// presigned URL; web dùng cùng quy tắc để báo lỗi ngay trong form. Giá trị khớp với bảng `files`
// (docs/thiet_ke_co_so_du_lieu.md).
import { z } from 'zod';

/** `files.purpose`. */
export const FilePurpose = z.enum([
  'avatar',
  'verification_document',
  'credential',
  'message_attachment',
  'assignment_resource',
  'submission',
  'post_media',
  'other',
]);
export type FilePurpose = z.infer<typeof FilePurpose>;

/** `files.bucket`. public: đọc bằng URL thẳng (ảnh đại diện, ảnh bài đăng); private: chỉ qua presigned URL. */
export const FileBucket = z.enum(['public', 'private']);
export type FileBucket = z.infer<typeof FileBucket>;

/** `files.status`. */
export const FileStatus = z.enum(['pending_upload', 'ready', 'deleted']);
export type FileStatus = z.infer<typeof FileStatus>;

const MB = 1024 * 1024;

const IMAGES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const PDF = 'application/pdf';
const OFFICE = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export interface FileRule {
  bucket: FileBucket;
  maxBytes: number;
  mimeTypes: readonly string[];
}

/**
 * Quy tắc theo mục đích. Giấy tờ xác minh luôn ở bucket private (CHECK trong bảng `files`, C4).
 * Dung lượng tối đa là giá trị mặc định đề xuất ở G1, chủ dự án có thể điều chỉnh.
 */
export const FILE_RULES: Record<FilePurpose, FileRule> = {
  avatar: { bucket: 'public', maxBytes: 5 * MB, mimeTypes: IMAGES },
  post_media: { bucket: 'public', maxBytes: 5 * MB, mimeTypes: IMAGES },
  verification_document: { bucket: 'private', maxBytes: 10 * MB, mimeTypes: [...IMAGES, PDF] },
  credential: { bucket: 'private', maxBytes: 10 * MB, mimeTypes: [...IMAGES, PDF] },
  message_attachment: { bucket: 'private', maxBytes: 10 * MB, mimeTypes: [...IMAGES, PDF] },
  assignment_resource: {
    bucket: 'private',
    maxBytes: 20 * MB,
    mimeTypes: [...IMAGES, PDF, ...OFFICE],
  },
  submission: { bucket: 'private', maxBytes: 20 * MB, mimeTypes: [...IMAGES, PDF, ...OFFICE] },
  other: { bucket: 'private', maxBytes: 10 * MB, mimeTypes: [...IMAGES, PDF] },
};

/** Yêu cầu cấp URL upload. Lỗi trả về là mã có bản dịch `validation.*`. */
export const UploadRequest = z
  .object({
    purpose: FilePurpose,
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string().trim().toLowerCase(),
    sizeBytes: z.int().positive(),
  })
  .superRefine((value, ctx) => {
    const rule = FILE_RULES[value.purpose];
    if (!rule.mimeTypes.includes(value.contentType)) {
      ctx.addIssue({ code: 'custom', path: ['contentType'], message: 'file_type_not_allowed' });
    }
    if (value.sizeBytes > rule.maxBytes) {
      ctx.addIssue({ code: 'custom', path: ['sizeBytes'], message: 'file_too_large' });
    }
  });
export type UploadRequest = z.infer<typeof UploadRequest>;

/**
 * URL để trình duyệt PUT tệp thẳng lên kho lưu trữ. Phải gửi đúng `headers` (Content-Type) và đúng số byte
 * đã khai báo: chữ ký của URL bao gồm cả hai, gửi khác đi kho lưu trữ trả 403.
 */
export const UploadTicket = z.object({
  bucket: FileBucket,
  storageKey: z.string(),
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
});
export type UploadTicket = z.infer<typeof UploadTicket>;
