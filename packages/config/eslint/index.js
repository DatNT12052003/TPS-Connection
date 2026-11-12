// Cấu hình ESLint (flat config) dùng chung cho mọi app và package.
// Dùng trong eslint.config.js của từng package:
//   import { createConfig } from '@tps/config/eslint';
//   export default createConfig({ tsconfigRootDir: import.meta.dirname });
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * @param {object} options
 * @param {string} options.tsconfigRootDir Thư mục chứa tsconfig.json của package (thường là import.meta.dirname).
 * @param {import('typescript-eslint').ConfigArray} [options.extra] Cấu hình bổ sung riêng của package.
 * @param {string[]} [options.ignores] Đường dẫn bỏ qua thêm.
 * @param {boolean} [options.browser] Thêm biến toàn cục của trình duyệt (window, document…) cho app web.
 */
export function createConfig({ tsconfigRootDir, extra = [], ignores = [], browser = false }) {
  return tseslint.config(
    { ignores: ['dist/**', 'build/**', 'coverage/**', '.turbo/**', ...ignores] },
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        globals: { ...globals.node, ...(browser && globals.browser) },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      plugins: { import: importPlugin },
      rules: {
        // npm cài phẳng nên import được cả thư viện chưa khai báo trong package.json của app; chặn lại (cong_nghe_su_dung.md, D29).
        'import/no-extraneous-dependencies': [
          'error',
          {
            devDependencies: [
              '**/*.test.ts',
              '**/*.test.tsx',
              '**/*.spec.ts',
              '**/test/**',
              '**/tests/**',
              '**/*.config.{js,ts,mjs,cjs}',
            ],
          },
        ],
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        eqeqeq: ['error', 'always'],
        'no-console': 'warn',
      },
    },
    // Tệp JavaScript (cấu hình, script): không kiểm tra theo kiểu.
    {
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
    },
    // Test: body của Supertest/fetch có kiểu any, bản giả thường là hàm async không await.
    {
      files: ['**/*.test.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/require-await': 'off',
      },
    },
    ...extra,
    // Để Prettier lo định dạng; tắt các rule ESLint xung đột.
    prettier,
  );
}
