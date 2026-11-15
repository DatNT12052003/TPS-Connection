// Bài đăng marketplace (G4, §4.1, §4.2; docs/thiet_ke_co_so_du_lieu.md mục 6.2, 6.3; trạng thái B.2, B.3).
// - Bài tuyển học sinh (`TutorPost`): gia sư nào cũng tạo nháp được; chỉ gia sư đã xác minh danh tính và tài khoản
//   đang hoạt động mới đăng được (D5). Bài đang mở là công khai (C8).
// - Bài tìm gia sư (`RequestPost`): phụ huynh đăng cho một hồ sơ con và một môn (D25). Không công khai: chỉ gia sư đã
//   xác minh và đã đăng nhập xem được (C8). Không bao giờ chứa danh tính, trường, địa chỉ hay liên hệ của trẻ.
import { z } from 'zod';
import {
  BudgetUnit,
  RequestPostClosedReason,
  RequestPostGoal,
  RequestPostStatus,
  TeachingMode,
  TutorPostStatus,
} from '../statuses.js';
import { Id, optionalText, PaginationQuery, paginated } from './common.js';
import { AvailabilitySlot, PublicRef, slotsOverlap, TeachingSubject, TutorRate } from './tutors.js';

/** Giới hạn để một bài đăng hay một tài khoản không phình vô hạn. */
export const POST_LIMITS = {
  titleLength: 120,
  descriptionLength: 5000,
  subjects: 30,
  areas: 30,
  slots: 30,
  /** Số học sinh tối đa một bài tuyển có thể nhận. */
  maxCapacity: 50,
  /** Bài tuyển chưa đóng, chưa xóa của một gia sư. */
  activeTutorPosts: 20,
  /** Bài tìm gia sư chưa đóng, chưa xóa của một phụ huynh. */
  activeRequestPosts: 30,
  goalNoteLength: 500,
  tutorRequirementsLength: 2000,
  requestDescriptionLength: 3000,
  maxBudgetVnd: 100_000_000,
} as const;

/** Ngày dạng YYYY-MM-DD (không kèm giờ). */
const CalendarDate = z.iso.date({ error: 'invalid_calendar_date' });

const nullable = <T extends z.ZodType>(schema: T) =>
  schema
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const AreaId = z.int().positive();

// ---- Bài tuyển học sinh của gia sư ----------------------------------------------------------------

/**
 * Nội dung bài tuyển học sinh (tạo và sửa đều gửi toàn bộ). Bản nháp được thiếu môn, hình thức dạy, khu vực;
 * khi đăng (và khi sửa bài đã đăng) API kiểm tra đủ: ít nhất một môn × khối, có hình thức dạy, dạy trực tiếp thì
 * có ít nhất một khu vực.
 */
export const SaveTutorPostRequest = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, { error: 'required' })
      .max(POST_LIMITS.titleLength, { error: 'too_long' }),
    description: z
      .string()
      .trim()
      .min(1, { error: 'required' })
      .max(POST_LIMITS.descriptionLength, { error: 'too_long' }),
    teachingMode: nullable(TeachingMode),
    rate: nullable(TutorRate),
    capacity: nullable(z.int().min(1).max(POST_LIMITS.maxCapacity)),
    availableFrom: nullable(CalendarDate),
    subjects: z.array(TeachingSubject).max(POST_LIMITS.subjects, { error: 'too_many' }).default([]),
    /** Tỉnh hoặc xã dạy trực tiếp. */
    areaIds: z.array(AreaId).max(POST_LIMITS.areas, { error: 'too_many' }).default([]),
    slots: z.array(AvailabilitySlot).max(POST_LIMITS.slots, { error: 'too_many' }).default([]),
  })
  .superRefine((value, ctx) => {
    const pairs = value.subjects.map((s) => `${s.subjectId}:${s.gradeLevelId}`);
    if (new Set(pairs).size !== pairs.length) {
      ctx.addIssue({ code: 'custom', path: ['subjects'], message: 'duplicate' });
    }
    if (new Set(value.areaIds).size !== value.areaIds.length) {
      ctx.addIssue({ code: 'custom', path: ['areaIds'], message: 'duplicate' });
    }
    if (value.areaIds.length > 0 && value.teachingMode === 'online') {
      ctx.addIssue({ code: 'custom', path: ['areaIds'], message: 'service_areas_need_in_person' });
    }
    if (slotsOverlap(value.slots)) {
      ctx.addIssue({ code: 'custom', path: ['slots'], message: 'slot_overlap' });
    }
  });
