// Phân quyền theo quan hệ với người học (docs/thiet_ke_co_so_du_lieu.md mục 12). Mỗi hàm là một truy vấn
// có index hỗ trợ. Mọi endpoint đọc/sửa dữ liệu của một người học PHẢI đi qua đây, không tin id do client
// gửi lên. `teachesStudent`: gia sư dạy hoặc đã dạy người học qua một lớp (G6; thiết kế gọi là `teachesLearner`).
//
// Không có quyền thì trả 404, không phải 403: người ngoài không biết được hồ sơ có tồn tại hay không.
import type { EntityManager } from 'typeorm';
import { notFound } from '../../lib/app-error.js';

/** Quan hệ của người xem với hồ sơ: phụ huynh quản lý, hoặc chính học sinh (chỉ xem, D4). */
export type LearnerViewer = 'guardian' | 'student';

export function createLearnerAccess(manager: EntityManager) {
  const exists = async (sql: string, params: unknown[]) =>
    (await manager.query<unknown[]>(sql, params)).length > 0;

  /**
   * U có phải người quản lý của người học L (phụ huynh đang quản lý, hoặc người học tự quản lý, D3)?
   * Dùng view `learner_managers`; hồ sơ đã xóa không còn ai quản lý qua API.
   * Index: `learner_guardians_one_active_uq` (learner_id), PK `learners`.
   */
  async function isParentOf(userId: string, learnerId: string): Promise<boolean> {
    return exists(
      `SELECT 1
         FROM learner_managers m
         JOIN learners l ON l.id = m.learner_id
        WHERE m.learner_id = $1 AND m.manager_user_id = $2 AND l.deleted_at IS NULL
        LIMIT 1`,
      [learnerId, userId],
    );
  }

  /** U có phải chính người học L (tài khoản học sinh gắn với hồ sơ)? Index: `learners_account_user_uq`. */
  async function isStudentSelf(userId: string, learnerId: string): Promise<boolean> {
    return exists(
      `SELECT 1 FROM learners WHERE id = $1 AND account_user_id = $2 AND deleted_at IS NULL`,
      [learnerId, userId],
    );
  }

  /**
   * Gia sư T dạy hoặc đã dạy người học L qua một lớp của chính T (kể cả lớp đã kết thúc, để tra cứu lịch sử). Gia sư
   * mới của học sinh không thấy dữ liệu do gia sư cũ ghi (D28): mọi dữ liệu lớp lọc theo `tutor_id` của lớp.
   * Index: `class_enrollments_learner_idx`, PK `tutoring_classes`.
   */
  async function teachesStudent(tutorId: string, learnerId: string): Promise<boolean> {
    return exists(
      `SELECT 1
         FROM class_enrollments e
         JOIN tutoring_classes c ON c.id = e.class_id
        WHERE e.learner_id = $1 AND c.tutor_id = $2
        LIMIT 1`,
      [learnerId, tutorId],
    );
  }

  return {
    isParentOf,
    isStudentSelf,
    teachesStudent,

    /** Quan hệ của U với L, hoặc null nếu U không được xem hồ sơ. */
    async viewerOf(userId: string, learnerId: string): Promise<LearnerViewer | null> {
      if (await isParentOf(userId, learnerId)) return 'guardian';
      if (await isStudentSelf(userId, learnerId)) return 'student';
      return null;
    },

    /** Chỉ phụ huynh quản lý được sửa, xóa, mời. Không phải: 404. */
    async assertParentOf(userId: string, learnerId: string): Promise<void> {
      if (!(await isParentOf(userId, learnerId))) throw notFound('Learner');
    },

    /** Phụ huynh quản lý hoặc chính học sinh được xem. Không phải: 404. */
    async assertCanView(userId: string, learnerId: string): Promise<LearnerViewer> {
      const viewer = await this.viewerOf(userId, learnerId);
      if (!viewer) throw notFound('Learner');
      return viewer;
    },
  };
}

export type LearnerAccess = ReturnType<typeof createLearnerAccess>;
