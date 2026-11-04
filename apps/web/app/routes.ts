import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/root-redirect.tsx'),
  // Same paths as the API, because the refresh cookie is sent only to /api/v1/auth.
  route('api/v1/auth/refresh', 'routes/session-refresh.ts'),
  route('api/v1/auth/logout', 'routes/session-logout.ts'),
  route(':lang', 'routes/lang-layout.tsx', [
    index('routes/home.tsx'),
    route('register', 'routes/register.tsx'),
    route('login', 'routes/login.tsx'),
    route('verify-email', 'routes/verify-email.tsx'),
    route('forgot-password', 'routes/forgot-password.tsx'),
    route('reset-password', 'routes/reset-password.tsx'),
    route('account', 'routes/account.tsx'),
  ]),
] satisfies RouteConfig;
