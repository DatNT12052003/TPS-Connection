import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/root-redirect.tsx'),
  route(':lang', 'routes/lang-layout.tsx', [index('routes/home.tsx')]),
] satisfies RouteConfig;
