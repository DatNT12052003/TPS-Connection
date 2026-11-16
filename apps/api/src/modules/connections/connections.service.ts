// Yêu cầu kết nối (G5 đợt 1, §5, B.1). Hai chiều: phụ huynh gửi gia sư (§5.1) hoặc gia sư ứng tuyển vào bài tìm gia
// sư (§5.2). pending → negotiating khi bên nhận chấp nhận (D15) → confirmed khi cả hai xác nhận cùng phiên bản điều
// khoản mới nhất (C3); nhánh rejected, cancelled. Mọi chuyển trạng thái khóa dòng yêu cầu trong transaction và ghi
// `connection_events`. Không phụ thuộc Express.
//
// Chấp nhận thì mở hội thoại trong cùng transaction (D14, đợt 2); hủy thì hội thoại chỉ còn xem (D32, suy ra từ
// trạng thái yêu cầu ở module messaging). Thông báo (đợt 3) ghi trong cùng transaction: yêu cầu mới (bên nhận), được
// chấp nhận / bị từ chối (bên gửi), xác nhận hợp tác (bên còn lại); đẩy đi sau commit. Hủy và hết hạn không thông báo
// (nhắc trước hạn do job). Chưa làm: tạo lớp khi xác nhận hợp tác (G6).
import {
  CONNECTION_LIMITS,
  type ConnectionEvent,
  type ConnectionParty,
  type ConnectionRequestDetail,
  type ConnectionRequestList,
  type ConnectionRequestListQuery,
  type ConnectionRequestSummary,
  type ConnectionTerms,
  type CreateConnectionRequest,
  type ProposeTermsRequest,
  type ConversationOpenedEvent,
  publicSlug,
  REALTIME_EVENTS,
  type Role,
  type SendToTutorRequest,
  type ApplyToRequestPostRequest,
  type UserStatus,
} from '@tps/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AppError, forbidden, invalidStateTransition, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import { assertCatalogRefs } from '../catalog/catalog-checks.js';
import { noopRealtime, type RealtimePublisher } from '../../realtime/realtime.js';
import { createLearnerAccess } from '../learners/learner-access.js';
import { createMessagingRepository } from '../messaging/messaging.repository.js';
import {
  noopNotifier,
  type Notifier,
  type PendingNotification,
} from '../notifications/notifications.service.js';
import { connectionNotice } from './connection-notifications.js';
import { createRequestPostsRepository } from '../request-posts/request-posts.repository.js';
import type { ConnectionRequest, ConnectionTermsVersion } from './connection.entity.js';
import {
  type ConnectionDisplay,
  createConnectionsRepository,
  type NewConnectionRequest,
  type RevealedInfo,
} from './connections.repository.js';

