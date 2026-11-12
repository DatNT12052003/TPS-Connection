// Biến môi trường mặc định cho test. Unit test không kết nối thật; test tích hợp (*.int.test.ts)
// tự bật PostgreSQL và Redis bằng Testcontainers rồi ghi đè DATABASE_URL, REDIS_URL.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:1/test';
process.env.REDIS_URL ??= 'redis://127.0.0.1:1';
