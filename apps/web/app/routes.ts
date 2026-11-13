import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  // Khu công khai: SSR cho SEO.
  layout('routes/public/layout.tsx', [
    index('routes/public/home.tsx'),
    route('status', 'routes/public/status.tsx'),
    route('*', 'routes/public/not-found.tsx'),
  ]),

  // Tài khoản (D54, D57): mỗi trang tự dựng bố cục riêng theo canvas.
  route('login', 'routes/auth/login.tsx'),
  route('register', 'routes/auth/register.tsx'),
  route('verify-email', 'routes/auth/verify-email.tsx'),
  route('forgot-password', 'routes/auth/forgot-password.tsx'),
  // Con nhận lời mời của phụ huynh (token sau `#`, D50).
  route('student-invitation', 'routes/auth/student-invitation.tsx'),

  // Khu người dùng đã đăng nhập: gia sư, phụ huynh, học sinh.
  route('app', 'routes/app/layout.tsx', [
    index('routes/app/home.tsx'),
    // Phụ huynh: hồ sơ con, mời con tạo tài khoản, hồ sơ phụ huynh.
    route('children/new', 'routes/app/children/new.tsx'),
    route('children/:learnerId', 'routes/app/children/detail.tsx'),
    route('children/:learnerId/invite', 'routes/app/children/invite.tsx'),
    route('account', 'routes/app/account.tsx'),
    route('*', 'routes/app/not-found.tsx'),
  ]),

  // Khu Manager / Admin.
  route('admin', 'routes/admin/layout.tsx', [
    index('routes/admin/home.tsx'),
    route('*', 'routes/admin/not-found.tsx'),
  ]),

  // Route chỉ có action (không có giao diện).
  route('preferences', 'routes/preferences.ts'),
  route('logout', 'routes/auth/logout.ts'),
  // Route chỉ có dữ liệu: xã của một tỉnh, cho ô chọn xã/phường.
  route('catalog/provinces/:provinceId/communes', 'routes/catalog/communes.ts'),
] satisfies RouteConfig;
