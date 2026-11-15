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
