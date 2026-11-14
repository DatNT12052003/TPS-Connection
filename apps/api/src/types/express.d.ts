// Mở rộng kiểu Request của Express với thông tin do middleware của mình gắn vào.
import type { AuthContext } from '../http/authenticate.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Do middleware authenticate gắn; undefined khi chưa đăng nhập. */
    auth?: AuthContext;
  }
}

export {};
