import type { Config } from '@react-router/dev/config';

export default {
  // Render phía server: trang công khai (tìm gia sư, hồ sơ, bài đăng) cần SEO (D12).
  // Khu vực đã đăng nhập vẫn chạy được SSR; route nào chỉ cần dữ liệu phía trình duyệt dùng clientLoader.
  ssr: true,
} satisfies Config;
