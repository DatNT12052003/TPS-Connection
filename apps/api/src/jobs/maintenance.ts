// Job định kỳ dọn dữ liệu (docs/thiet_ke_co_so_du_lieu.md mục 13). Một hàng đợi `maintenance`, mỗi việc một
// "job scheduler" của BullMQ (cron theo giờ Việt Nam). Lập lịch bằng upsert nên khởi động lại hay chạy nhiều
// tiến trình API cùng lúc cũng không tạo lịch trùng.
import { type ConnectionOptions, Queue, Worker } from 'bullmq';
import type { Logger } from '../lib/logger.js';

export const MAINTENANCE_QUEUE = 'maintenance';

/** Việc dọn dữ liệu: tên job → hàm chạy (trả số bản ghi đã xử lý). */
export interface MaintenanceTasks {
  'purge-verification-documents': () => Promise<number>;
  'cleanup-stale-uploads': () => Promise<number>;
}
export type MaintenanceTaskName = keyof MaintenanceTasks;

/** Lịch chạy (cron, giờ Việt Nam): ban đêm, ít người dùng. */
export const MAINTENANCE_SCHEDULE: Record<MaintenanceTaskName, string> = {
  'purge-verification-documents': '0 3 * * *',
  'cleanup-stale-uploads': '30 3 * * *',
};

export function createMaintenanceQueue(connection: ConnectionOptions): Queue {
  return new Queue(MAINTENANCE_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
}

/** Đặt (hoặc cập nhật) lịch cho mọi việc dọn dữ liệu. */
export async function scheduleMaintenance(queue: Queue): Promise<void> {
  for (const [name, pattern] of Object.entries(MAINTENANCE_SCHEDULE)) {
    await queue.upsertJobScheduler(name, { pattern, tz: 'Asia/Ho_Chi_Minh' }, { name });
  }
}

export function createMaintenanceWorker(options: {
  connection: ConnectionOptions;
  tasks: MaintenanceTasks;
  logger: Logger;
}): Worker {
  const log = options.logger.child({ queue: MAINTENANCE_QUEUE });
  const worker = new Worker(
    MAINTENANCE_QUEUE,
    async (job) => {
      const task = options.tasks[job.name as MaintenanceTaskName];
      if (!task) throw new Error(`Unknown maintenance job: ${job.name}`);
      return { processed: await task() };
    },
    // Một việc một lúc: các việc dọn dẹp không cần chạy song song.
    { connection: options.connection, concurrency: 1 },
  );
  worker.on('completed', (job, result: { processed: number }) =>
    log.info({ job: job.name, processed: result.processed }, 'Maintenance job done'),
  );
  worker.on('failed', (job, err) => log.warn({ job: job?.name, err }, 'Maintenance job failed'));
  worker.on('error', (err) => log.error({ err }, 'Maintenance worker error'));
  return worker;
}
