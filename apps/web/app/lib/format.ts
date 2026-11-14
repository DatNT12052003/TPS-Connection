// Định dạng ngày giờ cho giao diện. Luôn theo giờ Việt Nam (nền tảng chỉ hoạt động ở Việt Nam), để HTML do
// server dựng và trình duyệt dựng lại giống nhau (không lệch ngày khi máy chủ chạy UTC).
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const intlLocale = (language: string) => (language === 'en' ? 'en-GB' : 'vi-VN');

/** Ngày dạng 20/11/2026. Nhận chuỗi ISO (ngày hoặc ngày giờ). */
export function formatDate(value: string, language: string): string {
  return new Intl.DateTimeFormat(intlLocale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

/** Ngày giờ dạng 20/11/2026 19:30 (giờ Việt Nam). */
export function formatDateTime(value: string, language: string): string {
  return new Intl.DateTimeFormat(intlLocale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}
