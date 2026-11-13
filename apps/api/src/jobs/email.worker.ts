import { UnrecoverableError, Worker, type ConnectionOptions } from 'bullmq';
import { EmailMessage, type EmailSender } from '../lib/email/email-sender.js';
import type { Logger } from '../lib/logger.js';
import { QUEUE_NAMES, type EmailJobData } from './queues.js';

/** Che phần trước @ của địa chỉ email khi ghi log (dữ liệu cá nhân): "phuhuynh@gmail.com" → "ph***@gmail.com". */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 0) return '***';
  return `${address.slice(0, Math.min(2, at))}***${address.slice(at)}`;
}

/**
 * Worker gửi email. Lỗi tạm thời (SMTP không kết nối được) ném ra để BullMQ thử lại; dữ liệu job sai dạng
 * là lỗi lập trình, không thử lại vô ích nên đánh dấu thất bại ngay.
 */
export function createEmailWorker(options: {
  connection: ConnectionOptions;
  sender: EmailSender;
  logger: Logger;
  concurrency?: number;
}): Worker<EmailJobData> {
  const { connection, sender, logger, concurrency = 2 } = options;
  const log = logger.child({ queue: QUEUE_NAMES.email });

  const worker = new Worker<EmailJobData>(
    QUEUE_NAMES.email,
    async (job) => {
      const parsed = EmailMessage.safeParse(job.data);
      if (!parsed.success) {
        // UnrecoverableError: BullMQ không thử lại (dữ liệu sẽ vẫn sai ở lần sau).
        throw new UnrecoverableError(`Invalid email job data: ${parsed.error.message}`);
      }
      const { messageId } = await sender.send(parsed.data);
      return { messageId };
    },
    { connection, concurrency },
  );

  // Không log tiêu đề, nội dung thư (có thể chứa thông tin trẻ); địa chỉ nhận được che bớt.
  worker.on('completed', (job) => {
    log.info({ jobId: job.id, to: maskEmail(job.data.to) }, 'Email sent');
  });
  worker.on('failed', (job, err) => {
    log.warn(
      { jobId: job?.id, attempt: job?.attemptsMade, to: job && maskEmail(job.data.to), err },
      'Email job failed',
    );
  });
  worker.on('error', (err) => log.error({ err }, 'Email worker error'));

  return worker;
}
