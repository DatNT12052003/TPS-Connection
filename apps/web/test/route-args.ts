// Dựng tham số cho loader/action khi test trực tiếp (không qua server React Router): request, context có
// ServerApi trỏ tới API giả của msw.
import { RouterContextProvider } from 'react-router';
import { ServerApi, serverApiContext } from '~/lib/server-api.server';
import { API } from './msw-server';

export const WEB = 'http://localhost:5173';

export function routeArgs(
  path: string,
  init: { method?: string; form?: Record<string, string>; cookie?: string } = {},
) {
  const headers = new Headers({ Origin: WEB });
  if (init.cookie) headers.set('Cookie', init.cookie);
  const request = new Request(`${WEB}${path}`, {
    method: init.method ?? (init.form ? 'POST' : 'GET'),
    headers,
    ...(init.form && { body: new URLSearchParams(init.form) }),
  });
  const api = new ServerApi(request, API);
  const context = new RouterContextProvider();
  context.set(serverApiContext, api);
  // Kiểu đầy đủ của Route.*Args có thêm vài trường không dùng tới; ép kiểu cho gọn.
  return { args: { request, context, params: {} } as never, api };
}

/** Response được trả về hoặc ném ra (loader/action ném redirect). */
export async function settle(promise: Promise<unknown>): Promise<unknown> {
  try {
    return await promise;
  } catch (thrown) {
    return thrown;
  }
}
