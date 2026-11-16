// Job của buổi học (docs/thiet_ke_co_so_du_lieu.md mục 13):
// - `generate-lessons` (hằng ngày): sinh buổi từ lịch lặp tới 8 tuần tới (D27).
// - `lessons-maintenance` (15 phút một lần): nhắc buổi sắp diễn ra (24 giờ trước), nhắc gia sư điểm danh (24 giờ sau
//   khi buổi kết thúc, D36), nhắc phụ huynh xác nhận (24 giờ trước hạn, một lần, C5), tự chốt điểm danh quá 48 giờ
//   (C5), chuyển Manager khiếu nại quá 3 ngày (C5).
// Mỗi lô một transaction ngắn, `SKIP LOCKED` bỏ qua dòng đang bị người dùng thao tác (lần sau xử lý).
import { LESSON_LIMITS, type NotificationContent } from '@tps/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { type ClassRecipient, recordClassNotices } from '../classes/class-notifications.js';
import {
  noopNotifier,
  type Notifier,
  type PendingNotification,
} from '../notifications/notifications.service.js';
import { createLessonsRepository, type JobLessonRow } from './lessons.repository.js';

const BATCH_SIZE = 200;
const MAX_BATCHES = 50;

export function createLessonsMaintenance(deps: { dataSource: DataSource; notifier?: Notifier }) {
  const { dataSource } = deps;
  const notifier = deps.notifier ?? noopNotifier;

  async function inBatches(work: (limit: number) => Promise<number>): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const done = await work(BATCH_SIZE);
      total += done;
      if (done < BATCH_SIZE) break;
    }
    return total;
  }

  /** Một lô: đánh dấu bằng `mark`, ghi thông báo cho mỗi dòng trong cùng transaction, đẩy sau commit. */
  function notifyBatch<T extends JobLessonRow>(
    mark: (manager: EntityManager, limit: number) => Promise<T[]>,
    to: readonly ClassRecipient[],
    build: (
      row: T,
      base: { classId: string; subjectId: number; counterpartName: string | null },
    ) => NotificationContent,
    options: (row: T) => { enrollmentId?: string } = () => ({}),
  ) {
    return async (limit: number): Promise<number> => {
      let pending: PendingNotification[] = [];
      const count = await dataSource.transaction(async (manager) => {
        const rows = await mark(manager, limit);
        for (const row of rows) {
          pending = pending.concat(
            await recordClassNotices(
              manager,
              notifier,
              row.classId,
              to,
              (base) => build(row, base),
              options(row),
            ),
          );
        }
        return rows.length;
      });
      await notifier.dispatch(pending);
      return count;
    };
  }

  const lessonData = (row: JobLessonRow) => ({
    lessonId: row.lessonId,
    startsAt: row.startsAt.toISOString(),
  });

  return {
    /** Sinh buổi cho mọi lịch chưa sinh đủ 8 tuần tới. */
    async generate(): Promise<number> {
      return dataSource.transaction((manager) => createLessonsRepository(manager).generate(null));
    },

    async run(): Promise<number> {
      const upcoming = await inBatches(
        notifyBatch(
          (manager, limit) =>
            createLessonsRepository(manager).markUpcomingReminders(
              limit,
              LESSON_LIMITS.upcomingReminderHours,
            ),
          ['tutor', 'clients', 'students'],
          (row, base) => ({ type: 'lesson_upcoming', data: { ...base, ...lessonData(row) } }),
        ),
      );
      const attendance = await inBatches(
        notifyBatch(
          (manager, limit) =>
            createLessonsRepository(manager).markAttendanceReminders(
              limit,
              LESSON_LIMITS.attendanceReminderHours,
            ),
          ['tutor'],
          (row, base) => ({ type: 'attendance_reminder', data: { ...base, ...lessonData(row) } }),
        ),
      );
      const confirm = await inBatches(
        notifyBatch(
          (manager, limit) =>
            createLessonsRepository(manager).markConfirmReminders(
              limit,
              LESSON_LIMITS.confirmReminderHours,
            ),
          ['clients'],
          (row, base) => ({
            type: 'lesson_to_confirm',
            data: {
              ...base,
              ...lessonData(row),
              confirmDueAt: row.confirmDueAt!.toISOString(),
              reminder: true,
            },
          }),
          (row) => ({ enrollmentId: row.enrollmentId }),
        ),
      );
      const confirmed = await inBatches((limit) =>
        dataSource.transaction((manager) =>
          createLessonsRepository(manager).autoConfirmOverdue(limit),
        ),
      );
      const escalated = await inBatches(
        notifyBatch(
          (manager, limit) => createLessonsRepository(manager).escalateOverdue(limit),
          ['tutor', 'clients'],
          (row, base) => ({
            type: 'lesson_dispute',
            data: { ...base, ...lessonData(row), event: 'escalated', counterpartName: null },
          }),
        ),
      );
      return upcoming + attendance + confirm + confirmed + escalated;
    },
  };
}

export type LessonsMaintenance = ReturnType<typeof createLessonsMaintenance>;
