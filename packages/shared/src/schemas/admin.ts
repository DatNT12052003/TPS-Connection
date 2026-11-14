// Quản trị của Admin (G3 đợt 3, C1): tài khoản (tìm, khóa/mở khóa, gán vai trò Manager) và danh mục (môn học,
// khối lớp). Manager không dùng được các API này, Admin không dùng được API duyệt xác minh.
import { z } from 'zod';
import { GradeStage, Role, UserStatus } from '../statuses.js';
import { Email, Id } from './common.js';

const FullName = z.string().trim().min(1, { error: 'required' }).max(100, { error: 'too_long' });

export const ADMIN_PAGE_SIZE = 20;

// ---- Tài khoản -----------------------------------------------------------------------------------

/** Lọc trạng thái trong danh sách: trạng thái của tài khoản, hoặc `deleted` (đã xóa, chờ xóa dữ liệu, C2). */
export const AccountStateFilter = z.enum([...UserStatus.options, 'deleted']);
export type AccountStateFilter = z.infer<typeof AccountStateFilter>;

export const AdminAccountsQuery = z.object({
  /** Tìm theo tên (không dấu cũng được) hoặc email. */
  q: z.string().trim().max(100).optional(),
  role: Role.optional(),
  status: AccountStateFilter.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type AdminAccountsQuery = z.infer<typeof AdminAccountsQuery>;

export const AccountIdParams = z.object({ userId: Id });
export type AccountIdParams = z.infer<typeof AccountIdParams>;

export const AdminAccountSummary = z.object({
  id: Id,
  displayName: z.string(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  roles: z.array(Role),
  status: UserStatus,
  deleted: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AdminAccountSummary = z.infer<typeof AdminAccountSummary>;

export const AdminAccountList = z.object({
  items: z.array(AdminAccountSummary),
  page: z.int(),
  pageSize: z.int(),
  total: z.int(),
});
export type AdminAccountList = z.infer<typeof AdminAccountList>;

export const AdminAccountDetail = AdminAccountSummary.extend({
  emailVerified: z.boolean(),
  /** Lần khóa đang có hiệu lực. */
  lock: z
    .object({
      reason: z.string(),
      lockedAt: z.iso.datetime(),
      lockedByName: z.string().nullable(),
    })
    .nullable(),
  /** Admin này được khóa / mở khóa tài khoản này không (không tự khóa mình, không khóa Admin). */
  canLock: z.boolean(),
});
export type AdminAccountDetail = z.infer<typeof AdminAccountDetail>;

export const LockAccountRequest = z.object({
  reason: z.string().trim().min(1, { error: 'required' }).max(500, { error: 'too_long' }),
});
export type LockAccountRequest = z.infer<typeof LockAccountRequest>;

/**
 * Thêm Manager theo email. Email chưa có tài khoản thì tạo tài khoản không mật khẩu (cần họ tên); người được
 * cấp tự đặt mật khẩu bằng "Quên mật khẩu".
 */
export const GrantManagerRequest = z.object({
  email: Email,
  fullName: z.union([z.literal('').transform(() => undefined), FullName]).optional(),
});
export type GrantManagerRequest = z.infer<typeof GrantManagerRequest>;

// ---- Danh mục ------------------------------------------------------------------------------------

const CatalogCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, { error: 'invalid_catalog_code' });
const CatalogName = z.string().trim().min(1, { error: 'required' }).max(100, { error: 'too_long' });
const SortOrder = z.int().min(0).max(10_000);

export const CatalogItemIdParams = z.object({ id: z.coerce.number().int().positive() });
export type CatalogItemIdParams = z.infer<typeof CatalogItemIdParams>;

/** Một môn học trong trang quản trị: cả môn đã tắt, kèm số gia sư đang dạy. */
export const AdminSubject = z.object({
  id: z.int(),
  code: z.string(),
  nameVi: z.string(),
  nameEn: z.string(),
  sortOrder: z.int(),
  isActive: z.boolean(),
  tutorCount: z.int(),
});
export type AdminSubject = z.infer<typeof AdminSubject>;

export const AdminGradeLevel = AdminSubject.extend({ stage: GradeStage });
export type AdminGradeLevel = z.infer<typeof AdminGradeLevel>;

export const CreateSubjectRequest = z.object({
  code: CatalogCode,
  nameVi: CatalogName,
  nameEn: CatalogName,
  sortOrder: SortOrder.optional(),
});
export type CreateSubjectRequest = z.infer<typeof CreateSubjectRequest>;

/** Sửa tên, thứ tự, bật/tắt. Mã không đổi được (dữ liệu khác và bản dịch tham chiếu theo mã). */
export const UpdateSubjectRequest = z
  .object({
    nameVi: CatalogName.optional(),
    nameEn: CatalogName.optional(),
    sortOrder: SortOrder.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    error: 'nothing_to_update',
  });
export type UpdateSubjectRequest = z.infer<typeof UpdateSubjectRequest>;

export const CreateGradeLevelRequest = CreateSubjectRequest.extend({ stage: GradeStage });
export type CreateGradeLevelRequest = z.infer<typeof CreateGradeLevelRequest>;

export const UpdateGradeLevelRequest = UpdateSubjectRequest;
export type UpdateGradeLevelRequest = UpdateSubjectRequest;
