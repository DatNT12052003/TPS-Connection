// Người nhận và nội dung thông báo của một lớp (G6), dùng chung cho service lớp, buổi học và job. Dữ liệu thông báo
// chỉ có id lớp / buổi, môn, thời điểm và tên hiển thị của bên kia: không có tên học sinh, nội dung buổi học, điểm
// hay nhận xét (§12).
import type { NotificationContent } from '@tps/shared';
import type { EntityManager } from 'typeorm';
import type { Notifier, PendingNotification } from '../notifications/notifications.service.js';

export interface ClassAudience {
  classId: string;
  subjectId: number;
  tutorId: string;
  tutorName: string;
  /** Phụ huynh đang quản lý học sinh của lớp (hồ sơ chưa xóa). */
  clients: { userId: string; displayName: string }[];
  /** Tài khoản học sinh của lớp (chỉ xem; không phải người học tự quản lý). */
  students: string[];
}

/** Người nhận theo vai trò trong lớp. `enrollmentId`: chỉ phụ huynh, học sinh của một ghi danh. */
export async function classAudience(
  manager: EntityManager,
  classId: string,
  options: { enrollmentId?: string } = {},
): Promise<ClassAudience | null> {
  const [row] = await manager.query<
    {
      id: string;
      subject_id: number;
      tutor_id: string;
      tutor_name: string;
      clients: { userId: string; displayName: string }[];
      students: string[];
    }[]
  >(
    `SELECT c.id, c.subject_id, c.tutor_id, tu.display_name AS tutor_name,
            COALESCE(
              jsonb_agg(DISTINCT jsonb_build_object('userId', m.manager_user_id, 'displayName', mu.display_name))
                FILTER (WHERE m.manager_user_id IS NOT NULL AND m.manager_user_id <> c.tutor_id),
              '[]'::jsonb
            ) AS clients,
            COALESCE(
              array_agg(DISTINCT l.account_user_id)
                FILTER (WHERE l.account_user_id IS NOT NULL AND NOT l.is_self_managed),
              '{}'
            ) AS students
       FROM tutoring_classes c
       JOIN users tu ON tu.id = c.tutor_id
       LEFT JOIN class_enrollments e
              ON e.class_id = c.id AND ($2::uuid IS NULL OR e.id = $2::uuid)
       LEFT JOIN learners l ON l.id = e.learner_id AND l.deleted_at IS NULL
       LEFT JOIN learner_managers m ON m.learner_id = l.id
       LEFT JOIN users mu ON mu.id = m.manager_user_id
      WHERE c.id = $1
      GROUP BY c.id, tu.display_name`,
    [classId, options.enrollmentId ?? null],
  );
  if (!row) return null;
  return {
    classId: row.id,
    subjectId: row.subject_id,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name,
    clients: row.clients,
    students: row.students,
  };
}

export type ClassRecipient = 'tutor' | 'clients' | 'students';

/**
 * Một thông báo cho mỗi người nhận thuộc `to`. `build(counterpartName)` dựng nội dung; tên bên kia: gia sư nhận tên
 * phụ huynh (`clientName`, mặc định phụ huynh đầu tiên), phụ huynh và học sinh nhận tên gia sư. `except`: bỏ người
 * vừa làm thao tác.
 */
export function classNotices(
  audience: ClassAudience,
  to: readonly ClassRecipient[],
  build: (counterpartName: string | null) => NotificationContent,
  options: { except?: string; clientName?: string | null } = {},
): { userId: string; content: NotificationContent }[] {
  const items: { userId: string; content: NotificationContent }[] = [];
  const clientName =
    options.clientName !== undefined
      ? options.clientName
      : (audience.clients[0]?.displayName ?? null);
  if (to.includes('tutor')) {
    items.push({ userId: audience.tutorId, content: build(clientName) });
  }
  if (to.includes('clients')) {
    for (const client of audience.clients) {
      items.push({ userId: client.userId, content: build(audience.tutorName) });
    }
  }
  if (to.includes('students')) {
    for (const userId of audience.students) {
      items.push({ userId, content: build(audience.tutorName) });
    }
  }
  const seen = new Set<string>();
  return items.filter((item) => {
    if (item.userId === options.except || seen.has(item.userId)) return false;
    seen.add(item.userId);
    return true;
  });
}

/**
 * Ghi thông báo cho người nhận của lớp trong transaction `manager` (đẩy sau commit bằng `notifier.dispatch`).
 * `actorName`: tên bên kia gửi cho gia sư (phụ huynh vừa làm thao tác; null: hệ thống / người kiểm duyệt).
 */
export async function recordClassNotices(
  manager: EntityManager,
  notifier: Notifier,
  classId: string,
  to: readonly ClassRecipient[],
  build: (base: {
    classId: string;
    subjectId: number;
    counterpartName: string | null;
  }) => NotificationContent,
  options: { except?: string; enrollmentId?: string; actorName?: string | null } = {},
): Promise<PendingNotification[]> {
  const audience = await classAudience(
    manager,
    classId,
    options.enrollmentId ? { enrollmentId: options.enrollmentId } : {},
  );
  if (!audience) return [];
  const items = classNotices(
    audience,
    to,
    (counterpartName) =>
      build({ classId: audience.classId, subjectId: audience.subjectId, counterpartName }),
    {
      ...(options.except ? { except: options.except } : {}),
      ...(options.actorName !== undefined ? { clientName: options.actorName } : {}),
    },
  );
  return notifier.record(manager, items);
}

/** Tên hiển thị của một người (phụ huynh vừa làm thao tác) để gia sư thấy ai làm. */
export async function displayNameOf(
  manager: EntityManager,
  userId: string,
): Promise<string | null> {
  const [row] = await manager.query<{ display_name: string }[]>(
    `SELECT display_name FROM users WHERE id = $1`,
    [userId],
  );
  return row?.display_name ?? null;
}
