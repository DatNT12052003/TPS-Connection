// Gửi email qua một interface: nghiệp vụ không biết là SMTP, Gmail hay dịch vụ khác. Đổi nhà cung cấp
// (hoặc thêm SMS sau này) chỉ cần thêm một bản cài đặt mới (cong_nghe_su_dung.md §2).
import { z } from 'zod';

export const EmailMessage = z.object({
  to: z.email(),
  subject: z.string().min(1).max(200),
  /** Bản chữ thuần: luôn có, cho ứng dụng email không hiển thị HTML. */
  text: z.string().min(1),
  html: z.string().min(1).optional(),
});
export type EmailMessage = z.infer<typeof EmailMessage>;

export interface EmailSender {
  /** Gửi một email. Ném lỗi khi máy chủ email từ chối hoặc không kết nối được (job sẽ thử lại). */
  send(message: EmailMessage): Promise<{ messageId: string }>;
  /** Kiểm tra kết nối và đăng nhập SMTP. */
  verify(): Promise<void>;
  close(): void;
}
