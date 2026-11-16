import type {
  AvailabilitySlot,
  RequestPostClosedReason,
  RequestPostSearchQuery,
  RequestPostStatus,
} from '@tps/shared';
import { type EntityManager, In, IsNull, Not } from 'typeorm';
import { RequestPost, RequestPostSlot } from './request-post.entity.js';

/** Các cột nội dung phụ huynh được ghi. */
export type RequestPostData = Pick<
  RequestPost,
  | 'subjectId'
  | 'gradeLevelId'
  | 'goal'
  | 'goalNote'
  | 'teachingMode'
  | 'provinceId'
  | 'communeId'
  | 'budgetMinVnd'
  | 'budgetMaxVnd'
  | 'budgetUnit'
  | 'desiredStartDate'
  | 'tutorRequirements'
  | 'description'
>;

/** "19:30:00" -> "19:30". */
const hhmm = (time: string) => time.slice(0, 5);

/** Truy cập bài tìm gia sư và lịch mong muốn. Không kiểm tra quyền (service làm). */
export function createRequestPostsRepository(manager: EntityManager) {
  const posts = manager.getRepository(RequestPost);
  const slots = manager.getRepository(RequestPostSlot);

  async function slotsOf(postIds: string[]): Promise<Map<string, AvailabilitySlot[]>> {
    const result = new Map<string, AvailabilitySlot[]>(postIds.map((id) => [id, []]));
    if (postIds.length === 0) return result;
    const rows = await slots.find({
      where: { postId: In(postIds) },
      order: { weekday: 'ASC', startTime: 'ASC' },
    });
    for (const s of rows) {
      result.get(s.postId)?.push({
        weekday: s.weekday,
        startTime: hhmm(s.startTime),
        endTime: hhmm(s.endTime),
      });
    }
    return result;
  }

  /**
   * Bài gia sư đã xác minh được xem (C8): đang mở, chưa bị ẩn, chưa xóa; hồ sơ con chưa xóa; tài khoản người
   * đăng đang hoạt động, chưa xóa.
   */
  const visibleToTutors = () =>
    posts
      .createQueryBuilder('p')
      .innerJoin('learners', 'l', 'l.id = p.learner_id')
      .innerJoin('users', 'u', 'u.id = p.author_user_id')
      .where(`p.status = 'open'`)
      .andWhere('p.deletedAt IS NULL')
      .andWhere('p.moderationHiddenAt IS NULL')
      .andWhere('l.deleted_at IS NULL')
      .andWhere(`u.status = 'active'`)
      .andWhere('u.deleted_at IS NULL');

  return {
    slotsOf,

    async slots(postId: string): Promise<AvailabilitySlot[]> {
      return (await slotsOf([postId])).get(postId) ?? [];
    },

    /** Thay toàn bộ lịch mong muốn (gọi trong transaction). */
    async replaceSlots(postId: string, items: AvailabilitySlot[]): Promise<void> {
      await slots.delete({ postId });
      if (items.length > 0) await slots.insert(items.map((s) => ({ postId, ...s })));
    },

    /** Số bài chưa đóng, chưa xóa của phụ huynh. Index: `request_posts_author_idx`. */
    countActive(authorUserId: string): Promise<number> {
      return posts.countBy({ authorUserId, status: Not('closed'), deletedAt: IsNull() });
    },

    /**
     * Hồ sơ con đã có bài chưa đóng cho môn này chưa (D25)? Bỏ qua bài `exceptId` khi sửa.
     * Index: `request_posts_learner_subject_active_uq`.
     */
    async hasActiveFor(learnerId: string, subjectId: number, exceptId?: string): Promise<boolean> {
      const query = posts
        .createQueryBuilder('p')
        .where('p.learnerId = :learnerId', { learnerId })
        .andWhere('p.subjectId = :subjectId', { subjectId })
        .andWhere(`p.status <> 'closed'`)
        .andWhere('p.deletedAt IS NULL');
      if (exceptId) query.andWhere('p.id <> :exceptId', { exceptId });
      return query.getExists();
    },

    create(
      data: RequestPostData & { authorUserId: string; learnerId: string },
    ): Promise<RequestPost> {
      return posts.save(posts.create({ ...data, status: 'draft' }));
    },

    /** Bài chưa xóa của đúng phụ huynh này. */
    findOwn(authorUserId: string, id: string, options: { lock?: boolean } = {}) {
      const query = posts
        .createQueryBuilder('p')
        .where('p.id = :id', { id })
        .andWhere('p.authorUserId = :authorUserId', { authorUserId })
        .andWhere('p.deletedAt IS NULL');
      if (options.lock) query.setLock('pessimistic_write');
      return query.getOne();
    },

    async update(id: string, data: RequestPostData): Promise<void> {
      await posts.update({ id }, data);
    },

    async setStatus(
      id: string,
      status: RequestPostStatus,
      changes: { closedReason?: RequestPostClosedReason | null; publishedAt?: Date } = {},
    ): Promise<void> {
      await posts.update(
        { id },
        { status, closedReason: changes.closedReason ?? null, ...changes },
      );
    },

    /** Hệ thống đóng bài khi xác nhận hợp tác từ một ứng tuyển của bài (D31). Bài đã đóng, đã xóa: bỏ qua. */
    async closeFoundTutor(id: string): Promise<void> {
      await manager.query(
        `UPDATE request_posts SET status = 'closed', closed_reason = 'found_tutor', updated_at = now()
          WHERE id = $1 AND status <> 'closed' AND deleted_at IS NULL`,
        [id],
      );
    },

    async softDelete(id: string): Promise<void> {
      await posts.update({ id }, { deletedAt: new Date() });
    },

    /** Xóa mềm mọi bài của một hồ sơ con (khi phụ huynh xóa hồ sơ con). Index: `request_posts_learner_idx`. */
    async softDeleteForLearner(learnerId: string): Promise<void> {
      await posts.update({ learnerId, deletedAt: IsNull() }, { deletedAt: new Date() });
    },

    /** Bài của phụ huynh, mới nhất trước. Index: `request_posts_author_idx`. */
    async listOwn(
      authorUserId: string,
      filter: {
        status?: RequestPostStatus | undefined;
        learnerId?: string | undefined;
        page: number;
        pageSize: number;
      },
    ): Promise<{ rows: RequestPost[]; total: number }> {
      const [rows, total] = await posts.findAndCount({
        where: {
          authorUserId,
          deletedAt: IsNull(),
          ...(filter.status ? { status: filter.status } : {}),
          ...(filter.learnerId ? { learnerId: filter.learnerId } : {}),
        },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      });
      return { rows, total };
    },

    /** Một bài gia sư đã xác minh được xem. */
    findVisibleToTutors(id: string): Promise<RequestPost | null> {
      return visibleToTutors().andWhere('p.id = :id', { id }).getOne();
    },

    /**
     * Tìm nhu cầu cho gia sư đã xác minh (G4 đợt 2). Chỉ môn, khối đang bật. Index: `request_posts_search_idx`.
     * `tutorId` dùng cho `matchProfile`: chỉ nhu cầu có môn × khối nằm trong hồ sơ của gia sư đó.
     */
    async search(
      tutorId: string,
      filter: RequestPostSearchQuery,
    ): Promise<{ rows: RequestPost[]; total: number }> {
      const query = visibleToTutors()
        .innerJoin('subjects', 's', 's.id = p.subject_id AND s.is_active')
        .innerJoin('grade_levels', 'g', 'g.id = p.grade_level_id AND g.is_active');
      if (filter.subjectId !== undefined) {
        query.andWhere('p.subjectId = :subjectId', { subjectId: filter.subjectId });
      }
      if (filter.gradeLevelId !== undefined) {
        query.andWhere('p.gradeLevelId = :gradeLevelId', { gradeLevelId: filter.gradeLevelId });
      }
      if (filter.goal !== undefined) query.andWhere('p.goal = :goal', { goal: filter.goal });
      if (filter.mode === 'online') query.andWhere(`p.teachingMode IN ('online', 'hybrid')`);
      if (filter.mode === 'in_person') query.andWhere(`p.teachingMode IN ('in_person', 'hybrid')`);
      if (filter.communeId !== undefined) {
        // Đúng xã, hoặc nhu cầu ở tỉnh chứa xã mà chưa ghi xã.
        query.andWhere(
          `(p.communeId = :communeId OR (p.communeId IS NULL AND p.provinceId =
             (SELECT parent_id FROM administrative_areas WHERE id = :communeId)))`,
          { communeId: filter.communeId },
        );
      } else if (filter.provinceId !== undefined) {
        query.andWhere('p.provinceId = :provinceId', { provinceId: filter.provinceId });
      }
      if (filter.budgetUnit !== undefined) {
        query.andWhere('p.budgetUnit = :budgetUnit', { budgetUnit: filter.budgetUnit });
      }
      if (filter.minBudget !== undefined) {
        query.andWhere('coalesce(p.budgetMaxVnd, p.budgetMinVnd) >= :minBudget', {
          minBudget: filter.minBudget,
        });
      }
      if (filter.matchProfile) {
        query.andWhere(
          `EXISTS (SELECT 1 FROM tutor_teaching_subjects t
                    WHERE t.tutor_id = :tutorId AND t.subject_id = p.subject_id
                      AND t.grade_level_id = p.grade_level_id)`,
          { tutorId },
        );
      }

      const total = await query.getCount();
      if (total === 0) return { rows: [], total };
      if (filter.sort === 'budget_desc') {
        query.orderBy('coalesce(p.budget_max_vnd, p.budget_min_vnd)', 'DESC', 'NULLS LAST');
      }
      const rows = await query
        .addOrderBy('p.publishedAt', 'DESC')
        .addOrderBy('p.id', 'DESC')
        .offset((filter.page - 1) * filter.pageSize)
        .limit(filter.pageSize)
        .getMany();
      return { rows, total };
    },

    /** Gia sư đã được duyệt danh tính chưa (chỉ gia sư đã xác minh mới xem được bài tìm gia sư, C8). */
    async isVerifiedTutor(userId: string): Promise<boolean> {
      const rows = await manager.query<unknown[]>(
        `SELECT 1 FROM tutor_profiles WHERE user_id = $1 AND profile_status = 'verified'`,
        [userId],
      );
      return rows.length > 0;
    },
  };
}

export type RequestPostsRepository = ReturnType<typeof createRequestPostsRepository>;
