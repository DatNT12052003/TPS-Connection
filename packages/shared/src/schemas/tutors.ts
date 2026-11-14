// Hồ sơ gia sư (G2 phần 5, docs/thiet_ke_co_so_du_lieu.md mục 5.1): schema request/response dùng chung cho
// API và form trên web. Mọi trường văn bản là tự khai; đã xác minh chỉ có danh tính (`identityVerifiedAt`)
// và từng bằng cấp có `verificationStatus = verified` (§3.2, §13).
import { z } from 'zod';
import {
  CredentialKind,
  CredentialVerificationStatus,
  RateUnit,
  TeachingMode,
  TutorOccupation,
  TutorProfileStatus,
  VerificationRejectionCode,
} from '../statuses.js';
import { Id, optionalText } from './common.js';

/** Giới hạn số mục để một hồ sơ không phình vô hạn. */
export const TUTOR_PROFILE_LIMITS = {
  teachingSubjects: 60,
  serviceAreas: 30,
  availabilitySlots: 50,
  credentials: 20,
  /** Học phí tham khảo tối đa cho một giờ/buổi. */
  maxRateVnd: 100_000_000,
} as const;

/**
 * Các trường bắt buộc trước khi nộp xác minh danh tính (D34): họ tên thật, môn – khối dạy được, hình thức
 * dạy, học phí tham khảo. API trả danh sách còn thiếu để giao diện nhắc gia sư.
 */
export const TutorRequiredField = z.enum(['fullName', 'teachingSubjects', 'teachingMode', 'rate']);
export type TutorRequiredField = z.infer<typeof TutorRequiredField>;

/** Giờ trong ngày dạng HH:MM (24 giờ), theo giờ Việt Nam. */
export const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'invalid_time' });

/** Một khung giờ rảnh trong tuần. `weekday` theo ISO: 1 = thứ Hai … 7 = Chủ nhật. */
export const AvailabilitySlot = z
  .object({
    weekday: z.int().min(1).max(7),
    startTime: TimeOfDay,
    endTime: TimeOfDay,
  })
  .refine((slot) => slot.endTime > slot.startTime, {
    error: 'end_before_start',
    path: ['endTime'],
  });
export type AvailabilitySlot = z.infer<typeof AvailabilitySlot>;

/** Một cặp môn × khối lớp dạy được. */
export const TeachingSubject = z.object({
  subjectId: z.int().positive(),
  gradeLevelId: z.int().positive(),
});
export type TeachingSubject = z.infer<typeof TeachingSubject>;

/** Học phí tham khảo (D18): số tiền VND cho một giờ hoặc một buổi. */
export const TutorRate = z.object({
  amountVnd: z
    .int({ error: 'required' })
    .positive({ error: 'invalid_amount' })
    .max(TUTOR_PROFILE_LIMITS.maxRateVnd, { error: 'invalid_amount' }),
  unit: RateUnit,
});
export type TutorRate = z.infer<typeof TutorRate>;

const HttpsUrl = z
  .url({ protocol: /^https$/, error: 'invalid_url' })
  .max(500, { error: 'too_long' });

/**
 * Thay toàn bộ hồ sơ gia sư (PUT). Trường không gửi coi như để trống, danh sách không gửi coi như rỗng.
 * Sửa các trường tự khai không đổi trạng thái hồ sơ (B.4.1).
 */
export const UpdateTutorProfileRequest = z
  .object({
    headline: optionalText(120).transform((v) => v ?? null),
    bio: optionalText(3000).transform((v) => v ?? null),
    occupation: TutorOccupation.nullable()
      .optional()
      .transform((v) => v ?? null),
    institution: optionalText(200).transform((v) => v ?? null),
    major: optionalText(200).transform((v) => v ?? null),
    highestEducation: optionalText(200).transform((v) => v ?? null),
    experienceYears: z
      .int()
      .min(0)
      .max(80)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    teachingMethod: optionalText(3000).transform((v) => v ?? null),
    achievements: optionalText(3000).transform((v) => v ?? null),
    introVideoUrl: z
      .union([z.literal('').transform(() => null), HttpsUrl])
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    teachingMode: TeachingMode.nullable()
      .optional()
      .transform((v) => v ?? null),
    rate: TutorRate.nullable()
      .optional()
      .transform((v) => v ?? null),
    acceptingStudents: z.boolean().default(true),
    teachingSubjects: z
      .array(TeachingSubject)
      .max(TUTOR_PROFILE_LIMITS.teachingSubjects, { error: 'too_many' })
      .default([]),
    /** Tỉnh hoặc xã có thể dạy trực tiếp. */
    serviceAreaIds: z
      .array(z.int().positive())
      .max(TUTOR_PROFILE_LIMITS.serviceAreas, { error: 'too_many' })
      .default([]),
    availability: z
      .array(AvailabilitySlot)
      .max(TUTOR_PROFILE_LIMITS.availabilitySlots, { error: 'too_many' })
      .default([]),
  })
  .superRefine((value, ctx) => {
    const pairs = value.teachingSubjects.map((s) => `${s.subjectId}:${s.gradeLevelId}`);
    if (new Set(pairs).size !== pairs.length) {
      ctx.addIssue({ code: 'custom', path: ['teachingSubjects'], message: 'duplicate' });
    }
    if (new Set(value.serviceAreaIds).size !== value.serviceAreaIds.length) {
      ctx.addIssue({ code: 'custom', path: ['serviceAreaIds'], message: 'duplicate' });
    }
    if (value.serviceAreaIds.length > 0 && value.teachingMode === 'online') {
      ctx.addIssue({
        code: 'custom',
        path: ['serviceAreaIds'],
        message: 'service_areas_need_in_person',
      });
    }
    // Khung giờ cùng ngày không được chồng nhau.
    const byDay = new Map<number, AvailabilitySlot[]>();
    for (const slot of value.availability) {
      byDay.set(slot.weekday, [...(byDay.get(slot.weekday) ?? []), slot]);
    }
    for (const slots of byDay.values()) {
      const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i]!.startTime < sorted[i - 1]!.endTime) {
          ctx.addIssue({ code: 'custom', path: ['availability'], message: 'slot_overlap' });
          return;
        }
      }
    }
  });
