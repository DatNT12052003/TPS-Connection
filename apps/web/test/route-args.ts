// Dựng tham số cho loader/action khi test trực tiếp (không qua server React Router): request, context có
// ServerApi trỏ tới API giả của msw.
import { RouterContextProvider } from 'react-router';
import { ServerApi, serverApiContext } from '~/lib/server-api.server';
import { API } from './msw-server';

export const WEB = 'http://localhost:5173';

export function routeArgs(
  path: string,
  init: {
    method?: string;
    form?: Record<string, string>;
    /** Body JSON (route chỉ có action trả JSON, ví dụ /app/account/avatar). */
    json?: unknown;
    cookie?: string;
    params?: Record<string, string>;
  } = {},
) {
  const headers = new Headers({ Origin: WEB });
  if (init.cookie) headers.set('Cookie', init.cookie);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');
  const hasBody = init.form !== undefined || init.json !== undefined;
  const request = new Request(`${WEB}${path}`, {
    method: init.method ?? (hasBody ? 'POST' : 'GET'),
    headers,
    ...(init.form && { body: new URLSearchParams(init.form) }),
    ...(init.json !== undefined && { body: JSON.stringify(init.json) }),
  });
  const api = new ServerApi(request, API);
  const context = new RouterContextProvider();
  context.set(serverApiContext, api);
  // Kiểu đầy đủ của Route.*Args có thêm vài trường không dùng tới; ép kiểu cho gọn.
  return { args: { request, context, params: init.params ?? {} } as never, api };
}

/** Response được trả về hoặc ném ra (loader/action ném redirect). */
export async function settle(promise: Promise<unknown>): Promise<unknown> {
  try {
    return await promise;
  } catch (thrown) {
    return thrown;
  }
}
