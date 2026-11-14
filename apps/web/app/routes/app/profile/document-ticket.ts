// POST /app/profile/documents/ticket (chỉ có action, trả JSON): xin URL tải một giấy tờ xác minh lên kho, gọi
// từ `lib/document-upload.ts`. Tệp không đi qua đây: trình duyệt PUT thẳng lên kho bằng URL trong vé.
//   { purpose: 'verification_document' | 'credential', fileName, contentType, sizeBytes } → vé (API POST /files/uploads)
// Lỗi: { message } (khóa i18n) với mã HTTP của API.
import { UploadTicketResponse } from '@tps/shared';
import { z } from 'zod';
import { ApiError } from '~/lib/api';
import { fieldErrorsFrom, formErrorFrom, type Message } from '~/lib/form';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import type { Route } from './+types/document-ticket';

const Body = z.object({
  purpose: z.enum(['verification_document', 'credential']),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
});

const failure = (message: Message, status: number) => Response.json({ message }, { status });

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return failure({ key: 'errors.bad_request' }, 400);
  try {
    const ticket = await getServerApi(context).call('/api/v1/files/uploads', {
      method: 'POST',
      body: body.data,
      schema: UploadTicketResponse,
    });
    return Response.json(ticket);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    const fields = fieldErrorsFrom(error, ['contentType', 'sizeBytes']);
    return failure(fields.contentType ?? fields.sizeBytes ?? formErrorFrom(error), error.status);
  }
}

export function loader() {
  return new Response(null, { status: 405 });
}
