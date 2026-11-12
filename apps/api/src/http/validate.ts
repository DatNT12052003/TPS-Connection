import type { RequestHandler } from 'express';
import type { z } from 'zod';

interface RequestSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

/**
 * Middleware validation ở biên: parse params, query, body bằng schema Zod TRƯỚC khi vào controller,
 * và thay bằng giá trị đã parse (đã ép kiểu, đã áp default, đã bỏ trường thừa).
 * Sai thì ZodError đi tới error handler, trả 422 `validation_failed` kèm lỗi từng trường.
 *
 *   router.get('/lessons', validate({ query: PaginationQuery }), controller.list);
 *   // controller.list: RequestHandler<unknown, unknown, unknown, PaginationQuery>
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    if (schemas.params) {
      req.params = schemas.params.parse(req.params) as typeof req.params;
    }
    if (schemas.query) {
      // Express 5: req.query là getter chỉ đọc, nên ghi đè bằng thuộc tính riêng của request.
      Object.defineProperty(req, 'query', {
        value: schemas.query.parse(req.query),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }
    next();
  };
}
