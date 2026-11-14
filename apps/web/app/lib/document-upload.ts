// Tải một giấy tờ xác minh (CCCD, thẻ sinh viên, bằng cấp) từ trình duyệt lên kho riêng tư, hai bước:
//   1. Xin vé qua route web /app/profile/documents/ticket (server web gọi API POST /files/uploads).
//   2. PUT tệp thẳng lên kho bằng URL trong vé.
// Kết quả là `fileId`; form nộp xác minh gửi id này, API kiểm tra tệp đã thật sự lên kho.
import { FILE_RULES, UploadTicketResponse } from '@tps/shared';
import { z } from 'zod';
import type { Message } from './form';
import { PATHS } from './navigation';

export type DocumentPurpose = 'verification_document' | 'credential';

export type DocumentUploadResult =
  | { ok: true; fileId: string; fileName: string; sizeBytes: number }
  | { ok: false; message: Message };

const RouteFailure = z.object({ message: z.object({ key: z.string() }) });
const failed = (): DocumentUploadResult => ({
  ok: false,
  message: { key: 'verification.uploadFailed' },
});

/** Loại tệp cho ô chọn tệp (`accept`). */
export const documentAccept = (purpose: DocumentPurpose) => FILE_RULES[purpose].mimeTypes.join(',');

/** Kiểm tra loại và dung lượng trước khi gửi (API kiểm tra lại). */
export function checkDocumentFile(file: File, purpose: DocumentPurpose): Message | null {
  const rule = FILE_RULES[purpose];
  if (!rule.mimeTypes.includes(file.type)) return { key: 'validation.file_type_not_allowed' };
  if (file.size > rule.maxBytes) return { key: 'validation.file_too_large' };
  return null;
}

export async function uploadDocument(
  file: File,
  purpose: DocumentPurpose,
): Promise<DocumentUploadResult> {
  const invalid = checkDocumentFile(file, purpose);
  if (invalid) return { ok: false, message: invalid };
  try {
    const ticketResponse = await fetch(PATHS.documentTicket, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      }),
    });
    if (!ticketResponse.ok) {
      const parsed = RouteFailure.safeParse(await ticketResponse.json().catch(() => null));
      return parsed.success ? { ok: false, message: parsed.data.message as Message } : failed();
    }
    const ticket = UploadTicketResponse.parse(await ticketResponse.json());
    // Đúng Content-Type và số byte đã khai: chữ ký của URL gồm cả hai.
    const put = await fetch(ticket.uploadUrl, {
      method: ticket.method,
      headers: ticket.headers,
      body: file,
    });
    if (!put.ok) return failed();
    return { ok: true, fileId: ticket.fileId, fileName: file.name, sizeBytes: file.size };
  } catch {
    return failed();
  }
}
