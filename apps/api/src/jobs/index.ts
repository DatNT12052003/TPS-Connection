import type { Queue, Worker } from 'bullmq';
import type { EmailMessage, EmailSender } from '../lib/email/email-sender.js';
import type { Logger } from '../lib/logger.js';
import { createEmailWorker } from './email.worker.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  type MaintenanceTasks,
  scheduleMaintenance,
} from './maintenance.js';
import { bullConnection, createEmailQueue, type EmailJobData } from './queues.js';

export interface Jobs {
  /** Xếp email vào hàng đợi; trả về ngay, worker gửi sau (có thử lại). */
  enqueueEmail(message: EmailMessage): Promise<{ jobId: string }>;
  emailQueue: Queue<EmailJobData>;
  /** Đặt lịch các job dọn dữ liệu (chỉ khi có worker). Gọi một lần lúc khởi động. */
  startSchedules(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Tạo hàng đợi, và worker nếu `workersEnabled`. Worker chạy chung tiến trình với API ở bản đầu; khi cần
 * tách, chạy một tiến trình riêng với WORKERS_ENABLED=true và đặt false cho các tiến trình API.
 */
export function createJobs(options: {
  redisUrl: string;
  emailSender: EmailSender;
  logger: Logger;
  workersEnabled: boolean;
  /** Việc dọn dữ liệu định kỳ; worker chạy chúng khi `workersEnabled`. */
  maintenance: MaintenanceTasks;
}): Jobs {
  const connection = bullConnection(options.redisUrl);
  const emailQueue = createEmailQueue(connection);
  const maintenanceQueue = createMaintenanceQueue(connection);
  const workers: Worker[] = options.workersEnabled
    ? [
        createEmailWorker({ connection, sender: options.emailSender, logger: options.logger }),
        createMaintenanceWorker({
          connection,
          tasks: options.maintenance,
          logger: options.logger,
        }),
      ]
    : [];

  return {
    emailQueue,
    async enqueueEmail(message) {
      const job = await emailQueue.add('send', message);
      if (!job.id) throw new Error('BullMQ did not return a job id');
      return { jobId: job.id };
    },
    async startSchedules() {
      if (options.workersEnabled) await scheduleMaintenance(maintenanceQueue);
    },
    async close() {
      // Worker đóng trước: chờ job đang chạy xong, không nhận job mới.
      await Promise.allSettled(workers.map((worker) => worker.close()));
      await Promise.allSettled([emailQueue.close(), maintenanceQueue.close()]);
    },
  };
}
