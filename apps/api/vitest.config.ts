import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Test files share one database.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgres://tps_app:tps_app_dev@localhost:5433/tps_test',
      MIGRATION_DATABASE_URL: 'postgres://tps_owner:tps_owner_dev@localhost:5433/tps_test',
    },
  },
});
