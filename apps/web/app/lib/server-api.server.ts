// Gọi API từ server web (loader, action) thay cho trình duyệt (D57). Mỗi request của trình duyệt có một
// ServerApi riêng, do middleware ở root tạo (`serverApiMiddleware`):
//
// - chuyển tiếp cookie phiên `tps_at`, `tps_rt` của trình duyệt, cùng User-Agent, Origin (để API vẫn chống
//   CSRF bằng kiểm tra Origin) và X-Forwarded-For (IP thật cho rate limit; API phải tin web là proxy);
// - access token hết hạn (401): tự gọi /auth/refresh MỘT lần cho cả request rồi thử lại;
// - gom mọi Set-Cookie API trả về; middleware gắn chúng vào response gửi trình duyệt, nên cookie vẫn là
//   httpOnly do API quyết định (tên, hạn, Domain, Secure), JavaScript không đọc được.
//
// Chỉ chạy trên server (tệp .server.ts): không bao giờ lọt vào mã của trình duyệt.
import { AUTH_COOKIES } from '@tps/shared';
import { createContext, type MiddlewareFunction, type RouterContextProvider } from 'react-router';
import type { z } from 'zod';
import { ApiError, apiErrorFromBody, DEFAULT_API_URL } from './api';

/** Địa chỉ API mà server web gọi tới (biến môi trường API_URL). */
export const serverApiBaseUrl = (): string => process.env.API_URL ?? DEFAULT_API_URL;

/** Các endpoint mà 401 có nghĩa khác "access token hết hạn": không làm mới phiên rồi thử lại. */
const NO_REFRESH_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/register',
  '/api/v1/auth/email-verification/confirm',
  '/api/v1/auth/email-verification/resend',
  '/api/v1/auth/password-reset/request',
  '/api/v1/auth/password-reset/confirm',
]);

/** Đọc header Cookie thành Map tên -> giá trị (giá trị giữ nguyên dạng đã mã hóa). */
export function parseCookieHeader(header: string | null): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    jar.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return jar;
}

/** Tên, giá trị và việc cookie có bị xóa hay không, từ một dòng Set-Cookie. */
export function parseSetCookie(
  line: string,
  now = Date.now(),
): { name: string; value: string; removed: boolean } {
  const [pair = '', ...attributes] = line.split(';');
  const index = pair.indexOf('=');
  const name = pair.slice(0, index).trim();
  const value = pair.slice(index + 1).trim();
  let removed = value === '';
  for (const attribute of attributes) {
    const [key = '', attrValue = ''] = attribute.split('=').map((s) => s.trim());
    if (key.toLowerCase() === 'max-age' && Number(attrValue) <= 0) removed = true;
    if (key.toLowerCase() === 'expires' && Date.parse(attrValue) <= now) removed = true;
  }
  return { name, value, removed };
}

interface CallOptions<S extends z.ZodType | undefined> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Schema của response thành công; bỏ qua với endpoint trả 204 hoặc khi không cần đọc body. */
  schema?: S;
}

export class ServerApi {
  private readonly jar: Map<string, string>;
  private readonly setCookies: string[] = [];
  private refreshing: Promise<boolean> | undefined;

  constructor(
    private readonly incoming: Request,
    private readonly baseUrl: string = serverApiBaseUrl(),
  ) {
    this.jar = parseCookieHeader(incoming.headers.get('Cookie'));
  }

  /** Trình duyệt có gửi cookie phiên không (không có thì chắc chắn chưa đăng nhập, khỏi gọi API). */
  hasSession(): boolean {
    return this.jar.has(AUTH_COOKIES.access) || this.jar.has(AUTH_COOKIES.refresh);
  }

  /** Các dòng Set-Cookie cần gửi lại trình duyệt (middleware gắn vào response). */
  responseCookies(): readonly string[] {
    return this.setCookies;
  }

  /**
   * Gọi API, kiểm tra response bằng schema. Lỗi: ném ApiError (không gọi được API: `service_unavailable`).
   * Không có `schema`: trả undefined.
   */
  async call<S extends z.ZodType | undefined = undefined>(
    path: string,
    options: CallOptions<S> = {},
  ): Promise<S extends z.ZodType ? z.infer<S> : undefined> {
    let response = await this.send(path, options);
    if (
      response.status === 401 &&
      !NO_REFRESH_PATHS.has(path) &&
      this.jar.has(AUTH_COOKIES.refresh) &&
      (await this.refresh())
    ) {
      response = await this.send(path, options);
    }

    const body: unknown =
      response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) throw apiErrorFromBody(response.status, body);
    if (!options.schema) return undefined as never;
    const result = options.schema.safeParse(body);
    if (!result.success) {
      throw new ApiError(
        'internal_error',
        response.status,
        `Unexpected response shape from ${path}`,
      );
    }
    return result.data as never;
  }

  /** Làm mới phiên một lần cho cả request (nhiều loader chạy song song dùng chung kết quả). */
  private refresh(): Promise<boolean> {
    this.refreshing ??= this.send('/api/v1/auth/refresh', { method: 'POST' })
      .then((response) => response.ok)
      .catch(() => false);
    return this.refreshing;
  }

  private async send(path: string, { method = 'GET', body }: CallOptions<z.ZodType | undefined>) {
    const headers = new Headers({ Accept: 'application/json' });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const cookie = [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
    if (cookie) headers.set('Cookie', cookie);
    for (const name of ['user-agent', 'accept-language', 'origin', 'x-forwarded-for']) {
      const value = this.incoming.headers.get(name);
      if (value) headers.set(name, value);
    }

    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
        redirect: 'manual',
      });
    } catch {
      throw new ApiError('service_unavailable', 0, `Cannot reach API at ${this.baseUrl}`);
    }
    this.absorbCookies(response);
    return response;
  }

  /** Ghi nhận Set-Cookie: cập nhật cookie dùng cho các lời gọi sau, và giữ lại để gửi trình duyệt. */
  private absorbCookies(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      this.setCookies.push(line);
      const { name, value, removed } = parseSetCookie(line);
      if (removed) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
}

export const serverApiContext = createContext<ServerApi>();

/** ServerApi của request hiện tại (do `serverApiMiddleware` tạo). */
export function getServerApi(context: Readonly<RouterContextProvider>): ServerApi {
  return context.get(serverApiContext);
}

/**
 * Middleware của root: tạo ServerApi cho request, rồi gắn các Set-Cookie của API vào response (cả trang
 * lẫn dữ liệu, cả chuyển hướng).
 */
export const serverApiMiddleware: MiddlewareFunction<Response> = async (
  { request, context },
  next,
) => {
  const api = new ServerApi(request);
  context.set(serverApiContext, api);
  const response = await next();
  const existing = new Set(response.headers.getSetCookie());
  for (const line of api.responseCookies()) {
    if (!existing.has(line)) response.headers.append('Set-Cookie', line);
  }
  return response;
};
