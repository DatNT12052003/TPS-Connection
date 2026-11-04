import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    ignores: ['src/http/**'],
    rules: {
      // Routes must go through defineRoute so that every route declares a policy.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'express',
              message: 'Declare routes with defineRoute from src/http/route.ts.',
            },
          ],
        },
      ],
    },
  },
);
