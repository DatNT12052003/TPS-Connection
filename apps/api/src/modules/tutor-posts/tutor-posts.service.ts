// Bài tuyển học sinh của gia sư (G4 đợt 1, §4.1, B.2). Gia sư nào cũng tạo và sửa nháp được; chỉ gia sư đã xác
// minh danh tính, tài khoản đang hoạt động mới đăng hoặc mở lại được (D5). Bài đã đóng là trạng thái cuối, muốn
// đăng lại thì nhân bản thành nháp mới (D33). Bài đang mở là công khai (C8). Không phụ thuộc Express.
import {
  type FieldError,
  type OwnTutorPost,
  type OwnTutorPostList,
  type OwnTutorPostsQuery,
  POST_LIMITS,
  type PublicTutorPost,
  type SaveTutorPostRequest,
  type TeachingMode,
  type TutorPostStatus,
  type UserStatus,
} from '@tps/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AppError, conflict, invalidStateTransition, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import { assertCatalogRefs } from '../catalog/catalog-checks.js';
import { createTutorsRepository } from '../tutors/tutors.repository.js';
import type { TutorPost } from './tutor-post.entity.js';
import {
  createTutorPostsRepository,
  type TutorPostData,
  type TutorPostItems,
} from './tutor-posts.repository.js';

/** Người đang thao tác: id và trạng thái tài khoản (từ `req.auth`). */
export interface PostActor {
  userId: string;
  status: UserStatus;
}

/** Chuyển trạng thái gia sư được làm (B.2). Bài đã đóng không đi đâu được nữa (D33). */
const TRANSITIONS: Record<TutorPostStatus, readonly TutorPostStatus[]> = {
  draft: ['open'],
  open: ['paused', 'full', 'closed'],
  paused: ['open', 'closed'],
  full: ['open', 'closed'],
  closed: [],
};

function teachingModeOf(
  post: Pick<TutorPost, 'teachesOnline' | 'teachesInPerson'>,
): TeachingMode | null {
  if (post.teachesOnline && post.teachesInPerson) return 'hybrid';
  if (post.teachesOnline) return 'online';
  if (post.teachesInPerson) return 'in_person';
  return null;
}

const rateOf = (post: TutorPost) =>
  post.rateAmountVnd !== null && post.rateUnit !== null
    ? { amountVnd: Number(post.rateAmountVnd), unit: post.rateUnit }
    : null;

function contentFields(post: TutorPost, items: TutorPostItems) {
  return {
    title: post.title,
    description: post.description,
    teachingMode: teachingModeOf(post),
    rate: rateOf(post),
    capacity: post.capacity,
    availableFrom: post.availableFrom,
    ...items,
  };
}

