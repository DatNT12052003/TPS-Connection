// POST /app/account/avatar (chỉ có action, trả JSON): hai bước phía server của việc đổi ảnh đại diện, gọi từ
// `lib/avatar-upload.ts`. Tệp ảnh không đi qua đây: trình duyệt PUT thẳng lên kho lưu trữ giữa hai bước.
//   { step: 'ticket', fileName, contentType, sizeBytes } → { ticket }      (API POST /files/uploads)
//   { step: 'set', fileId }                              → { avatarUrl }   (API PUT /me/avatar)
// Lỗi: { message } (khóa i18n) với mã HTTP của API.
import { AccountProfile, UploadTicketResponse } from '@tps/shared';
import { z } from 'zod';
import { ApiError } from '~/lib/api';
import { fieldErrorsFrom, formErrorFrom, type Message } from '~/lib/form';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import type { Route } from './+types/account-avatar';

const Body = z.discriminatedUnion('step', [
  z.object({
    step: z.literal('ticket'),
    fileName: z.string(),
    contentType: z.string(),
    sizeBytes: z.number(),
  }),
  z.object({ step: z.literal('set'), fileId: z.string() }),
]);

const failure = (message: Message, status: number) => Response.json({ message }, { status });

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return failure({ key: 'errors.bad_request' }, 400);

  const api = getServerApi(context);
  try {
    if (body.data.step === 'ticket') {
      const { step: _step, ...file } = body.data;
      const ticket = await api.call('/api/v1/files/uploads', {
        method: 'POST',
        body: { purpose: 'avatar', ...file },
        schema: UploadTicketResponse,
      });
      return Response.json(ticket);
    }
    const profile = await api.call('/api/v1/me/avatar', {
      method: 'PUT',
      body: { fileId: body.data.fileId },
      schema: AccountProfile,
    });
    return Response.json({ avatarUrl: profile.avatarUrl });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    // Lỗi theo ô (loại tệp, dung lượng, tệp chưa tải xong) nói rõ hơn lỗi chung.
    const fields = fieldErrorsFrom(error, ['contentType', 'sizeBytes', 'fileId']);
    const message = fields.contentType ?? fields.sizeBytes ?? fields.fileId ?? formErrorFrom(error);
    return failure(message, error.status);
  }
}

export function loader() {
  return new Response(null, { status: 405 });
}
