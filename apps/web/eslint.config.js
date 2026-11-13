import { createConfig } from '@tps/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  browser: true,
  ignores: ['.react-router/**', 'build/**'],
  extra: [
    reactHooks.configs.flat['recommended-latest'],
    {
      files: ['**/*.{ts,tsx}'],
      rules: {
        // React Router dùng `throw data(null, { status: 404 })` / `throw redirect(...)` trong loader, action.
        '@typescript-eslint/only-throw-error': [
          'error',
          {
            allow: [
              { from: 'package', package: 'react-router', name: 'DataWithResponseInit' },
              { from: 'lib', name: 'Response' },
            ],
          },
        ],
      },
    },
  ],
});
