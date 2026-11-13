// Hồ sơ phụ huynh, hồ sơ con (người học) và lời mời học sinh (G2 phần 4): schema request/response dùng chung
// cho API và form trên web. Thông tin nhận dạng của trẻ (họ tên, ngày sinh, trường, địa chỉ) chỉ trả cho
// phụ huynh quản lý và chính học sinh đó; gia sư chỉ thấy sau khi xác nhận hợp tác (D16, G5).
import { z } from 'zod';
import { GuardianRelationship } from '../statuses.js';
import { Email, Id, Locale, Password } from './common.js';

/** Lời mời con tạo tài khoản học sinh: liên kết dùng một lần, hết hạn sau 7 ngày (D50). */
export const STUDENT_INVITATION_RULES = {
  ttlSeconds: 7 * 24 * 60 * 60,
  /** Số lời mời một phụ huynh được gửi mỗi giờ (gửi lại cũng tính). */
  maxSendsPerHour: 10,
} as const;

/** Phiên bản văn bản "đồng ý xử lý dữ liệu của con", ghi vào `user_consents.version`. */
export const CHILD_DATA_CONSENT_VERSION = '2026-11-13';

/**
 * Văn bản tùy chọn: bỏ khoảng trắng đầu cuối; chuỗi rỗng hoặc `null` thành `null` (xóa giá trị khi sửa).
 * Không gửi trường thì giữ nguyên (`undefined`).
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: 'too_long' })
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const CatalogId = z.int({ error: 'required' }).positive();
const optionalCatalogId = CatalogId.nullable().optional();

/** Ngày dạng YYYY-MM-DD, không ở tương lai, không trước 1900. */
const DateOfBirth = z.iso
  .date({ error: 'invalid_date' })
  .refine((value) => value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10), {
    error: 'invalid_date',
  });

/** Xã chỉ có nghĩa khi đã chọn tỉnh (API kiểm tra thêm xã thuộc đúng tỉnh). */
const communeNeedsProvince = (value: {
  provinceId?: number | null | undefined;
  communeId?: number | null | undefined;
}) =>
  value.communeId === null ||
  value.communeId === undefined ||
  (value.provinceId !== null && value.provinceId !== undefined);
const communeNeedsProvinceIssue = { error: 'province_required', path: ['provinceId'] };

// ---- Hồ sơ phụ huynh ---------------------------------------------------------------------------

