import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  // Khu công khai: SSR cho SEO.
  layout('routes/public/layout.tsx', [
    index('routes/public/home.tsx'),
    route('status', 'routes/public/status.tsx'),
    route('*', 'routes/public/not-found.tsx'),
  ]),

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
  route('dev/role', 'routes/dev-role.ts'),
] satisfies RouteConfig;
