import type {
  AvailabilitySlot,
  TeachingSubject,
  TutorPostSearchQuery,
  TutorPostStatus,
  TutorProfileStatus,
  UserStatus,
} from '@tps/shared';
import { type EntityManager, In, IsNull, Not } from 'typeorm';
import { TutorPost, TutorPostArea, TutorPostSlot, TutorPostSubject } from './tutor-post.entity.js';

/** Các cột nội dung gia sư được ghi. */
export type TutorPostData = Pick<
  TutorPost,
  | 'title'
  | 'description'
  | 'teachesOnline'
  | 'teachesInPerson'
  | 'rateAmountVnd'
  | 'rateUnit'
  | 'capacity'
  | 'availableFrom'
>;

export interface TutorPostItems {
  subjects: TeachingSubject[];
  areaIds: number[];
  slots: AvailabilitySlot[];
}

/** Bài công khai kèm thông tin hiển thị của gia sư (không email, số điện thoại, họ tên thật). */
export interface PublicTutorPostRow {
  post: TutorPost;
  displayName: string;
  avatarStorageKey: string | null;
  /** Mã công khai của gia sư, cho slug hồ sơ. */
  tutorPublicCode: string;
  hasVerifiedDegree: boolean;
  ratingAvg: string | null;
  ratingCount: number;
}

const EMPTY_ITEMS = (): TutorPostItems => ({ subjects: [], areaIds: [], slots: [] });

/** "19:30:00" -> "19:30". */
const hhmm = (time: string) => time.slice(0, 5);

