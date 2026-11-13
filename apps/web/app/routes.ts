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

  // Khu người dùng đã đăng nhập: gia sư, phụ huynh, học sinh.
  route('app', 'routes/app/layout.tsx', [
    index('routes/app/home.tsx'),
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
] satisfies RouteConfig;
