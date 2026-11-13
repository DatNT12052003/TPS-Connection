// Jest chạy mã TypeScript qua SWC, đổi sang CommonJS (Jest hỗ trợ ESM chưa ổn định).
// Vì vậy mã nguồn API không dùng `import.meta`.
/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        jsc: {
          target: 'es2023',
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: false },
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  // Import trong mã nguồn có đuôi .js (chuẩn ESM của Node); Jest tìm tệp .ts tương ứng.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  globalSetup: '<rootDir>/test/global-setup.ts',
  globalTeardown: '<rootDir>/test/global-teardown.ts',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
};
