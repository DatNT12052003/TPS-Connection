import type { RequestHandler } from 'express';
import { AppError } from '../lib/app-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Chống CSRF cho xác thực bằng cookie. Cookie SameSite=Lax đã chặn phần lớn request gửi từ trang khác;
 * thêm lớp này để chặn cả request từ origin lạ cùng "site" (ví dụ một subdomain khác).
 * Request thay đổi dữ liệu có `Origin` không nằm trong CORS_ORIGINS, hoặc trình duyệt báo
 * `Sec-Fetch-Site: cross-site`, bị từ chối 403. Không có `Origin` (app mobile, curl): cho qua,
 * vì những client này không tự gửi kèm cookie của trình duyệt.
 */
export function originCheck(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.get('origin');
    if (origin && !allowed.has(origin)) {
      throw new AppError('forbidden', `Origin ${origin} is not allowed`);
    }
    if (!origin && req.get('sec-fetch-site') === 'cross-site') {
      throw new AppError('forbidden', 'Cross-site request without origin');
    }
    next();
  };
}
