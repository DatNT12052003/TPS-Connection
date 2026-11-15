// Tiện ích dựng nội dung email từ chuỗi i18n.

/** Thay `{{key}}` bằng giá trị tương ứng. */
export const interpolate = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ''));

/** Thoát ký tự HTML cho nội dung chèn vào email (tên người dùng tự nhập). */
export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );
