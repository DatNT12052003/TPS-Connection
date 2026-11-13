import { setupServer } from 'msw/node';

/** Server msw dùng chung; mỗi test tự thêm handler bằng server.use(...). */
export const server = setupServer();

export const API = 'http://api.test';
