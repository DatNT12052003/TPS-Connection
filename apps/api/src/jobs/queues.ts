// Hàng đợi BullMQ trên Redis. Mỗi loại việc một hàng đợi; job mang dữ liệu đã kiểm tra bằng Zod.
// Việc định kỳ (tự hủy yêu cầu quá hạn, tự xác nhận buổi học sau 48 giờ, xóa ảnh giấy tờ…) thêm ở các
// giai đoạn sau theo cùng mẫu.
import { Queue, type ConnectionOptions, type DefaultJobOptions } from 'bullmq';
import type { EmailMessage } from '../lib/email/email-sender.js';

export const QUEUE_NAMES = { email: 'email' } as const;

/**
 * Kết nối cho BullMQ: dùng URL (BullMQ tự tạo client ioredis với maxRetriesPerRequest = null, điều nó
 * yêu cầu), tách khỏi client Redis của request để job chờ lâu không làm treo request.
 */
export function bullConnection(redisUrl: string): ConnectionOptions {
  return { url: redisUrl };
}

/** Thử lại 5 lần, chờ 30 giây rồi tăng gấp đôi; giữ job lỗi để xem lại. */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
};

export type EmailJobData = EmailMessage;

export function createEmailQueue(connection: ConnectionOptions): Queue<EmailJobData> {
  return new Queue<EmailJobData>(QUEUE_NAMES.email, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
}
