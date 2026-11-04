import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/root-redirect.tsx'),
  // Same paths as the API, because the refresh cookie is sent only to /api/v1/auth.
  route('api/v1/auth/refresh', 'routes/session-refresh.ts'),
  route('api/v1/auth/logout', 'routes/session-logout.ts'),
  route('catalog/communes', 'routes/catalog-communes.ts'),
  route(':lang', 'routes/lang-layout.tsx', [
    index('routes/home.tsx'),
    route('register', 'routes/register.tsx'),
    route('login', 'routes/login.tsx'),
    route('verify-email', 'routes/verify-email.tsx'),
    route('forgot-password', 'routes/forgot-password.tsx'),
    route('reset-password', 'routes/reset-password.tsx'),
    route('confirm-email-change', 'routes/confirm-email-change.tsx'),
    route('account', 'routes/account.tsx'),
    route('account/profile', 'routes/account-profile.tsx'),
    route('account/security', 'routes/account-security.tsx'),
    route('tutors/:id', 'routes/tutor-public.tsx'),
    route('account/tutor-profile', 'routes/account-tutor-profile.tsx'),
    route('admin/catalog', 'routes/admin-catalog.tsx'),
    route('account/students', 'routes/students.tsx'),
    route('account/students/new', 'routes/student-new.tsx'),
    route('account/students/:id', 'routes/student-edit.tsx'),
  ]),
] satisfies RouteConfig;
