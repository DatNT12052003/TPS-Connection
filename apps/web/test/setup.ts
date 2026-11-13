import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import { server } from './msw-server';

// Matcher của jest-dom (toBeInTheDocument, toBeChecked…). Gắn vào `expect` import ở ĐÂY thay vì dùng
// '@testing-library/jest-dom/vitest': tệp đó nằm trong node_modules nên được Node nạp thẳng và lấy `expect`
// từ một bản vitest khác (trên Windows, khi đường dẫn ổ đĩa viết thường `c:` như trong Git Bash), làm
// matcher thỉnh thoảng báo "Invalid Chai property". Kiểu của matcher vẫn lấy từ tsconfig `types`.
expect.extend(jestDomMatchers);

// msw chặn mọi fetch trong test; request không có handler là lỗi (không gọi mạng thật).
// msw 3: tên tùy chọn là onUnhandledFrame (bản 2 là onUnhandledRequest).
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
