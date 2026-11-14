// Tên thiết bị dễ đọc từ User-Agent, cho danh sách "Thiết bị đang đăng nhập" (Cài đặt > Bảo mật).
// Chỉ nhận ra các trình duyệt và hệ điều hành phổ biến; không nhận ra thì trả null cho phần đó.

export interface DeviceDescription {
  browser: string | null;
  os: string | null;
}

// Thứ tự quan trọng: Edge, Opera, Cốc Cốc, Samsung có chữ "Chrome" trong User-Agent; Chrome có chữ "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/coc_coc_browser/i, 'Cốc Cốc'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/Firefox\/|FxiOS/, 'Firefox'],
  [/Chrome\/|CriOS/, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

const first = (ua: string, list: [RegExp, string][]) =>
  list.find(([pattern]) => pattern.test(ua))?.[1] ?? null;

export function describeUserAgent(userAgent: string | null): DeviceDescription {
  if (!userAgent) return { browser: null, os: null };
  return { browser: first(userAgent, BROWSERS), os: first(userAgent, SYSTEMS) };
}
