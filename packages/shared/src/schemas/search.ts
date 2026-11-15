// Tìm kiếm marketplace (G4 đợt 2, §4.3): tìm gia sư và bài tuyển (khách xem được, C8), tìm nhu cầu (chỉ gia sư đã
// xác minh). Query string là chuỗi nên mọi số được ép kiểu; bộ lọc không gửi thì không áp dụng. Chỉ môn, khối đang
// bật mới khớp (Admin tắt ở /admin/catalog).
import { z } from 'zod';
import { BudgetUnit, RateUnit, RequestPostGoal, TeachingMode } from '../statuses.js';
import { Id, paginated } from './common.js';
import { RequestPostForTutor, TutorPostAuthor } from './posts.js';
import { TeachingSubject, TimeOfDay, TutorRate } from './tutors.js';

export const SEARCH_PAGE_SIZE_DEFAULT = 20;
export const SEARCH_PAGE_SIZE_MAX = 50;
/** Không cho lật quá sâu (OFFSET lớn tốn kém); muốn xem thêm thì thu hẹp bộ lọc. */
export const SEARCH_MAX_PAGE = 100;

const SearchPagination = z.object({
  page: z.coerce.number().int().min(1).max(SEARCH_MAX_PAGE).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(SEARCH_PAGE_SIZE_MAX)
    .default(SEARCH_PAGE_SIZE_DEFAULT),
});

const OptionalId = z.coerce.number().int().positive().optional();
const OptionalVnd = z.coerce.number().int().min(0).max(1_000_000_000).optional();
/** Cờ trong query string: `true`/`1` là bật; không gửi là tắt. */
const Flag = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .optional();
/** Từ khóa: bỏ khoảng trắng thừa; rỗng coi như không tìm theo từ khóa. */
const Keyword = z
  .string()
  .trim()
  .max(100, { error: 'too_long' })
  .transform((v) => (v === '' ? undefined : v))
  .optional();

/** Lọc theo hình thức: `online` khớp gia sư/bài dạy trực tuyến hoặc kết hợp; `in_person` tương tự. */
export const SearchTeachingMode = z.enum(['online', 'in_person']);
export type SearchTeachingMode = z.infer<typeof SearchTeachingMode>;

// ---- Tìm gia sư ---------------------------------------------------------------------------------

/**
 * Sắp xếp kết quả tìm gia sư. `relevance`: đang nhận học sinh trước, rồi độ khớp từ khóa, có bằng cấp đã xác minh,
 * đánh giá, kinh nghiệm, mới cập nhật (các tiêu chí giải thích được, §4.3).
 */
export const TutorSearchSort = z.enum([
  'relevance',
  'experience',
  'rate_asc',
  'rate_desc',
  'updated',
]);
export type TutorSearchSort = z.infer<typeof TutorSearchSort>;

export const TutorSearchQuery = SearchPagination.extend({
  /** Tên hiển thị, giới thiệu, nơi học/công tác, chuyên ngành; có dấu hay không dấu đều được. */
  q: Keyword,
  subjectId: OptionalId,
  gradeLevelId: OptionalId,
  mode: SearchTeachingMode.optional(),
  /** Dạy trực tiếp ở tỉnh này (khu vực là tỉnh, hoặc một xã thuộc tỉnh). */
  provinceId: OptionalId,
  /** Dạy trực tiếp ở xã này (khu vực là xã, hoặc cả tỉnh chứa xã). */
  communeId: OptionalId,
  /** Học phí tham khảo; `rateUnit` để so cùng đơn vị (giờ hoặc buổi). */
  rateUnit: RateUnit.optional(),
  minRate: OptionalVnd,
  maxRate: OptionalVnd,
  minExperience: z.coerce.number().int().min(0).max(80).optional(),
  /** Rảnh vào thứ này (ISO 1–7); kèm `from`, `to` thì khung rảnh phải phủ trọn khoảng giờ đó. */
  weekday: z.coerce.number().int().min(1).max(7).optional(),
  from: TimeOfDay.optional(),
  to: TimeOfDay.optional(),
  /** Có bằng cấp đã xác minh (D20). */
  verifiedDegree: Flag,
  /** Chỉ gia sư đang nhận học sinh. */
  acceptingOnly: Flag,
  sort: TutorSearchSort.default('relevance'),
})
  .refine((v) => v.minRate === undefined || v.maxRate === undefined || v.minRate <= v.maxRate, {
    error: 'budget_range',
    path: ['minRate'],
  })
  .refine((v) => v.from === undefined || v.to === undefined || v.from < v.to, {
    error: 'end_before_start',
    path: ['to'],
  })
  .refine((v) => (v.from === undefined && v.to === undefined) || v.weekday !== undefined, {
    error: 'required',
    path: ['weekday'],
  });
