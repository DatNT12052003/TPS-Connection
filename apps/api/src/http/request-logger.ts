import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';
import type { Logger } from '../lib/logger.js';

export const REQUEST_ID_HEADER = 'x-request-id';
const VALID_REQUEST_ID = /^[\w-]{1,64}$/;

/** Dùng lại request id do proxy/client gửi (nếu hợp lệ), không thì sinh mới; trả lại trong header. */
function genReqId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/** Log mỗi request một dòng (bỏ qua /health để khỏi ngập log), gắn `req.log` có sẵn request id. */
export function requestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId,
    autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });
}
