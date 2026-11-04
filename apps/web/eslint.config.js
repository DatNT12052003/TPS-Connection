import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['build', '.react-router', 'app/api/schema.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
