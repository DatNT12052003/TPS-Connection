// Chỉ dùng cho TypeORM CLI (npm run db:migrate / db:revert / db:status / db:migration:generate).
// Dùng logger console có sẵn của TypeORM (in ngay, đồng bộ) thay cho pino: CLI thoát ngay sau khi chạy,
// log của pino-pretty (chạy ở worker thread) sẽ không kịp in.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadEnv } from '../config/env.js';
import { createDataSource } from './data-source.js';

const { options } = createDataSource(loadEnv());

export default new DataSource({
  ...options,
  logger: 'advanced-console',
  logging: ['error', 'warn', 'info', 'log', 'migration', 'schema'],
});
