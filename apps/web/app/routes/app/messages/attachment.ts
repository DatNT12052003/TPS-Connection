// GET /app/messages/:conversationId/attachments/:fileId (chỉ có loader): mở tệp đính kèm của một tin nhắn. Server web
// xin API một URL tạm (5 phút) của kho riêng tư rồi chuyển hướng tới đó; người không tham gia hội thoại, tin đã xóa:
// 404. Liên kết trong trang chat trỏ tới đây (URL tạm không nằm sẵn trong HTML).
import { AttachmentUrl } from '@tps/shared';
import { data, redirect } from 'react-router';
import { ApiError } from '~/lib/api';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import type { Route } from './+types/attachment';

export async function loader({ request, params, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const file = await getServerApi(context)
    .call(
      `/api/v1/conversations/${encodeURIComponent(params.conversationId)}/attachments/${encodeURIComponent(params.fileId)}`,
      { schema: AttachmentUrl },
    )
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status < 500) throw data(null, { status: 404 });
      throw error;
    });
  return redirect(file.url, { headers: { 'Cache-Control': 'no-store' } });
}
