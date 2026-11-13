// Thông tin cá nhân của người đang đăng nhập (G2 phần 5): tên, họ tên thật, số điện thoại tự khai, ngôn ngữ,
// ảnh đại diện. Chỉ trả cho chính người đó; không bao giờ xuất hiện ở API công khai (D16).
import { z } from 'zod';
import { Role } from '../statuses.js';
import { UploadTicket } from '../files.js';
import { PhoneNumber } from './auth.js';
import { Id, Locale } from './common.js';

/** Thông tin cá nhân của chính người dùng. */
export const AccountProfile = z.object({
  id: Id,
  email: z.string(),
  /** Tên hiển thị công khai (gia sư đã xác minh hiện tên này trên hồ sơ công khai). */
  displayName: z.string(),
  fullName: z.string().nullable(),
  /** Gia sư đã xác minh danh tính: họ tên thật bị khóa, muốn đổi phải xác minh lại (D34). */
  fullNameLocked: z.boolean(),
  /** Tự khai, chưa xác thực (C12). */
  phone: z.string().nullable(),
  phoneVerified: z.boolean(),
  locale: Locale,
  avatarUrl: z.string().nullable(),
  roles: z.array(Role),
});
export type AccountProfile = z.infer<typeof AccountProfile>;

/** Sửa một phần thông tin cá nhân. `phone: null` hoặc chuỗi rỗng xóa số điện thoại. */
export const UpdateAccountRequest = z
  .object({
    displayName: z.string().trim().min(1, { error: 'required' }).max(60, { error: 'too_long' }),
    fullName: z.string().trim().min(1, { error: 'required' }).max(100, { error: 'too_long' }),
    phone: z.union([z.literal('').transform(() => null), PhoneNumber]).nullable(),
    locale: Locale,
  })
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    error: 'nothing_to_update',
  });
export type UpdateAccountRequest = z.infer<typeof UpdateAccountRequest>;

/** Đặt ảnh đại diện bằng tệp đã tải lên (POST /files/uploads với `purpose: avatar`). */
export const SetAvatarRequest = z.object({ fileId: Id });
export type SetAvatarRequest = z.infer<typeof SetAvatarRequest>;

/** Vé tải lên kèm id bản ghi `files` (trạng thái `pending_upload` cho tới khi được dùng). */
export const UploadTicketResponse = UploadTicket.extend({ fileId: Id });
export type UploadTicketResponse = z.infer<typeof UploadTicketResponse>;
