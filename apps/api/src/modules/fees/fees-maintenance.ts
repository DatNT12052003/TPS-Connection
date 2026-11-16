// Job học phí `fee-statements` (hằng ngày, docs/thiet_ke_co_so_du_lieu.md mục 13):
// - Lập bảng học phí tháng trước cho mọi học sinh có buổi đã chốt, tính tiền, chưa thuộc bảng nào (C6, D23, D40) và
//   báo phụ huynh. Chạy hằng ngày thay vì chỉ ngày 1 để lần chạy bị lỡ (máy chủ tắt) được bù; học sinh đã có bảng
//   của tháng thì bỏ qua, buổi chốt muộn vào bảng tháng sau.
// - Nhắc phụ huynh một lần khi bảng tới hạn (ngày 5, D24) mà chưa trả đủ.
// Mỗi lô một transaction ngắn; `SKIP LOCKED` bỏ qua dòng đang bị người dùng thao tác (lần sau xử lý).
import type { DataSource, EntityManager } from 'typeorm';
import { recordClassNotices } from '../classes/class-notifications.js';
import {
  noopNotifier,
  type Notifier,
  type PendingNotification,
} from '../notifications/notifications.service.js';
import { createFeesRepository, type IssuedStatement } from './fees.repository.js';

const BATCH_SIZE = 200;
const MAX_BATCHES = 50;

/** Ngày đầu của tháng trước `today` (`YYYY-MM-DD`). */
export function previousMonthStart(today: string): string {
  const [year, month] = today.split('-').map(Number) as [number, number];
  const y = month === 1 ? year - 1 : year;
  const m = month === 1 ? 12 : month - 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export function createFeesMaintenance(deps: { dataSource: DataSource; notifier?: Notifier }) {
  const { dataSource } = deps;
  const notifier = deps.notifier ?? noopNotifier;

  /** Một lô: `work` đánh dấu / tạo bảng, báo phụ huynh của từng bảng trong cùng transaction, đẩy sau commit. */
  async function batch(
    work: (manager: EntityManager) => Promise<IssuedStatement[]>,
    event: 'issued' | 'due',
  ): Promise<number> {
    let pending: PendingNotification[] = [];
    const count = await dataSource.transaction(async (manager) => {
      const rows = await work(manager);
      for (const row of rows) {
        pending = pending.concat(
          await recordClassNotices(
            manager,
            notifier,
            row.classId,
            ['clients'],
            (base) => ({
              type: 'fee_statement',
              data: { ...base, enrollmentId: row.enrollmentId, month: row.month, event },
            }),
            { enrollmentId: row.enrollmentId },
          ),
        );
      }
      return rows.length;
    });
    await notifier.dispatch(pending);
    return count;
  }

  async function inBatches(work: () => Promise<number>): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const done = await work();
      total += done;
      if (done < BATCH_SIZE) break;
    }
    return total;
  }

  return {
    async run(): Promise<number> {
      const today = await createFeesRepository(dataSource.manager).todayVn();
      const period = previousMonthStart(today);
      const issued = await inBatches(() =>
        batch(
          (manager) => createFeesRepository(manager).issue(period, { limit: BATCH_SIZE }),
          'issued',
        ),
      );
      const reminded = await inBatches(() =>
        batch((manager) => createFeesRepository(manager).markDueReminders(BATCH_SIZE), 'due'),
      );
      return issued + reminded;
    },
  };
}

export type FeesMaintenance = ReturnType<typeof createFeesMaintenance>;
