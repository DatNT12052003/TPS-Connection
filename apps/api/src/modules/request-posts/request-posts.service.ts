// Bài tìm gia sư của phụ huynh (G4 đợt 1, §4.2, B.3). Phụ huynh đăng cho một hồ sơ con mình đang quản lý, một môn
// (D25). Chỉ gia sư đã xác minh và đã đăng nhập xem được (C8); bản cho gia sư không có hồ sơ con, người đăng hay
// thông tin nhận dạng nào của trẻ (§16.7, D16). Không phụ thuộc Express.
//
// Việc chuyển sang G5: ẩn hoặc đóng bài thì hủy các ứng tuyển còn `pending` (D31); xác nhận hợp tác từ bài thì hệ
// thống đóng bài với lý do `found_tutor`.
import {
  type ChangeRequestPostStatusRequest,
  type CreateRequestPostRequest,
  type OwnRequestPost,
  type OwnRequestPostList,
  type OwnRequestPostsQuery,
  POST_LIMITS,
  type RequestPostForTutor,
  type RequestPostStatus,
  type UpdateRequestPostRequest,
  type AvailabilitySlot,
} from '@tps/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AppError, conflict, invalidStateTransition, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import { assertCatalogRefs } from '../catalog/catalog-checks.js';
import { createLearnerAccess } from '../learners/learner-access.js';
import type { PostActor } from '../tutor-posts/tutor-posts.service.js';
import type { RequestPost } from './request-post.entity.js';
import { createRequestPostsRepository, type RequestPostData } from './request-posts.repository.js';

/** Chuyển trạng thái phụ huynh được làm (B.3). `found_tutor` do hệ thống đặt ở G5 (D31). */
const TRANSITIONS: Record<RequestPostStatus, readonly RequestPostStatus[]> = {
  draft: ['open'],
  open: ['hidden', 'closed'],
  hidden: ['open', 'closed'],
  closed: [],
};

function contentFields(post: RequestPost, slots: AvailabilitySlot[]) {
  const hasBudget = post.budgetUnit !== null;
  return {
    subjectId: post.subjectId,
    gradeLevelId: post.gradeLevelId,
    goal: post.goal,
    goalNote: post.goalNote,
    teachingMode: post.teachingMode,
    provinceId: post.provinceId,
    communeId: post.communeId,
    budget: hasBudget
      ? {
          minVnd: post.budgetMinVnd === null ? null : Number(post.budgetMinVnd),
          maxVnd: post.budgetMaxVnd === null ? null : Number(post.budgetMaxVnd),
          unit: post.budgetUnit!,
        }
      : null,
    desiredStartDate: post.desiredStartDate,
    tutorRequirements: post.tutorRequirements,
    description: post.description,
    slots,
  };
}

