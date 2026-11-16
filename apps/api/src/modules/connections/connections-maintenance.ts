// Job 15 phút một lần (docs/thiet_ke_co_so_du_lieu.md mục 13): nhắc trước khi yêu cầu kết nối hết hạn (D30) rồi tự
// hủy yêu cầu quá hạn (C3). Chạy theo lô để mỗi transaction ngắn; dòng đang bị người dùng thao tác thì bỏ qua, lần
// sau xử lý. Nhắc kèm thông báo (đợt 3): yêu cầu đang chờ báo bên nhận (người phải trả lời), đang trao đổi báo cả hai
// bên. Tự hủy không thông báo.
import { CONNECTION_LIMITS } from '@tps/shared';
import type { DataSource } from 'typeorm';
import {
  noopNotifier,
  type Notifier,
  type PendingNotification,
} from '../notifications/notifications.service.js';
import { connectionNotice, type ConnectionNotice } from './connection-notifications.js';
import { createConnectionsRepository } from './connections.repository.js';

const BATCH_SIZE = 500;
/** Chặn vòng lặp vô hạn nếu có lỗi logic: tối đa 100 lô một lần chạy. */
const MAX_BATCHES = 100;

export function createConnectionsMaintenance(deps: {
  dataSource: DataSource;
  notifier?: Notifier;
}) {
  const { dataSource } = deps;
  const notifier = deps.notifier ?? noopNotifier;

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

  /** Một lô nhắc: ghi nhắc và thông báo trong một transaction, đẩy thông báo sau commit. */
  async function remindBatch(limit: number): Promise<number> {
    let pending: PendingNotification[] = [];
    const count = await dataSource.transaction(async (manager) => {
      const repo = createConnectionsRepository(manager);
      const ids = await repo.markExpiryReminders(limit, {
        pendingHours: CONNECTION_LIMITS.pendingReminderHours,
        negotiatingDays: CONNECTION_LIMITS.negotiatingReminderDays,
      });
      const notices: ConnectionNotice[] = [];
      for (const request of await repo.findByIds(ids)) {
        if (request.status !== 'pending' && request.status !== 'negotiating') continue;
        const expiring = { status: request.status, expiresAt: request.expiresAt };
        const accepted = request.status === 'negotiating';
        const recipients =
          request.status === 'pending'
            ? [request.direction === 'client_to_tutor' ? 'tutor' : 'client']
            : ['tutor', 'client'];
        for (const recipient of recipients as ('tutor' | 'client')[]) {
          notices.push(
            await connectionNotice(manager, request, 'connection_expiring', recipient, {
              accepted,
              expiring,
            }),
          );
        }
      }
      pending = await notifier.record(manager, notices);
      return ids.length;
    });
    await notifier.dispatch(pending);
    return count;
  }

  return {
    /** Ghi nhắc rồi hủy quá hạn. Trả tổng số yêu cầu đã xử lý. */
    async run(): Promise<number> {
      const reminded = await inBatches(remindBatch);
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