/** Người đang thao tác (từ `req.auth`). */
export interface ConnectionActor {
  userId: string;
  status: UserStatus;
  roles: readonly Role[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

const partyOf = (request: ConnectionRequest, userId: string): ConnectionParty =>
  request.tutorId === userId ? 'tutor' : 'client';

/** Bên gửi theo chiều của yêu cầu; bên còn lại là bên nhận. */
const senderOf = (request: ConnectionRequest): ConnectionParty =>
  request.direction === 'client_to_tutor' ? 'client' : 'tutor';

const isOpen = (request: ConnectionRequest) =>
  request.status === 'pending' || request.status === 'negotiating';

const iso = (date: Date | null) => date?.toISOString() ?? null;

const tutorNotVerified = () =>
  new AppError('tutor_not_verified', 'Identity verification is required');

const accountRestricted = () => new AppError('account_restricted', 'Account is restricted');

const connectionExists = () =>
  new AppError(
    'connection_exists',
    'An open request already exists for this tutor, learner and subject',
  );

/** Vi phạm `connection_requests_open_uq` khi hai request cùng lúc vượt qua kiểm tra trước. */
function isDuplicateViolation(error: unknown): boolean {
  const driverError = (error as { driverError?: { code?: string; constraint?: string } })
    .driverError;
  return driverError?.code === '23505' && driverError.constraint === 'connection_requests_open_uq';
}

function toTermsDto(request: ConnectionRequest, terms: ConnectionTermsVersion): ConnectionTerms {
  return {
    version: terms.version,
    proposedBy: partyOf(request, terms.proposedBy),
    subjectId: terms.subjectId,
    gradeLevelId: terms.gradeLevelId,
    goal: terms.goal,
    goalNote: terms.goalNote,
    teachingMode: terms.teachingMode,
    provinceId: terms.provinceId,
    communeId: terms.communeId,
    sessionPriceVnd: Number(terms.sessionPriceVnd),
    sessionMinutes: terms.sessionMinutes,
    sessionsPerWeek: terms.sessionsPerWeek,
    schedule: terms.schedule,
    startDate: terms.startDate,
    note: terms.note,
    tutorConfirmedAt: iso(terms.tutorConfirmedAt),
    clientConfirmedAt: iso(terms.clientConfirmedAt),
    createdAt: terms.createdAt.toISOString(),
  };
}

export function createConnectionsService(deps: {
  dataSource: DataSource;
  logger: Logger;
  /** URL công khai của tệp ở bucket public (storage.publicUrl). */
  publicFileUrl: (storageKey: string) => string;
  /** Đẩy `conversation:opened` khi chấp nhận. Mặc định: không đẩy. */
  realtime?: RealtimePublisher;
  /** Thông báo yêu cầu mới, được chấp nhận/từ chối, xác nhận hợp tác. Mặc định: không thông báo. */
  notifier?: Notifier;
}) {
  const { dataSource, logger } = deps;
  const realtime = deps.realtime ?? noopRealtime;
  const notifier = deps.notifier ?? noopNotifier;

  function toSummary(
    request: ConnectionRequest,
    display: ConnectionDisplay,
    viewerId: string,
  ): ConnectionRequestSummary {
    const myRole = partyOf(request, viewerId);
    const isSender = senderOf(request) === myRole;
    const terms = display.latestTerms;
    const awaitingMe =
      (request.status === 'pending' && !isSender) ||
      (request.status === 'negotiating' &&
        terms !== null &&
        !(myRole === 'tutor' ? terms.tutorConfirmed : terms.clientConfirmed));
    return {
      id: request.id,
      direction: request.direction,
      status: request.status,
      cancelReason: request.cancelReason,
      myRole,
      isSender,
      awaitingMe,
      need: {
        subjectId: request.subjectId,
        gradeLevelId: request.gradeLevelId,
        goal: request.goal,
        goalNote: request.goalNote,
        teachingMode: request.teachingMode,
        provinceId: request.provinceId,
        communeId: request.communeId,
      },
      tutor: {
        id: request.tutorId,
        displayName: display.tutorName,
        slug: publicSlug(display.tutorName, display.tutorPublicCode),
        avatarUrl: display.tutorAvatarKey ? deps.publicFileUrl(display.tutorAvatarKey) : null,
      },
      // Gia sư chỉ biết người gửi/nhận là ai sau khi yêu cầu được chấp nhận.
      client:
        myRole === 'client' || request.acceptedAt !== null
          ? { displayName: display.clientName }
          : null,
      // Hồ sơ con chỉ phụ huynh thấy; gia sư thấy danh tính trẻ khi đã xác nhận hợp tác (D16).
      learner: myRole === 'client' ? { id: request.learnerId, name: display.learnerName } : null,
      tutorPostId: request.tutorPostId,
      requestPostId: request.requestPostId,
      expiresAt: isOpen(request) ? request.expiresAt.toISOString() : null,
      conversationId: display.conversationId,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  async function loadDetail(viewerId: string, requestId: string): Promise<ConnectionRequestDetail> {
    const manager = dataSource.manager;
    const repo = createConnectionsRepository(manager);
    const request = await repo.findForParty(requestId, viewerId);
    if (!request) throw notFound('Connection request');
    const display = (await repo.displayOf([request.id])).get(request.id);
    if (!display) throw notFound('Connection request');

    const summary = toSummary(request, display, viewerId);
    const terms = request.agreedTermsId
      ? await repo.termsById(request.agreedTermsId)
      : await repo.latestTerms(request.id);
    let revealed: RevealedInfo | null = null;
    if (request.status === 'confirmed') revealed = await repo.revealed(request);
    const events = await repo.events(request.id);

    return {
      ...summary,
      message: request.message,
      rejectionNote: request.rejectionNote,
      acceptedAt: iso(request.acceptedAt),
      confirmedAt: iso(request.confirmedAt),
      closedAt: iso(request.closedAt),
      terms: terms ? toTermsDto(request, terms) : null,
      contact: revealed ? (summary.myRole === 'tutor' ? revealed.client : revealed.tutor) : null,
      learnerIdentity: revealed && summary.myRole === 'tutor' ? revealed.learner : null,
      events: events.map((e): ConnectionEvent => ({
        event: e.event,
        actor: e.actorUserId === null ? 'system' : partyOf(request, e.actorUserId),
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Khóa yêu cầu U là một bên (không phải: 404), kiểm tra trạng thái hiện tại và còn hạn. Quá hạn mà job chưa kịp
   * hủy thì coi như đã hủy: 409.
   */
  async function lockOwn(
    manager: EntityManager,
    actorId: string,
    requestId: string,
    allowed: readonly ConnectionRequest['status'][],
  ): Promise<ConnectionRequest> {
    const request = await createConnectionsRepository(manager).findForParty(requestId, actorId, {
      lock: true,
    });
    if (!request) throw notFound('Connection request');
    if (!allowed.includes(request.status)) {
      throw invalidStateTransition(`Request is ${request.status}`);
    }
    if (isOpen(request) && request.expiresAt.getTime() <= Date.now()) {
      throw invalidStateTransition('Request has expired');
    }
    return request;
  }

  /** Gia sư phải còn được duyệt danh tính để chấp nhận và xác nhận hợp tác (D5). */
  async function assertTutorVerified(
    manager: EntityManager,
    request: ConnectionRequest,
    actorId: string,
  ) {
    if (request.tutorId !== actorId) return;
    if (!(await createRequestPostsRepository(manager).isVerifiedTutor(actorId))) {
      throw tutorNotVerified();
    }
  }

  /**
   * Kiểm tra giới hạn và trùng lặp rồi ghi yêu cầu mới cùng sự kiện `created` và thông báo cho bên nhận, trong một
   * transaction; đẩy thông báo sau commit.
   */
  async function insertRequest(actorId: string, data: NewConnectionRequest): Promise<string> {
    let pending: PendingNotification[] = [];
    let id: string;
    try {
      id = await dataSource.transaction(async (manager) => {
        const repo = createConnectionsRepository(manager);
        if ((await repo.countPendingSent(actorId)) >= CONNECTION_LIMITS.pendingSent) {
          throw new AppError('limit_reached', 'Too many pending requests', undefined, {
            meta: { limit: CONNECTION_LIMITS.pendingSent },
          });
        }
        if (await repo.hasOpen(data.tutorId, data.learnerId, data.subjectId)) {
          throw connectionExists();
        }
        const created = await repo.create(data);
        await repo.addEvent({
          requestId: created.id,
          event: 'created',
          actorUserId: actorId,
          fromStatus: null,
          toStatus: 'pending',
        });
        const recipient = senderOf(created) === 'client' ? 'tutor' : 'client';
        pending = await notifier.record(manager, [
          await connectionNotice(manager, created, 'connection_received', recipient, {
            accepted: false,
          }),
        ]);
        return created.id;
      });
    } catch (error) {
      if (isDuplicateViolation(error)) throw connectionExists();
      throw error;
    }
    await notifier.dispatch(pending);
    return id;
  }

  /** Phụ huynh gửi gia sư cho một hồ sơ con mình quản lý (§5.1). */
  async function sendToTutor(actor: ConnectionActor, input: SendToTutorRequest): Promise<string> {
    if (!actor.roles.includes('parent')) throw forbidden('Requires role: parent');
    const manager = dataSource.manager;
    const repo = createConnectionsRepository(manager);
    await createLearnerAccess(manager).assertParentOf(actor.userId, input.learnerId);

    // Gia sư phải đang hiển thị công khai (C8). Chính mình hoặc đã chặn nhau: 404 như không tồn tại.
    const tutor = await repo.publicTutor(input.tutorId);
    if (!tutor || input.tutorId === actor.userId) throw notFound('Tutor');
    if (await repo.isBlocked(actor.userId, input.tutorId)) throw notFound('Tutor');
    if (!tutor.acceptingStudents) {
      throw new AppError('tutor_not_accepting', 'Tutor is not accepting new students');
    }

    if (input.tutorPostId) {
      const post = await repo.openTutorPost(input.tutorPostId);
      if (!post || post.tutorId !== input.tutorId) throw notFound('Post');
      if (!post.subjectIds.includes(input.subjectId)) throw subjectNotTaught();
    } else if (!(await repo.tutorTeaches(input.tutorId, input.subjectId))) {
      throw subjectNotTaught();
    }
    await assertCatalogRefs(
      manager,
      {
        teachingSubjects: [{ subjectId: input.subjectId, gradeLevelId: input.gradeLevelId }],
        location: { provinceId: input.provinceId, communeId: input.communeId },
      },
      { paths: { teachingSubjects: 'subjectId' } },
    );

    return insertRequest(actor.userId, {
      direction: 'client_to_tutor',
      tutorId: input.tutorId,
      clientUserId: actor.userId,
      learnerId: input.learnerId,
      subjectId: input.subjectId,
      gradeLevelId: input.gradeLevelId,
      goal: input.goal,
      goalNote: input.goalNote,
      teachingMode: input.teachingMode,
      provinceId: input.provinceId,
      communeId: input.teachingMode === 'online' ? null : input.communeId,
      tutorPostId: input.tutorPostId,
      requestPostId: null,
      message: input.message,
      expiresAt: daysFromNow(CONNECTION_LIMITS.pendingDays),
    });
  }

  /** Gia sư đã xác minh ứng tuyển vào một bài tìm gia sư đang mở (§5.2). Nhu cầu chụp từ bài. */
  async function applyToRequestPost(
    actor: ConnectionActor,
    input: ApplyToRequestPostRequest,
  ): Promise<string> {
    if (!actor.roles.includes('tutor')) throw forbidden('Requires role: tutor');
    const manager = dataSource.manager;
    const posts = createRequestPostsRepository(manager);
    if (!(await posts.isVerifiedTutor(actor.userId))) throw tutorNotVerified();
    const post = await posts.findVisibleToTutors(input.requestPostId);
    if (!post || post.authorUserId === actor.userId) throw notFound('Post');
    if (await createConnectionsRepository(manager).isBlocked(actor.userId, post.authorUserId)) {
      throw notFound('Post');
    }

    return insertRequest(actor.userId, {
      direction: 'tutor_to_client',
      tutorId: actor.userId,
      clientUserId: post.authorUserId,
      learnerId: post.learnerId,
      subjectId: post.subjectId,
      gradeLevelId: post.gradeLevelId,
      goal: post.goal,
      goalNote: post.goalNote,
      teachingMode: post.teachingMode,
      provinceId: post.provinceId,
      communeId: post.communeId,
      tutorPostId: null,
      requestPostId: post.id,
      message: input.message,
      expiresAt: daysFromNow(CONNECTION_LIMITS.pendingDays),
    });
  }

  return {
    async list(
      viewerId: string,
      query: ConnectionRequestListQuery,
    ): Promise<ConnectionRequestList> {
      const repo = createConnectionsRepository(dataSource.manager);
      const { rows, total } = await repo.list(viewerId, query);
      const display = await repo.displayOf(rows.map((r) => r.id));
      return {
        items: rows.flatMap((r) => {
          const d = display.get(r.id);
          return d ? [toSummary(r, d, viewerId)] : [];
        }),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    },

    get: loadDetail,

    /** Gửi yêu cầu (phụ huynh) hoặc ứng tuyển (gia sư). Tài khoản bị hạn chế không gửi được (B.9.3). */
    async create(
      actor: ConnectionActor,
      input: CreateConnectionRequest,
    ): Promise<ConnectionRequestDetail> {
      if (actor.status !== 'active') throw accountRestricted();
      const requestId =
        input.direction === 'client_to_tutor'
          ? await sendToTutor(actor, input)
          : await applyToRequestPost(actor, input);
      logger.info(
        { userId: actor.userId, requestId, direction: input.direction },
        'Connection request created',
      );
      return loadDetail(actor.userId, requestId);
    },

    /**
     * Bên nhận chấp nhận: sang `negotiating`, hạn mới 30 ngày từ lúc chấp nhận (D15, C3), mở hội thoại giữa gia sư
     * và client (D14, C7). Sau commit: đẩy `conversation:opened` cho hai bên.
     */
    async accept(actor: ConnectionActor, requestId: string): Promise<ConnectionRequestDetail> {
      if (actor.status !== 'active') throw accountRestricted();
      const opened = await dataSource.transaction(async (manager) => {
        const request = await lockOwn(manager, actor.userId, requestId, ['pending']);
        if (senderOf(request) === partyOf(request, actor.userId)) {
          throw forbidden('Only the recipient can accept');
        }
        await assertTutorVerified(manager, request, actor.userId);
        const repo = createConnectionsRepository(manager);
        await repo.update(request.id, {
          status: 'negotiating',
          acceptedAt: new Date(),
          expiresAt: daysFromNow(CONNECTION_LIMITS.negotiatingDays),
          expiryRemindedAt: null,
        });
        await repo.addEvent({
          requestId: request.id,
          event: 'accepted',
          actorUserId: actor.userId,
          fromStatus: 'pending',
          toStatus: 'negotiating',
        });
        const conversationId = await createMessagingRepository(manager).openForConnection({
          connectionRequestId: request.id,
          tutorId: request.tutorId,
          clientUserId: request.clientUserId,
        });
        const pending = await notifier.record(manager, [
          await connectionNotice(manager, request, 'connection_accepted', senderOf(request), {
            accepted: true,
          }),
        ]);
        return { conversationId, userIds: [request.tutorId, request.clientUserId], pending };
      });
      await notifier.dispatch(opened.pending);
      const event: ConversationOpenedEvent = {
        conversationId: opened.conversationId,
        connectionRequestId: requestId,
      };
      for (const userId of opened.userIds) {
        realtime.emitToUser(userId, REALTIME_EVENTS.conversationOpened, event);
      }
      logger.info({ userId: actor.userId, requestId }, 'Connection request accepted');
      return loadDetail(actor.userId, requestId);
    },

    /** Bên nhận từ chối, có thể kèm lời nhắn. */
    async reject(
      actorId: string,
      requestId: string,
      note: string | null,
    ): Promise<ConnectionRequestDetail> {
      const pending = await dataSource.transaction(async (manager) => {
        const request = await lockOwn(manager, actorId, requestId, ['pending']);
        if (senderOf(request) === partyOf(request, actorId)) {
          throw forbidden('Only the recipient can reject');
        }
        const repo = createConnectionsRepository(manager);
        await repo.update(request.id, {
          status: 'rejected',
          closedAt: new Date(),
          rejectionNote: note,
        });
        await repo.addEvent({
          requestId: request.id,
          event: 'rejected',
          actorUserId: actorId,
          fromStatus: 'pending',
          toStatus: 'rejected',
        });
        return notifier.record(manager, [
          await connectionNotice(manager, request, 'connection_rejected', senderOf(request), {
            accepted: false,
          }),
        ]);
      });
      await notifier.dispatch(pending);
      logger.info({ userId: actorId, requestId }, 'Connection request rejected');
      return loadDetail(actorId, requestId);
    },

    /**
     * Hủy: bên gửi rút yêu cầu đang chờ (`withdrawn`); khi đang trao đổi, bên nào cũng hủy được (`ended_by_party`;
     * hội thoại chỉ còn xem được, D32). Bên nhận muốn bỏ yêu cầu đang chờ thì từ chối.
     */
    async cancel(actorId: string, requestId: string): Promise<ConnectionRequestDetail> {
      await dataSource.transaction(async (manager) => {
        const request = await lockOwn(manager, actorId, requestId, ['pending', 'negotiating']);
        const pending = request.status === 'pending';
        if (pending && senderOf(request) !== partyOf(request, actorId)) {
          throw forbidden('The recipient rejects instead of cancelling');
        }
        const repo = createConnectionsRepository(manager);
        await repo.update(request.id, {
          status: 'cancelled',
          cancelReason: pending ? 'withdrawn' : 'ended_by_party',
          closedAt: new Date(),
        });
        await repo.addEvent({
          requestId: request.id,
          event: pending ? 'withdrawn' : 'cancelled_by_party',
          actorUserId: actorId,
          fromStatus: request.status,
          toStatus: 'cancelled',
        });
      });
      logger.info({ userId: actorId, requestId }, 'Connection request cancelled');
      return loadDetail(actorId, requestId);
    },

    /**
     * Đề xuất phiên bản điều kiện hợp tác mới khi đang trao đổi (C6, D18). Môn giữ theo yêu cầu (D21). Mọi xác nhận
     * trên phiên bản cũ mất hiệu lực vì chỉ phiên bản mới nhất được xác nhận.
     */
    async proposeTerms(
      actor: ConnectionActor,
      requestId: string,
      input: ProposeTermsRequest,
    ): Promise<ConnectionRequestDetail> {
      if (actor.status !== 'active') throw accountRestricted();
      await assertCatalogRefs(dataSource.manager, {
        gradeLevelId: input.gradeLevelId,
        location: { provinceId: input.provinceId, communeId: input.communeId },
      });
      const version = await dataSource.transaction(async (manager) => {
        const request = await lockOwn(manager, actor.userId, requestId, ['negotiating']);
        const repo = createConnectionsRepository(manager);
        const latest = await repo.latestTerms(request.id);
        const next = (latest?.version ?? 0) + 1;
        await repo.insertTerms({
          requestId: request.id,
          version: next,
          proposedBy: actor.userId,
          subjectId: request.subjectId,
          gradeLevelId: input.gradeLevelId,
          goal: input.goal,
          goalNote: input.goalNote,
          teachingMode: input.teachingMode,
          provinceId: input.provinceId,
          communeId: input.teachingMode === 'online' ? null : input.communeId,
          sessionPriceVnd: input.sessionPriceVnd,
          sessionMinutes: input.sessionMinutes,
          sessionsPerWeek: input.sessionsPerWeek,
          schedule: input.schedule,
          startDate: input.startDate,
          note: input.note,
        });
        // Đánh dấu cập nhật để danh sách sắp theo hoạt động mới nhất và client biết có thay đổi.
        await repo.touch(request.id);
        await repo.addEvent({
          requestId: request.id,
          event: 'terms_proposed',
          actorUserId: actor.userId,
          fromStatus: 'negotiating',
          toStatus: 'negotiating',
          data: { version: next },
        });
        return next;
      });
      logger.info({ userId: actor.userId, requestId, version }, 'Connection terms proposed');
      return loadDetail(actor.userId, requestId);
    },

    /**
     * Xác nhận hợp tác theo phiên bản `version` (phải là phiên bản mới nhất, khác: 409 `terms_outdated`). Khi phiên
     * bản có đủ xác nhận của hai bên, trong cùng transaction: yêu cầu sang `confirmed`, chốt `agreed_terms_id`; nếu
     * yêu cầu đến từ bài tìm gia sư thì đóng bài (`found_tutor`) và hủy các ứng tuyển còn chờ của bài (D31). Tạo lớp
     * ở G6.
     */
    async confirm(
      actor: ConnectionActor,
      requestId: string,
      version: number,
    ): Promise<ConnectionRequestDetail> {
      if (actor.status !== 'active') throw accountRestricted();
      let pending: PendingNotification[] = [];
      const confirmed = await dataSource.transaction(async (manager) => {
        const request = await lockOwn(manager, actor.userId, requestId, ['negotiating']);
        await assertTutorVerified(manager, request, actor.userId);
        const repo = createConnectionsRepository(manager);
        const latest = await repo.latestTerms(request.id);
        if (!latest) throw invalidStateTransition('No terms have been proposed yet');
        if (latest.version !== version) {
          throw new AppError('terms_outdated', 'A newer version of the terms exists', undefined, {
            meta: { latestVersion: latest.version },
          });
        }
        const party = partyOf(request, actor.userId);
        const already = party === 'tutor' ? latest.tutorConfirmedAt : latest.clientConfirmedAt;
        if (!already) {
          await repo.markTermsConfirmed(latest.id, party);
          await repo.addEvent({
            requestId: request.id,
            event: party === 'tutor' ? 'confirmed_by_tutor' : 'confirmed_by_client',
            actorUserId: actor.userId,
            fromStatus: 'negotiating',
            toStatus: 'negotiating',
            data: { version },
          });
        }
        const otherConfirmed =
          party === 'tutor' ? latest.clientConfirmedAt !== null : latest.tutorConfirmedAt !== null;
        if (!otherConfirmed) {
          await repo.touch(request.id);
          return false;
        }

        await repo.update(request.id, {
          status: 'confirmed',
          confirmedAt: new Date(),
          agreedTermsId: latest.id,
        });
        await repo.addEvent({
          requestId: request.id,
          event: 'confirmed',
          actorUserId: null,
          fromStatus: 'negotiating',
          toStatus: 'confirmed',
          data: { version },
        });
        if (request.requestPostId) {
          await createRequestPostsRepository(manager).closeFoundTutor(request.requestPostId);
          await repo.cancelPendingApplications(request.requestPostId);
        }
        // Người bấm xác nhận sau cùng đã biết; báo cho bên kia.
        const other = party === 'tutor' ? 'client' : 'tutor';
        pending = await notifier.record(manager, [
          await connectionNotice(manager, request, 'connection_confirmed', other, {
            accepted: true,
          }),
        ]);
        return true;
      });
      await notifier.dispatch(pending);
      logger.info(
        { userId: actor.userId, requestId, version, confirmed },
        'Connection terms confirmed',
      );
      return loadDetail(actor.userId, requestId);
    },
  };
}

const subjectNotTaught = () =>
  new AppError('validation_failed', 'The tutor does not teach this subject', [
    { path: 'subjectId', code: 'subject_not_taught', message: 'Subject not taught by this tutor' },
  ]);

export type ConnectionsService = ReturnType<typeof createConnectionsService>;