function toOwnDto(post: RequestPost, slots: AvailabilitySlot[]): OwnRequestPost {
  return {
    ...contentFields(post, slots),
    id: post.id,
    learnerId: post.learnerId,
    status: post.status,
    closedReason: post.closedReason,
    moderationHidden: post.moderationHiddenAt !== null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

function toData(input: UpdateRequestPostRequest): RequestPostData {
  return {
    subjectId: input.subjectId,
    gradeLevelId: input.gradeLevelId,
    goal: input.goal,
    goalNote: input.goalNote,
    teachingMode: input.teachingMode,
    provinceId: input.provinceId,
    communeId: input.communeId,
    budgetMinVnd: input.budget?.minVnd ?? null,
    budgetMaxVnd: input.budget?.maxVnd ?? null,
    budgetUnit: input.budget?.unit ?? null,
    desiredStartDate: input.desiredStartDate,
    tutorRequirements: input.tutorRequirements,
    description: input.description,
  };
}

const catalogCheck = (manager: EntityManager, input: UpdateRequestPostRequest) =>
  assertCatalogRefs(
    manager,
    {
      teachingSubjects: [{ subjectId: input.subjectId, gradeLevelId: input.gradeLevelId }],
      location: { provinceId: input.provinceId, communeId: input.communeId },
    },
    { paths: { teachingSubjects: 'subjectId' } },
  );

/** Hồ sơ con đã có bài chưa đóng cho môn này: 422 ở ô môn học (D25). */
const postExists = () =>
  new AppError('validation_failed', 'An open request for this subject already exists', [
    { path: 'subjectId', code: 'request_post_exists', message: 'Request already exists' },
  ]);

/** Vi phạm unique `request_posts_learner_subject_active_uq` khi hai request cùng lúc vượt qua kiểm tra trước. */
function isDuplicateViolation(error: unknown): boolean {
  const driverError = (error as { driverError?: { code?: string; constraint?: string } })
    .driverError;
  return (
    driverError?.code === '23505' &&
    driverError.constraint === 'request_posts_learner_subject_active_uq'
  );
}

export function createRequestPostsService(deps: { dataSource: DataSource; logger: Logger }) {
  const { dataSource, logger } = deps;

  /**
   * Bài của phụ huynh này, và phụ huynh vẫn đang quản lý hồ sơ con của bài. Không phải: 404 (không lộ bài có tồn
   * tại hay không).
   */
  async function findOwn(
    manager: EntityManager,
    userId: string,
    postId: string,
    options: { lock?: boolean } = {},
  ): Promise<RequestPost> {
    const post = await createRequestPostsRepository(manager).findOwn(userId, postId, options);
    if (!post || !(await createLearnerAccess(manager).isParentOf(userId, post.learnerId))) {
      throw notFound('Post');
    }
    return post;
  }

  async function loadOwn(userId: string, postId: string): Promise<OwnRequestPost> {
    const post = await findOwn(dataSource.manager, userId, postId);
    return toOwnDto(post, await createRequestPostsRepository(dataSource.manager).slots(postId));
  }

  /** Ghi trong transaction; đổi lỗi unique (hai request cùng lúc) thành 422 như kiểm tra trước. */
  async function write<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await dataSource.transaction(work);
    } catch (error) {
      if (isDuplicateViolation(error)) throw postExists();
      throw error;
    }
  }

  return {
    async listOwn(userId: string, query: OwnRequestPostsQuery): Promise<OwnRequestPostList> {
      const repo = createRequestPostsRepository(dataSource.manager);
      const { rows, total } = await repo.listOwn(userId, query);
      const slots = await repo.slotsOf(rows.map((p) => p.id));
      return {
        items: rows.map((p) => toOwnDto(p, slots.get(p.id) ?? [])),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    },

    getOwn: loadOwn,

    /** Tạo bài nháp cho hồ sơ con phụ huynh đang quản lý (không phải: 404). */
    async create(userId: string, input: CreateRequestPostRequest): Promise<OwnRequestPost> {
      await createLearnerAccess(dataSource.manager).assertParentOf(userId, input.learnerId);
      await catalogCheck(dataSource.manager, input);
      const postId = await write(async (manager) => {
        const repo = createRequestPostsRepository(manager);
        if ((await repo.countActive(userId)) >= POST_LIMITS.activeRequestPosts) {
          throw conflict('Too many active requests');
        }
        if (await repo.hasActiveFor(input.learnerId, input.subjectId)) throw postExists();
        const post = await repo.create({
          authorUserId: userId,
          learnerId: input.learnerId,
          ...toData(input),
        });
        await repo.replaceSlots(post.id, input.slots);
        return post.id;
      });
      logger.info({ userId, postId }, 'Request post created');
      return loadOwn(userId, postId);
    },

    /** Sửa toàn bộ nội dung (hồ sơ con giữ nguyên). Bài đã đóng không sửa được. */
    async update(
      userId: string,
      postId: string,
      input: UpdateRequestPostRequest,
    ): Promise<OwnRequestPost> {
      await catalogCheck(dataSource.manager, input);
      await write(async (manager) => {
        const post = await findOwn(manager, userId, postId, { lock: true });
        if (post.status === 'closed') throw invalidStateTransition('Closed posts cannot be edited');
        const repo = createRequestPostsRepository(manager);
        if (
          input.subjectId !== post.subjectId &&
          (await repo.hasActiveFor(post.learnerId, input.subjectId, postId))
        ) {
          throw postExists();
        }
        await repo.update(postId, toData(input));
        await repo.replaceSlots(postId, input.slots);
      });
      return loadOwn(userId, postId);
    },

    /** Đổi trạng thái theo B.3. Đăng hoặc hiện lại cần tài khoản đang hoạt động (B.9.3). */
    async changeStatus(
      actor: PostActor,
      postId: string,
      input: ChangeRequestPostStatusRequest,
    ): Promise<OwnRequestPost> {
      await dataSource.transaction(async (manager) => {
        const post = await findOwn(manager, actor.userId, postId, { lock: true });
        if (!TRANSITIONS[post.status].includes(input.status)) {
          throw invalidStateTransition(`Cannot change a ${post.status} post to ${input.status}`);
        }
        if (input.status === 'open' && actor.status !== 'active') {
          throw new AppError('account_restricted', 'Account is restricted');
        }
        await createRequestPostsRepository(manager).setStatus(postId, input.status, {
          closedReason: input.status === 'closed' ? (input.closedReason ?? null) : null,
          ...(input.status === 'open' && !post.publishedAt ? { publishedAt: new Date() } : {}),
        });
      });
      logger.info(
        { userId: actor.userId, postId, status: input.status },
        'Request post status changed',
      );
      return loadOwn(actor.userId, postId);
    },

    /** Xóa mềm (mọi trạng thái). */
    async remove(userId: string, postId: string): Promise<void> {
      await findOwn(dataSource.manager, userId, postId);
      await createRequestPostsRepository(dataSource.manager).softDelete(postId);
      logger.info({ userId, postId }, 'Request post deleted');
    },

    /**
     * Bài cho gia sư (C8). Gia sư chưa được duyệt danh tính: 403 `tutor_not_verified`. Bài không hiển thị được:
     * 404. Không có hồ sơ con hay người đăng.
     */
    async getForTutor(tutorUserId: string, postId: string): Promise<RequestPostForTutor> {
      const repo = createRequestPostsRepository(dataSource.manager);
      if (!(await repo.isVerifiedTutor(tutorUserId))) {
        throw new AppError('tutor_not_verified', 'Identity verification is required');
      }
      const post = await repo.findVisibleToTutors(postId);
      if (!post) throw notFound('Post');
      return {
        ...contentFields(post, await repo.slots(postId)),
        id: post.id,
        publishedAt: post.publishedAt!.toISOString(),
      };
    },
  };
}

export type RequestPostsService = ReturnType<typeof createRequestPostsService>;
