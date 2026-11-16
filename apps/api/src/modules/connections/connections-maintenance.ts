// Job 15 phút một lần (docs/thiet_ke_co_so_du_lieu.md mục 13): nhắc trước khi yêu cầu kết nối hết hạn (D30) rồi tự
// hủy yêu cầu quá hạn (C3). Chạy theo lô để mỗi transaction ngắn; dòng đang bị người dùng thao tác thì bỏ qua, lần
// sau xử lý. Thông báo cho người dùng (đợt 3) đọc từ các sự kiện `expiry_reminded`, `expired`.
import { CONNECTION_LIMITS } from '@tps/shared';
import type { DataSource } from 'typeorm';
import { createConnectionsRepository } from './connections.repository.js';

const BATCH_SIZE = 500;
/** Chặn vòng lặp vô hạn nếu có lỗi logic: tối đa 100 lô một lần chạy. */
const MAX_BATCHES = 100;

export function createConnectionsMaintenance(deps: { dataSource: DataSource }) {
  const { dataSource } = deps;

  /** Gọi `work` (mỗi lần một transaction) cho tới khi một lô không đầy. */
  async function inBatches(work: (limit: number) => Promise<number>): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const done = await work(BATCH_SIZE);
      total += done;
      if (done < BATCH_SIZE) break;
    }
    return total;
  }

  return {
    /** Ghi nhắc rồi hủy quá hạn. Trả tổng số yêu cầu đã xử lý. */
    async run(): Promise<number> {
      const reminded = await inBatches((limit) =>
        dataSource.transaction((manager) =>
          createConnectionsRepository(manager).markExpiryReminders(limit, {
            pendingHours: CONNECTION_LIMITS.pendingReminderHours,
            negotiatingDays: CONNECTION_LIMITS.negotiatingReminderDays,
          }),
        ),
      );
      const expired = await inBatches((limit) =>
        dataSource.transaction((manager) =>
          createConnectionsRepository(manager).expireOverdue(limit),
        ),
      );
      return reminded + expired;
    },
  };
}

export type ConnectionsMaintenance = ReturnType<typeof createConnectionsMaintenance>;