export type SaveTutorPostRequest = z.infer<typeof SaveTutorPostRequest>;

/** Đổi trạng thái bài tuyển (B.2). Không quay về nháp; bài đã đóng là trạng thái cuối (D33). */
export const ChangeTutorPostStatusRequest = z.object({
  status: TutorPostStatus.exclude(['draft']),
});
export type ChangeTutorPostStatusRequest = z.infer<typeof ChangeTutorPostStatusRequest>;

export const TutorPostIdParams = z.object({ postId: Id });
export type TutorPostIdParams = z.infer<typeof TutorPostIdParams>;

/** Bài công khai theo slug (`toan-9-luyen-thi-a1b2c3d4e5`) hoặc id. */
export const TutorPostRefParams = z.object({ postRef: PublicRef });
export type TutorPostRefParams = z.infer<typeof TutorPostRefParams>;

export const OwnTutorPostsQuery = PaginationQuery.extend({ status: TutorPostStatus.optional() });
export type OwnTutorPostsQuery = z.infer<typeof OwnTutorPostsQuery>;

const TutorPostFields = {
  title: z.string(),
  description: z.string(),
  teachingMode: TeachingMode.nullable(),
  rate: TutorRate.nullable(),
  capacity: z.int().nullable(),
  availableFrom: z.iso.date().nullable(),
  subjects: z.array(TeachingSubject),
  areaIds: z.array(z.int()),
  slots: z.array(AvailabilitySlot),
};