/** Hồ sơ phụ huynh (`parent_profiles`); chỉ trả cho chính phụ huynh. Địa chỉ là riêng tư. */
export const ParentProfile = z.object({
  provinceId: z.int().nullable(),
  communeId: z.int().nullable(),
  addressLine: z.string().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type ParentProfile = z.infer<typeof ParentProfile>;

/** Thay toàn bộ hồ sơ phụ huynh (PUT): trường không gửi coi như để trống. */
export const UpdateParentProfileRequest = z
  .object({
    provinceId: optionalCatalogId.transform((v) => v ?? null),
    communeId: optionalCatalogId.transform((v) => v ?? null),
    addressLine: optionalText(300).transform((v) => v ?? null),
  })
  .refine(communeNeedsProvince, communeNeedsProvinceIssue);
export type UpdateParentProfileRequest = z.infer<typeof UpdateParentProfileRequest>;

// ---- Hồ sơ con (người học) ---------------------------------------------------------------------

const LearnerFields = {
  /** Họ tên đầy đủ: riêng tư (D16). */
  fullName: z.string().trim().min(1, { error: 'required' }).max(100, { error: 'too_long' }),
  /** Tên gọi trong lớp, ví dụ "Bin". */
  nickname: optionalText(50),
  dateOfBirth: DateOfBirth.nullable().optional(),
  gradeLevelId: CatalogId,
  schoolName: optionalText(200),
  provinceId: optionalCatalogId,
  communeId: optionalCatalogId,
  addressLine: optionalText(300),
  /** Ghi chú của phụ huynh cho gia sư (tính cách, lưu ý khi học). */
  notes: optionalText(1000),
  relationship: GuardianRelationship,
};

/**
 * Tạo hồ sơ con. Phụ huynh phải đồng ý cho nền tảng xử lý dữ liệu của con (lưu `user_consents`
 * loại `child_data_processing`, gắn với hồ sơ vừa tạo).
 */
export const CreateLearnerRequest = z
  .object({
    ...LearnerFields,
    acceptChildDataProcessing: z.literal(true, { error: 'must_accept_child_data' }),
  })
  .refine(communeNeedsProvince, communeNeedsProvinceIssue);
export type CreateLearnerRequest = z.infer<typeof CreateLearnerRequest>;

/** Sửa một phần hồ sơ con. `null` xóa giá trị của trường tùy chọn. */
export const UpdateLearnerRequest = z
  .object({
    fullName: LearnerFields.fullName.optional(),
    nickname: LearnerFields.nickname,
    dateOfBirth: LearnerFields.dateOfBirth,
    gradeLevelId: CatalogId.optional(),
    schoolName: LearnerFields.schoolName,
    provinceId: LearnerFields.provinceId,
    communeId: LearnerFields.communeId,
    addressLine: LearnerFields.addressLine,
    notes: LearnerFields.notes,
    relationship: GuardianRelationship.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    error: 'nothing_to_update',
  });
export type UpdateLearnerRequest = z.infer<typeof UpdateLearnerRequest>;

export const LearnerIdParams = z.object({ learnerId: Id });
export type LearnerIdParams = z.infer<typeof LearnerIdParams>;

/** Lời mời đang chờ của một hồ sơ con (chỉ phụ huynh thấy). */
export const PendingStudentInvitation = z.object({
  id: Id,
  email: z.string(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type PendingStudentInvitation = z.infer<typeof PendingStudentInvitation>;

/**
 * Hồ sơ con, cho phụ huynh quản lý (`viewer: 'guardian'`) hoặc chính học sinh (`viewer: 'student'`, chỉ xem,
 * D4). Học sinh không thấy ghi chú phụ huynh viết cho gia sư và không thấy lời mời.
 */
export const Learner = z.object({
  id: Id,
  viewer: z.enum(['guardian', 'student']),
  fullName: z.string().nullable(),
  nickname: z.string().nullable(),
  dateOfBirth: z.iso.date().nullable(),
  gradeLevelId: z.int().nullable(),
  schoolName: z.string().nullable(),
  provinceId: z.int().nullable(),
  communeId: z.int().nullable(),
  addressLine: z.string().nullable(),
  notes: z.string().nullable(),
  relationship: GuardianRelationship.nullable(),
  hasStudentAccount: z.boolean(),
  pendingInvitation: PendingStudentInvitation.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Learner = z.infer<typeof Learner>;

export const LearnerList = z.object({ items: z.array(Learner) });
export type LearnerList = z.infer<typeof LearnerList>;

// ---- Lời mời học sinh --------------------------------------------------------------------------

/** Phụ huynh mời con tạo tài khoản bằng email của con. Gửi lời mời mới thì lời mời cũ mất hiệu lực. */
export const CreateStudentInvitationRequest = z.object({ email: Email });
export type CreateStudentInvitationRequest = z.infer<typeof CreateStudentInvitationRequest>;

/** Token trong liên kết mời: 32 byte ngẫu nhiên, base64url (43 ký tự). */
export const StudentInvitationToken = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{43}$/, { error: 'invalid_token' });

export const StudentInvitationLookupRequest = z.object({ token: StudentInvitationToken });
export type StudentInvitationLookupRequest = z.infer<typeof StudentInvitationLookupRequest>;

/**
 * Trang nhận lời mời hiển thị: ai mời, email nào, còn hạn tới khi nào. Chỉ trả cho lời mời còn dùng được;
 * lời mời đã dùng, đã hủy: `invitation_invalid`; quá hạn: `invitation_expired`.
 */
export const StudentInvitationPreview = z.object({
  email: z.string(),
  inviterName: z.string(),
  learnerName: z.string(),
  expiresAt: z.iso.datetime(),
});
export type StudentInvitationPreview = z.infer<typeof StudentInvitationPreview>;

/**
 * Học sinh nhận lời mời: đặt mật khẩu cho tài khoản mới. Email lấy từ lời mời (đã chứng minh sở hữu vì
 * nhận được liên kết), nên không cần mã OTP.
 */
export const AcceptStudentInvitationRequest = z.object({
  token: StudentInvitationToken,
  password: Password,
  locale: Locale.default('vi'),
  acceptTerms: z.literal(true, { error: 'must_accept_terms' }),
});
export type AcceptStudentInvitationRequest = z.infer<typeof AcceptStudentInvitationRequest>;
