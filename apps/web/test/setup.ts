import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw-server';

// msw chặn mọi fetch trong test; request không có handler là lỗi (không gọi mạng thật).
// msw 3: tên tùy chọn là onUnhandledFrame (bản 2 là onUnhandledRequest).
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