export type UpdateTutorProfileRequest = z.infer<typeof UpdateTutorProfileRequest>;

// ---- Bằng cấp, chứng chỉ ------------------------------------------------------------------------

const IssuedYear = z
  .int()
  .min(1950, { error: 'invalid_year' })
  .refine((year) => year <= new Date().getFullYear(), { error: 'invalid_year' });

/** Gia sư tự khai một bằng cấp/chứng chỉ (`self_declared`); nộp ảnh để xác minh ở G3. */
export const CreateTutorCredentialRequest = z.object({
  kind: CredentialKind,
  title: z.string().trim().min(1, { error: 'required' }).max(200, { error: 'too_long' }),
  issuer: optionalText(200),
  issuedYear: IssuedYear.nullable().optional(),
});
export type CreateTutorCredentialRequest = z.infer<typeof CreateTutorCredentialRequest>;

export const UpdateTutorCredentialRequest = z
  .object({
    kind: CredentialKind.optional(),
    title: CreateTutorCredentialRequest.shape.title.optional(),
    issuer: optionalText(200),
    issuedYear: IssuedYear.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    error: 'nothing_to_update',
  });
export type UpdateTutorCredentialRequest = z.infer<typeof UpdateTutorCredentialRequest>;

export const CredentialIdParams = z.object({ credentialId: Id });
export type CredentialIdParams = z.infer<typeof CredentialIdParams>;

export const TutorCredential = z.object({
  id: Id,
  kind: CredentialKind,
  title: z.string(),
  issuer: z.string().nullable(),
  issuedYear: z.int().nullable(),
  verificationStatus: CredentialVerificationStatus,
  /** Lý do của lần từ chối gần nhất khi `verificationStatus = rejected`; còn lại null. */
  rejectionCode: VerificationRejectionCode.nullable(),
  rejectionNote: z.string().nullable(),
});
export type TutorCredential = z.infer<typeof TutorCredential>;

// ---- Hồ sơ của chính gia sư ----------------------------------------------------------------------

const TutorProfileFields = {
  headline: z.string().nullable(),
  bio: z.string().nullable(),
  occupation: TutorOccupation.nullable(),
  institution: z.string().nullable(),
  major: z.string().nullable(),
  highestEducation: z.string().nullable(),
  experienceYears: z.int().nullable(),
  teachingMethod: z.string().nullable(),
  achievements: z.string().nullable(),
  introVideoUrl: z.string().nullable(),
  teachingMode: TeachingMode.nullable(),
  rate: TutorRate.nullable(),
  acceptingStudents: z.boolean(),
  hasVerifiedDegree: z.boolean(),
  teachingSubjects: z.array(TeachingSubject),
  serviceAreaIds: z.array(z.int()),
  availability: z.array(AvailabilitySlot),
};

/** Hồ sơ gia sư cho chính gia sư: đủ mọi trường, trạng thái, bằng cấp ở mọi trạng thái. */
export const OwnTutorProfile = z.object({
  ...TutorProfileFields,
  userId: Id,
  profileStatus: TutorProfileStatus,
  identityVerifiedAt: z.iso.datetime().nullable(),
  credentials: z.array(TutorCredential),
  /** Trường bắt buộc còn thiếu trước khi nộp xác minh (D34); rỗng là đủ. */
  missingForVerification: z.array(TutorRequiredField),
  updatedAt: z.iso.datetime(),
});
export type OwnTutorProfile = z.infer<typeof OwnTutorProfile>;

// ---- Hồ sơ công khai -----------------------------------------------------------------------------

/**
 * Hồ sơ gia sư công khai (khách cũng xem được, C8). Chỉ gia sư đã xác minh danh tính và tài khoản đang hoạt
 * động. KHÔNG có email, số điện thoại, họ tên thật (D16). Bằng cấp bị từ chối không hiện; bằng cấp đang chờ
 * duyệt hiện như tự khai (`verified = false`).
 */
export const PublicTutorProfile = z.object({
  ...TutorProfileFields,
  id: Id,
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  /** Luôn true: chỉ gia sư đã xác minh danh tính mới công khai (D5). */
  identityVerified: z.literal(true),
  credentials: z.array(
    z.object({
      kind: CredentialKind,
      title: z.string(),
      issuer: z.string().nullable(),
      issuedYear: z.int().nullable(),
      verified: z.boolean(),
    }),
  ),
  ratingAvg: z.number().nullable(),
  ratingCount: z.int().nonnegative(),
});
export type PublicTutorProfile = z.infer<typeof PublicTutorProfile>;

export const TutorIdParams = z.object({ tutorId: Id });
export type TutorIdParams = z.infer<typeof TutorIdParams>;
