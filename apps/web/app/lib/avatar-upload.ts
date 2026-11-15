// Đổi ảnh đại diện từ trình duyệt, ba bước:
//   1. Xin vé tải lên qua route web /app/account/avatar (server web gọi API POST /files/uploads).
//   2. PUT tệp thẳng lên kho lưu trữ bằng URL trong vé (tệp không đi qua server web hay API).
//   3. Báo route web dùng tệp đó làm ảnh đại diện (API PUT /me/avatar kiểm tra tệp đã có trong kho).
// Đây là chỗ duy nhất giao diện gọi `fetch` trực tiếp: tải tệp lên kho không đi qua action dạng form được.
import { FILE_RULES, UploadTicketResponse } from '@tps/shared';
import { z } from 'zod';
import type { Message } from './form';
import { PATHS } from './navigation';

export type AvatarUploadResult =
  { ok: true; avatarUrl: string | null } | { ok: false; message: Message };

/** Kết quả lỗi mà route /app/account/avatar trả về. */
const RouteFailure = z.object({ message: z.object({ key: z.string() }) });
const SetResult = z.object({ avatarUrl: z.string().nullable() });

const fail = (key: Message['key']): AvatarUploadResult => ({ ok: false, message: { key } });

async function callRoute(body: object): Promise<Response> {
  return fetch(PATHS.accountAvatar, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function failureOf(response: Response): Promise<AvatarUploadResult> {
  const parsed = RouteFailure.safeParse(await response.json().catch(() => null));
  return parsed.success
    ? { ok: false, message: parsed.data.message as Message }
    : fail('account.avatarFailed');
}

/** Kiểm tra loại và dung lượng trước khi gửi (API kiểm tra lại). */
export function checkAvatarFile(file: File): Message | null {
  const rule = FILE_RULES.avatar;
  if (!rule.mimeTypes.includes(file.type)) return { key: 'validation.file_type_not_allowed' };
  if (file.size > rule.maxBytes) return { key: 'validation.file_too_large' };
  return null;
}

export async function uploadAvatar(file: File): Promise<AvatarUploadResult> {
  const invalid = checkAvatarFile(file);
  if (invalid) return { ok: false, message: invalid };
  try {
    const ticketResponse = await callRoute({
      step: 'ticket',
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    });
    if (!ticketResponse.ok) return await failureOf(ticketResponse);
    const ticket = UploadTicketResponse.parse(await ticketResponse.json());

    // Đúng Content-Type và số byte đã khai: chữ ký của URL gồm cả hai.
    const put = await fetch(ticket.uploadUrl, {
      method: ticket.method,
      headers: ticket.headers,
      body: file,
    });
    if (!put.ok) return fail('account.avatarFailed');

    const setResponse = await callRoute({ step: 'set', fileId: ticket.fileId });
    if (!setResponse.ok) return await failureOf(setResponse);
    return { ok: true, avatarUrl: SetResult.parse(await setResponse.json()).avatarUrl };
  } catch {
    // Mất mạng, kho lưu trữ không trả lời, dữ liệu trả về sai dạng.
    return fail('account.avatarFailed');
  }
}
