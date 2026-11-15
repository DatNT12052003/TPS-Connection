// Xử lý chữ tiếng Việt dùng chung: bỏ dấu để tìm kiếm không dấu, và tạo slug cho đường dẫn (D56).

/**
 * Bỏ dấu tiếng Việt, giữ nguyên hoa thường: "Phường Ba Đình" -> "Phuong Ba Dinh".
 * Dùng cho cột `name_ascii` và các ô tìm kiếm không dấu.
 */
export function toAscii(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

/**
 * Slug cho đường dẫn: chữ thường không dấu, nối bằng "-", tối đa `maxLength` ký tự (không cắt giữa từ).
 * "Nguyễn Văn A – Toán, Hà Nội" -> "nguyen-van-a-toan-ha-noi".
 */
export function slugify(text: string, maxLength = 80): string {
  const slug = toAscii(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength + 1);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > 0 ? cut.slice(0, lastDash) : slug.slice(0, maxLength)).replace(/-+$/, '');
}

/** Mã công khai trong đường dẫn: 10 ký tự hex thường, sinh ngẫu nhiên trong database (`public_code`). */
export const PUBLIC_CODE_PATTERN = /^[0-9a-f]{10}$/;

/**
 * Slug công khai (D56): phần chữ không dấu sinh từ nội dung, cuối là mã công khai để tìm lại bản ghi.
 * ("Thầy Nam", "a1b2c3d4e5") -> "thay-nam-a1b2c3d4e5". Đổi tên thì phần chữ đổi, mã giữ nguyên.
 */
export function publicSlug(text: string, code: string): string {
  const words = slugify(text, 60);
  return words ? `${words}-${code}` : code;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Đọc phần định danh trong đường dẫn công khai: id dạng uuid, hoặc slug kết thúc bằng mã công khai.
 * Phần chữ của slug không dùng để tìm (có thể cũ); trang web chuyển hướng về slug đúng.
 */
export function parsePublicRef(ref: string): { id: string } | { code: string } | null {
  if (UUID_PATTERN.test(ref)) return { id: ref.toLowerCase() };
  const code = /(?:^|-)([0-9a-f]{10})$/.exec(ref)?.[1];
  return code ? { code } : null;
}