function toOwnDto(post: TutorPost, items: TutorPostItems): OwnTutorPost {
  return {
    ...contentFields(post, items),
    id: post.id,
    status: post.status,
    moderationHidden: post.moderationHiddenAt !== null,
    viewCount: post.viewCount,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

function toData(input: SaveTutorPostRequest): TutorPostData {
  const mode: TeachingMode | null = input.teachingMode;
  return {
    title: input.title,
    description: input.description,
    teachesOnline: mode === 'online' || mode === 'hybrid',
    teachesInPerson: mode === 'in_person' || mode === 'hybrid',
    rateAmountVnd: input.rate?.amountVnd ?? null,
    rateUnit: input.rate?.unit ?? null,
    capacity: input.capacity,
    availableFrom: input.availableFrom,
  };
}

const itemsOf = (input: SaveTutorPostRequest): TutorPostItems => ({
  subjects: input.subjects,
  areaIds: input.areaIds,
  slots: input.slots,
});

/**
 * Bài đã đăng (khác nháp) phải đủ để phụ huynh tìm thấy: ít nhất một môn × khối, có hình thức dạy, dạy trực tiếp
 * thì có ít nhất một khu vực. Thiếu thì 422 theo từng ô.
 */
function assertPublishable(content: {
  teachingMode: TeachingMode | null;
  subjects: unknown[];
  areaIds: unknown[];
}): void {
  const errors: FieldError[] = [];
  const required = (path: string, message: string) =>
    errors.push({ path, code: 'required', message });
  if (content.subjects.length === 0) required('subjects', 'At least one subject is required');
  if (content.teachingMode === null) required('teachingMode', 'Teaching mode is required');
  if (content.teachingMode !== null && content.teachingMode !== 'online') {
    if (content.areaIds.length === 0) required('areaIds', 'In-person teaching needs an area');
  }
  if (errors.length > 0) {
    throw new AppError('validation_failed', 'Post is not complete enough to publish', errors);
  }
}

const catalogCheck = (manager: EntityManager, input: SaveTutorPostRequest) =>
  assertCatalogRefs(
    manager,
    { teachingSubjects: input.subjects, serviceAreaIds: input.areaIds },
    { paths: { teachingSubjects: 'subjects', serviceAreaIds: 'areaIds' } },
  );

export function createTutorPostsService(deps: {
  dataSource: DataSource;
  logger: Logger;
  /** URL công khai của tệp ở bucket public (storage.publicUrl). */
  publicFileUrl: (storageKey: string) => string;
}) {
  const { dataSource, logger } = deps;

  async function loadOwn(tutorId: string, postId: string): Promise<OwnTutorPost> {
    const repo = createTutorPostsRepository(dataSource.manager);
    const post = await repo.findOwn(tutorId, postId);
    if (!post) throw notFound('Post');
    return toOwnDto(post, await repo.items(postId));
  }

  /** Chỉ gia sư đã xác minh danh tính, tài khoản đang hoạt động mới đăng hoặc mở lại bài (D5, B.9.3). */
  async function assertCanPublish(manager: EntityManager, actor: PostActor): Promise<void> {
    if (actor.status !== 'active')
      throw new AppError('account_restricted', 'Account is restricted');
    const state = await createTutorPostsRepository(manager).publisherState(actor.userId);
    if (state?.profileStatus !== 'verified' || state.userStatus !== 'active') {
      throw new AppError('tutor_not_verified', 'Identity verification is required to publish');
    }
  }

  async function assertBelowLimit(manager: EntityManager, tutorId: string): Promise<void> {
    const active = await createTutorPostsRepository(manager).countActive(tutorId);
    if (active >= POST_LIMITS.activeTutorPosts) throw conflict('Too many active posts');
  }

  return {
    async listOwn(tutorId: string, query: OwnTutorPostsQuery): Promise<OwnTutorPostList> {
      const repo = createTutorPostsRepository(dataSource.manager);
      const { rows, total } = await repo.listOwn(tutorId, query);
      const items = await repo.itemsOf(rows.map((p) => p.id));
      return {
        items: rows.map((p) => toOwnDto(p, items.get(p.id)!)),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    },

    getOwn: loadOwn,

    /** Tạo bài nháp. Gia sư chưa xác minh cũng tạo được (B.2). */
    async create(tutorId: string, input: SaveTutorPostRequest): Promise<OwnTutorPost> {
      await catalogCheck(dataSource.manager, input);
      const postId = await dataSource.transaction(async (manager) => {
        // Khóa hồ sơ gia sư để hai request tạo bài cùng lúc không vượt giới hạn.
        const tutors = createTutorsRepository(manager);
        await tutors.ensureProfile(tutorId);
        await tutors.findProfile(tutorId, { lock: true });
        await assertBelowLimit(manager, tutorId);
        const repo = createTutorPostsRepository(manager);
        const post = await repo.create({ tutorId, ...toData(input) });
        await repo.replaceItems(post.id, itemsOf(input));
        return post.id;
      });
      logger.info({ userId: tutorId, postId }, 'Tutor post created');
      return loadOwn(tutorId, postId);
    },

    /** Sửa toàn bộ nội dung. Bài đã đóng không sửa được; bài đã đăng phải giữ đủ điều kiện đăng. */
    async update(
      tutorId: string,
      postId: string,
      input: SaveTutorPostRequest,
    ): Promise<OwnTutorPost> {
      await catalogCheck(dataSource.manager, input);
      await dataSource.transaction(async (manager) => {
        const repo = createTutorPostsRepository(manager);
        const post = await repo.findOwn(tutorId, postId, { lock: true });
        if (!post) throw notFound('Post');
        if (post.status === 'closed') throw invalidStateTransition('Closed posts cannot be edited');
        if (post.status !== 'draft') assertPublishable(input);
        await repo.update(postId, toData(input));
        await repo.replaceItems(postId, itemsOf(input));
      });
      return loadOwn(tutorId, postId);
    },

    /** Đổi trạng thái theo B.2. Lần đăng đầu ghi `published_at`. */
    async changeStatus(
      actor: PostActor,
      postId: string,
      target: TutorPostStatus,
    ): Promise<OwnTutorPost> {
      await dataSource.transaction(async (manager) => {
        const repo = createTutorPostsRepository(manager);
        const post = await repo.findOwn(actor.userId, postId, { lock: true });
        if (!post) throw notFound('Post');
        if (!TRANSITIONS[post.status].includes(target)) {
          throw invalidStateTransition(`Cannot change a ${post.status} post to ${target}`);
        }
        if (target === 'open') {
          await assertCanPublish(manager, actor);
          const items = await repo.items(postId);
          assertPublishable({ teachingMode: teachingModeOf(post), ...items });
        }
        await repo.setStatus(postId, target, post.publishedAt ? undefined : new Date());
      });
      logger.info({ userId: actor.userId, postId, status: target }, 'Tutor post status changed');
      return loadOwn(actor.userId, postId);
    },

    /** Nhân bản thành nháp mới (D33), ví dụ để đăng lại bài đã đóng. */
    async duplicate(tutorId: string, postId: string): Promise<OwnTutorPost> {
      const copyId = await dataSource.transaction(async (manager) => {
        await createTutorsRepository(manager).findProfile(tutorId, { lock: true });
        const repo = createTutorPostsRepository(manager);
        const post = await repo.findOwn(tutorId, postId);
        if (!post) throw notFound('Post');
        await assertBelowLimit(manager, tutorId);
        const copy = await repo.create({
          tutorId,
          title: post.title,
          description: post.description,
          teachesOnline: post.teachesOnline,
          teachesInPerson: post.teachesInPerson,
          rateAmountVnd: post.rateAmountVnd,
          rateUnit: post.rateUnit,
          capacity: post.capacity,
          availableFrom: post.availableFrom,
        });
        await repo.replaceItems(copy.id, await repo.items(postId));
        return copy.id;
      });
      return loadOwn(tutorId, copyId);
    },

    /** Xóa mềm (B.2: mọi trạng thái). */
    async remove(tutorId: string, postId: string): Promise<void> {
      const repo = createTutorPostsRepository(dataSource.manager);
      const post = await repo.findOwn(tutorId, postId);
      if (!post) throw notFound('Post');
      await repo.softDelete(postId);
      logger.info({ userId: tutorId, postId }, 'Tutor post deleted');
    },

    /** Bài công khai (khách xem được, C8); không hiển thị được thì 404. Mỗi lần xem tăng lượt xem. */
    async getPublic(postId: string): Promise<PublicTutorPost> {
      const repo = createTutorPostsRepository(dataSource.manager);
      const row = await repo.findPublic(postId);
      if (!row) throw notFound('Post');
      const items = await repo.items(postId);
      await repo.incrementViews(postId);
      const { post } = row;
      return {
        ...contentFields(post, items),
        id: post.id,
        publishedAt: post.publishedAt!.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        tutor: {
          id: post.tutorId,
          displayName: row.displayName,
          avatarUrl: row.avatarStorageKey ? deps.publicFileUrl(row.avatarStorageKey) : null,
          hasVerifiedDegree: row.hasVerifiedDegree,
          ratingAvg: row.ratingAvg === null ? null : Number(row.ratingAvg),
          ratingCount: row.ratingCount,
        },
      };
    },
  };
}

export type TutorPostsService = ReturnType<typeof createTutorPostsService>;