export type TutorSearchQuery = z.infer<typeof TutorSearchQuery>;

/** Một gia sư trong kết quả tìm kiếm (thẻ gia sư). Không email, số điện thoại, họ tên thật (D16). */
export const TutorSearchItem = z.object({
  id: Id,
  slug: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  headline: z.string().nullable(),
  teachingMode: TeachingMode.nullable(),
  rate: TutorRate.nullable(),
  experienceYears: z.int().nullable(),
  hasVerifiedDegree: z.boolean(),
  acceptingStudents: z.boolean(),
  ratingAvg: z.number().nullable(),
  ratingCount: z.int().nonnegative(),
  /** Môn × khối đang bật mà gia sư dạy. */
  subjects: z.array(TeachingSubject),
  /** Các tỉnh có khu vực dạy trực tiếp (khu vực là xã thì lấy tỉnh chứa xã). */
  provinceIds: z.array(z.int()),
  updatedAt: z.iso.datetime(),
});
export type TutorSearchItem = z.infer<typeof TutorSearchItem>;

export const TutorSearchResult = paginated(TutorSearchItem);
export type TutorSearchResult = z.infer<typeof TutorSearchResult>;

// ---- Tìm bài tuyển học sinh ----------------------------------------------------------------------

export const TutorPostSearchSort = z.enum(['newest', 'relevance', 'rate_asc', 'rate_desc']);
export type TutorPostSearchSort = z.infer<typeof TutorPostSearchSort>;

export const TutorPostSearchQuery = SearchPagination.extend({
  /** Tiêu đề và mô tả bài. */
  q: Keyword,
  subjectId: OptionalId,
  gradeLevelId: OptionalId,
  mode: SearchTeachingMode.optional(),
  provinceId: OptionalId,
  communeId: OptionalId,
  /** Bài của một gia sư (trang hồ sơ gia sư). */
  tutorId: Id.optional(),
  sort: TutorPostSearchSort.default('newest'),
});
export type TutorPostSearchQuery = z.infer<typeof TutorPostSearchQuery>;

/** Một bài tuyển trong danh sách (thẻ bài): mô tả rút gọn, không có lịch dạy. */
export const TutorPostSummary = z.object({
  id: Id,
  slug: z.string(),
  title: z.string(),
  /** Tối đa 200 ký tự đầu của mô tả. */
  excerpt: z.string(),
  teachingMode: TeachingMode.nullable(),
  rate: TutorRate.nullable(),
  capacity: z.int().nullable(),
  availableFrom: z.iso.date().nullable(),
  subjects: z.array(TeachingSubject),
  areaIds: z.array(z.int()),
  publishedAt: z.iso.datetime(),
  tutor: TutorPostAuthor,
});
export type TutorPostSummary = z.infer<typeof TutorPostSummary>;

export const TutorPostSearchResult = paginated(TutorPostSummary);
export type TutorPostSearchResult = z.infer<typeof TutorPostSearchResult>;

// ---- Tìm nhu cầu (gia sư đã xác minh) ------------------------------------------------------------

export const RequestPostSearchSort = z.enum(['newest', 'budget_desc']);
export type RequestPostSearchSort = z.infer<typeof RequestPostSearchSort>;

export const RequestPostSearchQuery = SearchPagination.extend({
  subjectId: OptionalId,
  gradeLevelId: OptionalId,
  goal: RequestPostGoal.optional(),
  mode: SearchTeachingMode.optional(),
  /** Nhu cầu ở tỉnh này. */
  provinceId: OptionalId,
  /** Nhu cầu ở xã này, hoặc ở tỉnh chứa xã mà chưa ghi xã. */
  communeId: OptionalId,
  /** Ngân sách tối đa (hoặc tối thiểu nếu không ghi tối đa) từ mức này trở lên, cùng `budgetUnit` nếu có. */
  budgetUnit: BudgetUnit.optional(),
  minBudget: OptionalVnd,
  /** Chỉ nhu cầu có môn × khối nằm trong hồ sơ của chính gia sư. */
  matchProfile: Flag,
  sort: RequestPostSearchSort.default('newest'),
});
export type RequestPostSearchQuery = z.infer<typeof RequestPostSearchQuery>;

export const RequestPostSearchResult = paginated(RequestPostForTutor);
export type RequestPostSearchResult = z.infer<typeof RequestPostSearchResult>;