/** Truy cập bài tuyển học sinh và các bảng con. Không kiểm tra quyền (service làm). */
export function createTutorPostsRepository(manager: EntityManager) {
  const posts = manager.getRepository(TutorPost);
  const subjects = manager.getRepository(TutorPostSubject);
  const areas = manager.getRepository(TutorPostArea);
  const slots = manager.getRepository(TutorPostSlot);

  /**
   * Bảng con của nhiều bài trong ba truy vấn (tránh N+1 khi liệt kê). Chạy lần lượt, không Promise.all: trong
   * transaction cả ba dùng chung một kết nối, và pg không cho chạy song song trên một kết nối.
   */
  async function itemsOf(postIds: string[]): Promise<Map<string, TutorPostItems>> {
    const result = new Map(postIds.map((id) => [id, EMPTY_ITEMS()]));
    if (postIds.length === 0) return result;
    const subjectRows = await subjects.find({
      where: { postId: In(postIds) },
      order: { subjectId: 'ASC', gradeLevelId: 'ASC' },
    });
    const areaRows = await areas.find({
      where: { postId: In(postIds) },
      order: { areaId: 'ASC' },
    });
    const slotRows = await slots.find({
      where: { postId: In(postIds) },
      order: { weekday: 'ASC', startTime: 'ASC' },
    });
    for (const s of subjectRows) {
      result.get(s.postId)?.subjects.push({ subjectId: s.subjectId, gradeLevelId: s.gradeLevelId });
    }
    for (const a of areaRows) result.get(a.postId)?.areaIds.push(a.areaId);
    for (const s of slotRows) {
      result.get(s.postId)?.slots.push({
        weekday: s.weekday,
        startTime: hhmm(s.startTime),
        endTime: hhmm(s.endTime),
      });
    }
    return result;
  }

  /**
   * Bài hiển thị công khai (B.2, C8): đang mở, chưa bị ẩn, chưa xóa; gia sư đã xác minh, tài khoản đang hoạt
   * động, chưa xóa. Chỉ đọc tên hiển thị và ảnh đại diện từ `users`, không đọc email, số điện thoại, họ tên thật.
   */
  const publicPosts = () =>
    posts
      .createQueryBuilder('p')
      .innerJoin('tutor_profiles', 'tp', 'tp.user_id = p.tutor_id')
      .innerJoin('users', 'u', 'u.id = p.tutor_id')
      .leftJoin('files', 'f', `f.id = u.avatar_file_id AND f.status = 'ready'`)
      .addSelect('u.display_name', 'display_name')
      .addSelect('f.storage_key', 'avatar_storage_key')
      .addSelect('tp.public_code', 'tutor_public_code')
      .addSelect('tp.has_verified_degree', 'has_verified_degree')
      .addSelect('tp.rating_avg', 'rating_avg')
      .addSelect('tp.rating_count', 'rating_count')
      .where(`p.status = 'open'`)
      .andWhere('p.deletedAt IS NULL')
      .andWhere('p.moderationHiddenAt IS NULL')
      .andWhere(`tp.profile_status = 'verified'`)
      .andWhere(`u.status = 'active'`)
      .andWhere('u.deleted_at IS NULL');

  /** Ghép entity với cột hiển thị của gia sư (mỗi bài một dòng: các join đều 1-1). */
  async function toPublicRows(
    query: ReturnType<typeof publicPosts>,
  ): Promise<PublicTutorPostRow[]> {
    const { entities, raw } = await query.getRawAndEntities<{
      p_id: string;
      display_name: string;
      avatar_storage_key: string | null;
      tutor_public_code: string;
      has_verified_degree: boolean;
      rating_avg: string | null;
      rating_count: number;
    }>();
    const rawById = new Map(raw.map((r) => [r.p_id, r]));
    return entities.flatMap((post) => {
      const r = rawById.get(post.id);
      if (!r) return [];
      return [
        {
          post,
          displayName: r.display_name,
          avatarStorageKey: r.avatar_storage_key,
          tutorPublicCode: r.tutor_public_code,
          hasVerifiedDegree: r.has_verified_degree,
          ratingAvg: r.rating_avg,
          ratingCount: r.rating_count,
        },
      ];
    });
  }

  return {
    itemsOf,

    async items(postId: string): Promise<TutorPostItems> {
      return (await itemsOf([postId])).get(postId) ?? EMPTY_ITEMS();
    },

    /** Thay toàn bộ môn – khối, khu vực, lịch của bài (gọi trong transaction). */
    async replaceItems(postId: string, items: TutorPostItems): Promise<void> {
      await subjects.delete({ postId });
      await areas.delete({ postId });
      await slots.delete({ postId });
      if (items.subjects.length > 0) {
        await subjects.insert(items.subjects.map((s) => ({ postId, ...s })));
      }
      if (items.areaIds.length > 0) {
        await areas.insert(items.areaIds.map((areaId) => ({ postId, areaId })));
      }
      if (items.slots.length > 0) {
        await slots.insert(items.slots.map((s) => ({ postId, ...s })));
      }
    },

    /** Số bài chưa đóng, chưa xóa của gia sư. Index: `tutor_posts_tutor_idx`. */
    countActive(tutorId: string): Promise<number> {
      return posts.countBy({ tutorId, status: Not('closed'), deletedAt: IsNull() });
    },

    create(data: TutorPostData & { tutorId: string }): Promise<TutorPost> {
      return posts.save(posts.create({ ...data, status: 'draft' }));
    },

    /** Bài chưa xóa của đúng gia sư này (không tìm theo id trần: tránh sửa bài của người khác). */
    findOwn(tutorId: string, id: string, options: { lock?: boolean } = {}) {
      const query = posts
        .createQueryBuilder('p')
        .where('p.id = :id', { id })
        .andWhere('p.tutorId = :tutorId', { tutorId })
        .andWhere('p.deletedAt IS NULL');
      if (options.lock) query.setLock('pessimistic_write');
      return query.getOne();
    },

    async update(id: string, data: Partial<TutorPostData>): Promise<void> {
      await posts.update({ id }, data);
    },

    async setStatus(id: string, status: TutorPostStatus, publishedAt?: Date): Promise<void> {
      await posts.update({ id }, publishedAt ? { status, publishedAt } : { status });
    },

    async softDelete(id: string): Promise<void> {
      await posts.update({ id }, { deletedAt: new Date() });
    },

    /** Bài của gia sư, mới nhất trước. Index: `tutor_posts_tutor_idx`. */
    async listOwn(
      tutorId: string,
      filter: { status?: TutorPostStatus | undefined; page: number; pageSize: number },
    ): Promise<{ rows: TutorPost[]; total: number }> {
      const [rows, total] = await posts.findAndCount({
        where: {
          tutorId,
          deletedAt: IsNull(),
          ...(filter.status ? { status: filter.status } : {}),
        },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      });
      return { rows, total };
    },

    /** Trạng thái hồ sơ và tài khoản của gia sư, để quyết định có được đăng bài không (D5). */
    async publisherState(
      tutorId: string,
    ): Promise<{ profileStatus: TutorProfileStatus; userStatus: UserStatus } | null> {
      const [row] = await manager.query<
        { profile_status: TutorProfileStatus; user_status: UserStatus }[]
      >(
        `SELECT p.profile_status, u.status AS user_status
           FROM tutor_profiles p JOIN users u ON u.id = p.user_id
          WHERE p.user_id = $1 AND u.deleted_at IS NULL`,
        [tutorId],
      );
      return row ? { profileStatus: row.profile_status, userStatus: row.user_status } : null;
    },

    /** Bài công khai theo id hoặc mã công khai (slug). */
    async findPublic(ref: { id: string } | { code: string }): Promise<PublicTutorPostRow | null> {
      const query = publicPosts();
      if ('id' in ref) query.andWhere('p.id = :id', { id: ref.id });
      else query.andWhere('p.publicCode = :code', { code: ref.code });
      return (await toPublicRows(query))[0] ?? null;
    },

    /**
     * Tìm bài công khai (G4 đợt 2). Index: `tutor_posts_public_idx` (mới nhất), `tutor_posts_search_idx` (từ khóa),
     * `tutor_post_subjects_search_idx`, `tutor_post_areas_area_idx`.
     */
    async search(
      filter: TutorPostSearchQuery,
    ): Promise<{ rows: PublicTutorPostRow[]; total: number }> {
      const query = publicPosts();
      if (filter.subjectId !== undefined || filter.gradeLevelId !== undefined) {
        const conds = ['ps.post_id = p.id'];
        if (filter.subjectId !== undefined) conds.push('ps.subject_id = :subjectId');
        if (filter.gradeLevelId !== undefined) conds.push('ps.grade_level_id = :gradeLevelId');
        query.andWhere(
          `EXISTS (SELECT 1 FROM tutor_post_subjects ps
                     JOIN subjects s ON s.id = ps.subject_id AND s.is_active
                     JOIN grade_levels g ON g.id = ps.grade_level_id AND g.is_active
                    WHERE ${conds.join(' AND ')})`,
          { subjectId: filter.subjectId, gradeLevelId: filter.gradeLevelId },
        );
      }
      if (filter.mode === 'online') query.andWhere('p.teachesOnline');
      if (filter.mode === 'in_person') query.andWhere('p.teachesInPerson');
      // Khu vực chỉ có nghĩa với dạy trực tiếp; khu vực của bài là tỉnh hoặc xã.
      if (filter.communeId !== undefined) {
        query.andWhere(
          `p.teachesInPerson AND EXISTS (SELECT 1 FROM tutor_post_areas pa
             WHERE pa.post_id = p.id
               AND (pa.area_id = :communeId
                    OR pa.area_id = (SELECT parent_id FROM administrative_areas WHERE id = :communeId)))`,
          { communeId: filter.communeId },
        );
      } else if (filter.provinceId !== undefined) {
        query.andWhere(
          `p.teachesInPerson AND EXISTS (SELECT 1 FROM tutor_post_areas pa
             JOIN administrative_areas a ON a.id = pa.area_id
            WHERE pa.post_id = p.id AND (a.id = :provinceId OR a.parent_id = :provinceId))`,
          { provinceId: filter.provinceId },
        );
      }
      if (filter.tutorId !== undefined)
        query.andWhere('p.tutorId = :tutorId', { tutorId: filter.tutorId });
      const tsQuery = `websearch_to_tsquery('simple', immutable_unaccent(lower(:q)))`;
      if (filter.q !== undefined) {
        query.andWhere(`p.search_vector @@ ${tsQuery}`, { q: filter.q });
      }

      const total = await query.getCount();
      if (total === 0) return { rows: [], total };

      if (filter.sort === 'relevance' && filter.q !== undefined) {
        query
          .addSelect(`ts_rank(p.search_vector, ${tsQuery})`, 'match_rank')
          .orderBy('match_rank', 'DESC');
      } else if (filter.sort === 'rate_asc') {
        query.orderBy('p.rateAmountVnd', 'ASC', 'NULLS LAST');
      } else if (filter.sort === 'rate_desc') {
        query.orderBy('p.rateAmountVnd', 'DESC', 'NULLS LAST');
      }
      query
        .addOrderBy('p.publishedAt', 'DESC')
        .addOrderBy('p.id', 'DESC')
        .offset((filter.page - 1) * filter.pageSize)
        .limit(filter.pageSize);
      return { rows: await toPublicRows(query), total };
    },

    /** Tăng lượt xem (không đổi `updated_at`: lượt xem không phải là sửa bài). */
    async incrementViews(id: string): Promise<void> {
      await manager.query(`UPDATE tutor_posts SET view_count = view_count + 1 WHERE id = $1`, [id]);
    },
  };
}

export type TutorPostsRepository = ReturnType<typeof createTutorPostsRepository>;
