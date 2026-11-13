// Schema Zod dùng chung cho request/response và form.
import { z } from 'zod';

export const Locale = z.enum(['vi', 'en']);
export type Locale = z.infer<typeof Locale>;
export const DEFAULT_LOCALE: Locale = 'vi';

export const Id = z.uuid();

export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'invalid_email' }).max(254, { error: 'invalid_email' }));

/** Mật khẩu: tối thiểu 8 ký tự, có cả chữ và số (D50). */
export const PASSWORD_MIN_LENGTH = 8;
export const Password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: 'password_too_short' })
  .max(128, { error: 'password_too_long' })
  .refine((v) => /\p{L}/u.test(v) && /\p{N}/u.test(v), {
    error: 'password_needs_letter_and_digit',
  });

/**
 * Văn bản tùy chọn: bỏ khoảng trắng đầu cuối; chuỗi rỗng hoặc `null` thành `null` (xóa giá trị khi sửa).
 * Không gửi trường thì giữ nguyên (`undefined`).
 */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: 'too_long' })
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

/** Số tiền VND: số nguyên, không âm (DB: bigint + CHECK >= 0). */
export const VndAmount = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

/** Query phân trang. Query string là chuỗi nên ép kiểu sang số. */
export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

/** Bao danh sách có phân trang trong response. */
export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.int().min(1),
    pageSize: z.int().min(1),
    total: z.int().nonnegative(),
  });
