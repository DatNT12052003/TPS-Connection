import { ProvinceIdParams } from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { validate } from '../../http/validate.js';
import type { CatalogService } from './catalog.service.js';

/** Danh mục ít đổi: cho trình duyệt và CDN giữ 1 giờ. */
const CACHE_CONTROL = 'public, max-age=3600';

/**
 * /api/v1/catalog: danh mục công khai (không cần đăng nhập).
 *
 *   GET /subjects                          200  môn học
 *   GET /grade-levels                      200  khối lớp / cấp học
 *   GET /provinces                         200  tỉnh, thành phố
 *   GET /provinces/:provinceId/communes    200  xã, phường, đặc khu của tỉnh
 */
export function catalogRouter(service: CatalogService): Router {
  const router = Router();
  const list =
    (load: (req: Parameters<RequestHandler>[0]) => Promise<unknown[]>): RequestHandler =>
    async (req, res) => {
      const items = await load(req);
      res.set('Cache-Control', CACHE_CONTROL).json({ items });
    };

  router.get(
    '/subjects',
    list(() => service.subjects()),
  );
  router.get(
    '/grade-levels',
    list(() => service.gradeLevels()),
  );
  router.get(
    '/provinces',
    list(() => service.provinces()),
  );
  router.get(
    '/provinces/:provinceId/communes',
    validate({ params: ProvinceIdParams }),
    list((req) => service.communes((req.params as unknown as ProvinceIdParams).provinceId)),
  );
  return router;
}
