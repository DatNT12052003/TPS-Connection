// Intent `block` / `report` của trang yêu cầu kết nối và cuộc trò chuyện (components/connections/safety-actions.tsx).
// Đích chặn và báo cáo đi trong ô ẩn JSON; API kiểm tra lại người dùng có quyền với đích đó (404 nếu không).
import { BlockList, ReportReceived } from '@tps/shared';
import type { SafetyResult } from '~/components/connections/safety-actions';
import { ApiError } from './api';
import { formErrorFrom, formText } from './form';
import type { ServerApi } from './server-api.server';

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Xử lý intent `block` hoặc `report`; null nếu không phải hai intent này. */
export async function handleSafetyIntent(
  api: ServerApi,
  form: FormData,
): Promise<SafetyResult | null> {
  const intent = formText(form, 'intent');
  if (intent !== 'block' && intent !== 'report') return null;
  try {
    if (intent === 'block') {
      await api.call('/api/v1/me/blocks', {
        method: 'POST',
        body: parseJson(formText(form, 'blockTarget')) ?? {},
        schema: BlockList,
      });
    } else {
      await api.call('/api/v1/reports', {
        method: 'POST',
        body: {
          ...(parseJson(formText(form, 'reportTarget')) ?? {}),
          reasonCode: formText(form, 'reasonCode'),
          description: formText(form, 'description'),
        },
        schema: ReportReceived,
      });
    }
    return { intent, ok: true };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    return { intent, ok: false, formError: formErrorFrom(error) };
  }
}