/** Bài tuyển cho chính gia sư: mọi trạng thái, kèm lượt xem và việc bị Manager ẩn. */
export const OwnTutorPost = z.object({
  ...TutorPostFields,
  id: Id,
  status: TutorPostStatus,
  /** Manager đã ẩn bài do vi phạm (lớp phủ kiểm duyệt, độc lập với trạng thái). */
  moderationHidden: z.boolean(),
  viewCount: z.int().nonnegative(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type OwnTutorPost = z.infer<typeof OwnTutorPost>;

export const OwnTutorPostList = paginated(OwnTutorPost);
export type OwnTutorPostList = z.infer<typeof OwnTutorPostList>;

/** Gia sư đứng tên bài tuyển, ở dạng công khai: không email, số điện thoại, họ tên thật (D16). */
export const TutorPostAuthor = z.object({
  id: Id,
  /** Đường dẫn hồ sơ `/tutors/<slug>`. */
  slug: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  hasVerifiedDegree: z.boolean(),
  ratingAvg: z.number().nullable(),
  ratingCount: z.int().nonnegative(),
});
export type TutorPostAuthor = z.infer<typeof TutorPostAuthor>;

/** Bài tuyển công khai (khách xem được, C8): chỉ bài đang mở của gia sư đã xác minh, đang hoạt động. */
export const PublicTutorPost = z.object({
  ...TutorPostFields,
  id: Id,
  /** Đường dẫn bài: tiêu đề không dấu + mã công khai (D56). */
  slug: z.string(),
  publishedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  tutor: TutorPostAuthor,
});
export type PublicTutorPost = z.infer<typeof PublicTutorPost>;

// ---- Bài tìm gia sư của phụ huynh -----------------------------------------------------------------

const BudgetAmount = z
  .int({ error: 'required' })
  .positive({ error: 'invalid_amount' })
  .max(POST_LIMITS.maxBudgetVnd, { error: 'invalid_amount' });

/** Ngân sách dự kiến: có ít nhất một mức (tối thiểu hoặc tối đa) và đơn vị. */
export const BudgetInput = z
  .object({
    minVnd: nullable(BudgetAmount),
    maxVnd: nullable(BudgetAmount),
    unit: BudgetUnit,
  })
  .refine((b) => b.minVnd !== null || b.maxVnd !== null, { error: 'required', path: ['maxVnd'] })
  .refine((b) => b.minVnd === null || b.maxVnd === null || b.minVnd <= b.maxVnd, {
    error: 'budget_range',
    path: ['minVnd'],
  });
export type BudgetInput = z.infer<typeof BudgetInput>;

const RequestPostContent = {
  subjectId: z.int().positive(),
  gradeLevelId: z.int().positive(),
  goal: RequestPostGoal,
  goalNote: optionalText(POST_LIMITS.goalNoteLength).transform((v) => v ?? null),
  teachingMode: TeachingMode,
  /** Chỉ tỉnh và xã, không có địa chỉ chi tiết (§16.7). Bắt buộc có tỉnh khi học trực tiếp hoặc kết hợp. */
  provinceId: nullable(AreaId),
  communeId: nullable(AreaId),
  budget: nullable(BudgetInput),
  desiredStartDate: nullable(CalendarDate),
  tutorRequirements: optionalText(POST_LIMITS.tutorRequirementsLength).transform((v) => v ?? null),
  description: optionalText(POST_LIMITS.requestDescriptionLength).transform((v) => v ?? null),
  slots: z.array(AvailabilitySlot).max(POST_LIMITS.slots, { error: 'too_many' }).default([]),
};

function checkRequestPost(
  value: {
    teachingMode: TeachingMode;
    provinceId: number | null;
    slots: AvailabilitySlot[];
  },
  ctx: z.RefinementCtx,
) {
  if (value.teachingMode !== 'online' && value.provinceId === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['provinceId'],
      message: 'province_required_for_in_person',
    });
  }
  if (slotsOverlap(value.slots)) {
    ctx.addIssue({ code: 'custom', path: ['slots'], message: 'slot_overlap' });
  }
}

/** Tạo bài tìm gia sư (nháp) cho một hồ sơ con. Hồ sơ con không đổi được sau khi tạo. */
export const CreateRequestPostRequest = z
  .object({ learnerId: Id, ...RequestPostContent })
  .superRefine(checkRequestPost);
export type CreateRequestPostRequest = z.infer<typeof CreateRequestPostRequest>;

/** Sửa nội dung (gửi toàn bộ). Không sửa được bài đã đóng. */
export const UpdateRequestPostRequest = z.object(RequestPostContent).superRefine(checkRequestPost);
export type UpdateRequestPostRequest = z.infer<typeof UpdateRequestPostRequest>;

/** Phụ huynh đổi trạng thái (B.3). Đóng phải chọn lý do; "đã tìm được gia sư" do hệ thống đặt (D31). */
export const ChangeRequestPostStatusRequest = z
  .object({
    status: RequestPostStatus.exclude(['draft']),
    closedReason: RequestPostClosedReason.exclude(['found_tutor']).optional(),
  })
  .refine((v) => v.status !== 'closed' || v.closedReason !== undefined, {
    error: 'required',
    path: ['closedReason'],
  });
export type ChangeRequestPostStatusRequest = z.infer<typeof ChangeRequestPostStatusRequest>;

export const RequestPostIdParams = z.object({ postId: Id });
export type RequestPostIdParams = z.infer<typeof RequestPostIdParams>;

export const OwnRequestPostsQuery = PaginationQuery.extend({
  status: RequestPostStatus.optional(),
  learnerId: Id.optional(),
});
export type OwnRequestPostsQuery = z.infer<typeof OwnRequestPostsQuery>;

export const Budget = z.object({
  minVnd: z.int().nullable(),
  maxVnd: z.int().nullable(),
  unit: BudgetUnit,
});
export type Budget = z.infer<typeof Budget>;

const RequestPostFields = {
  subjectId: z.int(),
  gradeLevelId: z.int(),
  goal: RequestPostGoal,
  goalNote: z.string().nullable(),
  teachingMode: TeachingMode,
  provinceId: z.int().nullable(),
  communeId: z.int().nullable(),
  budget: Budget.nullable(),
  desiredStartDate: z.iso.date().nullable(),
  tutorRequirements: z.string().nullable(),
  description: z.string().nullable(),
  slots: z.array(AvailabilitySlot),
};

/** Bài tìm gia sư cho chính phụ huynh: mọi trạng thái, kèm hồ sơ con được gắn. */
export const OwnRequestPost = z.object({
  ...RequestPostFields,
  id: Id,
  learnerId: Id,
  status: RequestPostStatus,
  closedReason: RequestPostClosedReason.nullable(),
  moderationHidden: z.boolean(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type OwnRequestPost = z.infer<typeof OwnRequestPost>;

export const OwnRequestPostList = paginated(OwnRequestPost);
export type OwnRequestPostList = z.infer<typeof OwnRequestPostList>;

/**
 * Bài tìm gia sư cho gia sư đã xác minh (C8). KHÔNG có hồ sơ con, người đăng hay bất kỳ thông tin nhận dạng
 * nào của trẻ (§16.7, D16): chỉ môn, khối, mục tiêu, hình thức, tỉnh/xã, ngân sách, lịch và mô tả.
 */
export const RequestPostForTutor = z.object({
  ...RequestPostFields,
  id: Id,
  publishedAt: z.iso.datetime(),
});
export type RequestPostForTutor = z.infer<typeof RequestPostForTutor>;
