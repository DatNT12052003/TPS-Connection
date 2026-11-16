// Lớp học (G6 đợt 1, §6, B.5). Hệ thống tạo lớp khi yêu cầu kết nối chuyển `confirmed` (D9, xem
// `connections.service.ts`); module này lo xem lớp, đổi trạng thái lớp, đổi học phí, ghi chú và mục tiêu.
//
// Quyền: người xem có một vai trò trong lớp (`ClassRole`): gia sư của lớp, client (phụ huynh đang quản lý học sinh)
// hoặc chính học sinh (chỉ xem, D4). Không có vai trò: 404 như lớp không tồn tại. Có vai trò nhưng thao tác không
// dành cho vai trò đó: 403.
// - Chỉ gia sư đặt tên, tạm nghỉ, cho học lại, kết thúc lớp (D35), ghi năng lực ban đầu, lưu ý giảng dạy, mục tiêu,
//   đề xuất và rút đề xuất học phí. Chỉ phụ huynh đồng ý hoặc từ chối đề xuất học phí (D17).
// - Lớp đã kết thúc chỉ còn xem (§16.13): mọi thao tác ghi trả 409.
// - Mọi thao tác ghi khóa dòng lớp trong transaction.
// Chưa làm ở đợt này: hủy / sinh lại buổi học khi tạm nghỉ, học lại, kết thúc (đợt 2 cùng bảng buổi học); thông báo
// đề xuất và kết quả đổi học phí (đợt 2 cùng các loại thông báo của lớp).
import {
  type ClassDetail,
  type ClassEnrollment,
  type ClassList,
  type ClassListQuery,
  type ClassRole,
  type ClassSummary,
  CLASS_LIMITS,
  type CreateLearningGoalRequest,
  type FeeRate,
  type LearningGoal,
  type ProposeFeeRateRequest,
  publicSlug,
  type RequestPostGoal,
  type UpdateEnrollmentNotesRequest,
  type UpdateLearningGoalRequest,
} from '@tps/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AppError, forbidden, invalidStateTransition, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import { createLearnerAccess } from '../learners/learner-access.js';
import type { EnrollmentFeeRate, LearningGoalRow, TutoringClass } from './class.entity.js';
import { type ClassRow, createClassesRepository } from './classes.repository.js';

const iso = (date: Date | null) => date?.toISOString() ?? null;

const classEnded = () => invalidStateTransition('Class has ended');

function toFeeRateDto(rate: EnrollmentFeeRate): FeeRate {
  return {
    id: rate.id,
    sessionPriceVnd: Number(rate.sessionPriceVnd),
    sessionMinutes: rate.sessionMinutes,
    status: rate.status,
    note: rate.note,
    effectiveFrom: iso(rate.effectiveFrom),
    source: rate.sourceTermsId ? 'terms' : 'proposal',
    decidedAt: iso(rate.decidedAt),
    createdAt: rate.createdAt.toISOString(),
  };
}

function toGoalDto(goal: LearningGoalRow): LearningGoal {
  return {
    id: goal.id,
    periodType: goal.periodType,
    periodStart: goal.periodStart,
    periodEnd: goal.periodEnd,
    description: goal.description,
    status: goal.status,
    progressNote: goal.progressNote,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

export function createClassesService(deps: {
  dataSource: DataSource;
  logger: Logger;
  /** URL công khai của tệp ở bucket public (storage.publicUrl). */
  publicFileUrl: (storageKey: string) => string;
}) {
  const { dataSource, logger } = deps;

  function toSummary(row: ClassRow): ClassSummary {
    const isStudent = row.myRole === 'student';
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      myRole: row.myRole,
      subjectId: row.subjectId,
      gradeLevelId: row.gradeLevelId,
      teachingMode: row.teachingMode,
      startedOn: row.startedOn,
      endedOn: row.endedOn,
      tutor: {
        id: row.tutorId,
        displayName: row.tutorName,
        slug: publicSlug(row.tutorName, row.tutorPublicCode),
        avatarUrl: row.tutorAvatarKey ? deps.publicFileUrl(row.tutorAvatarKey) : null,
      },
      client: { displayName: row.clientName },
      learner: { id: row.learnerId, name: row.learnerName },
      enrollmentId: row.enrollmentId,
      currentFee:
        isStudent || !row.activeFee
          ? null
          : {
              sessionPriceVnd: row.activeFee.sessionPriceVnd,
              sessionMinutes: row.activeFee.sessionMinutes,
              effectiveFrom: row.activeFee.effectiveFrom.toISOString(),
            },
      feeChangePending: !isStudent && row.feeChangePending,
      // Học sinh chưa chat ở bản đầu (C7).
      conversationId: isStudent ? null : row.conversationId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Các dòng của lớp mà U được xem; không có: 404. */
  async function visibleRows(manager: EntityManager, userId: string, classId: string) {
    const rows = await createClassesRepository(manager).visibleRowsOfClass(userId, classId);
    if (rows.length === 0) throw notFound('Class');
    return { rows, role: rows[0]!.myRole };
  }

  async function loadDetail(userId: string, classId: string): Promise<ClassDetail> {
    const manager = dataSource.manager;
    const repo = createClassesRepository(manager);
    const { rows, role } = await visibleRows(manager, userId, classId);
    const first = rows[0]!;
    const visibleIds = new Set(rows.map((r) => r.enrollmentId));
    const enrollments = (await repo.enrollmentsOf(classId)).filter((e) => visibleIds.has(e.id));
    const ids = enrollments.map((e) => e.id);
    const feeRates = role === 'student' ? [] : await repo.feeRatesOf(ids);
    const goals = await repo.goalsOf(ids);
    const need = await repo.agreedNeed(first.connectionRequestId);

    const learnerNames = new Map(rows.map((r) => [r.enrollmentId, r]));
    const enrollmentDtos = enrollments.map((e): ClassEnrollment => {
      const row = learnerNames.get(e.id)!;
      return {
        id: e.id,
        status: e.status,
        joinedOn: e.joinedOn,
        leftOn: e.leftOn,
        learner: { id: row.learnerId, name: row.learnerName },
        initialAssessment: role === 'student' ? null : e.initialAssessment,
        teachingNotes: role === 'tutor' ? e.teachingNotes : null,
        feeRates: feeRates.filter((r) => r.enrollmentId === e.id).map(toFeeRateDto),
        goals: goals.filter((g) => g.enrollmentId === e.id).map(toGoalDto),
      };
    });

    // Lớp chỉ có sau khi xác nhận hợp tác, nên liên hệ và danh tính trẻ đã được mở (D16). Kiểm tra lại quan hệ dạy
    // học trước khi trả danh tính cho gia sư.
    let contact: ClassDetail['contact'] = null;
    let learnerIdentity: ClassDetail['learnerIdentity'] = null;
    if (role === 'tutor') {
      contact = await repo.contactOf(first.clientUserId);
      if (await createLearnerAccess(manager).teachesStudent(userId, first.learnerId)) {
        learnerIdentity = await repo.learnerIdentity(first.learnerId);
      }
    } else if (role === 'client') {
      contact = await repo.contactOf(first.tutorId);
    }

    return {
      ...toSummary(first),
      goal: (need?.goal ?? 'other') as RequestPostGoal,
      goalNote: need?.goalNote ?? null,
      provinceId: need?.provinceId ?? null,
      communeId: need?.communeId ?? null,
      endedReason: first.endedReason,
      connectionRequestId: role === 'student' ? null : first.connectionRequestId,
      enrollments: enrollmentDtos,
      contact,
      learnerIdentity,
    };
  }

  /**
   * Chạy `fn` trong transaction với lớp đã khóa, khi U có một trong `roles` với lớp. Không thấy lớp: 404; thấy nhưng
   * vai trò khác: 403; lớp đã kết thúc: 409. Trả về các dòng U thấy (để kiểm tra ghi danh thuộc phạm vi của U).
   */
  async function mutate<T>(
    userId: string,
    classId: string,
    roles: readonly ClassRole[],
    fn: (ctx: { manager: EntityManager; cls: TutoringClass; rows: ClassRow[] }) => Promise<T>,
  ): Promise<T> {
    return dataSource.transaction(async (manager) => {
      const { rows, role } = await visibleRows(manager, userId, classId);
      if (!roles.includes(role)) throw forbidden(`Requires class role: ${roles.join(', ')}`);
      const cls = await createClassesRepository(manager).findClass(classId, { lock: true });
      if (!cls) throw notFound('Class');
      if (cls.status === 'ended') throw classEnded();
      return fn({ manager, cls, rows });
    });
  }

  /** Ghi danh `enrollmentId` thuộc lớp và nằm trong phạm vi U thấy (phụ huynh chỉ thấy con mình). Khác: 404. */
  function assertEnrollmentVisible(rows: ClassRow[], enrollmentId: string) {
    if (!rows.some((r) => r.enrollmentId === enrollmentId)) throw notFound('Enrollment');
  }

  return {
    async list(userId: string, query: ClassListQuery): Promise<ClassList> {
      const { rows, total } = await createClassesRepository(dataSource.manager).list(userId, query);
      return { items: rows.map(toSummary), page: query.page, pageSize: query.pageSize, total };
    },

    get: loadDetail,

    /** Gia sư đặt hoặc bỏ tên riêng của lớp. */
    async rename(userId: string, classId: string, name: string | null): Promise<ClassDetail> {
      await mutate(userId, classId, ['tutor'], async ({ manager, cls }) => {
        await createClassesRepository(manager).updateClass(cls.id, { name });
      });
      return loadDetail(userId, classId);
    },

    /** active → paused (D35). Ghi danh tạm nghỉ theo. Hủy buổi tương lai: đợt 2. */
    async pause(userId: string, classId: string): Promise<ClassDetail> {
      await mutate(userId, classId, ['tutor'], async ({ manager, cls }) => {
        if (cls.status !== 'active') throw invalidStateTransition(`Class is ${cls.status}`);
        const repo = createClassesRepository(manager);
        await repo.updateClass(cls.id, { status: 'paused', pausedAt: new Date() });
        await repo.setEnrollmentsStatus(cls.id, 'paused');
      });
      logger.info({ userId, classId }, 'Class paused');
      return loadDetail(userId, classId);
    },

    /** paused → active (D35). Sinh lại buổi học: đợt 2. */
    async resume(userId: string, classId: string): Promise<ClassDetail> {
      await mutate(userId, classId, ['tutor'], async ({ manager, cls }) => {
        if (cls.status !== 'paused') throw invalidStateTransition(`Class is ${cls.status}`);
        const repo = createClassesRepository(manager);
        await repo.updateClass(cls.id, { status: 'active', pausedAt: null });
        await repo.setEnrollmentsStatus(cls.id, 'active');
      });
      logger.info({ userId, classId }, 'Class resumed');
      return loadDetail(userId, classId);
    },

    /**
     * active | paused → ended kèm lý do (D35, B.5.1): ghi danh rời lớp, đề xuất học phí còn chờ tự rút. Dữ liệu học
     * tập giữ nguyên để tra cứu (§16.13). Đổi gia sư = kết thúc lớp và kết nối lại (D28).
     */
    async end(userId: string, classId: string, reason: string): Promise<ClassDetail> {
      await mutate(userId, classId, ['tutor'], async ({ manager, cls }) => {
        const repo = createClassesRepository(manager);
        await repo.endClass(cls.id, reason);
        await repo.leaveAll(cls.id);
        await repo.withdrawProposedFees(cls.id);
      });
      logger.info({ userId, classId }, 'Class ended');
      return loadDetail(userId, classId);
    },

    /** Gia sư ghi năng lực ban đầu, lưu ý giảng dạy của một học sinh trong lớp. */
    async updateEnrollmentNotes(
      userId: string,
      classId: string,
      enrollmentId: string,
      input: UpdateEnrollmentNotesRequest,
    ): Promise<ClassDetail> {
      await mutate(userId, classId, ['tutor'], async ({ manager, rows }) => {
        assertEnrollmentVisible(rows, enrollmentId);
        const changes: { initialAssessment?: string | null; teachingNotes?: string | null } = {};
        if (input.initialAssessment !== undefined) {
          changes.initialAssessment = input.initialAssessment;
        }
        if (input.teachingNotes !== undefined) changes.teachingNotes = input.teachingNotes;
        await createClassesRepository(manager).updateEnrollment(enrollmentId, changes);
      });
      return loadDetail(userId, classId);
    },

    /**
     * Gia sư đề xuất mức học phí mới (D17). Mỗi ghi danh tối đa một đề xuất đang chờ: đã có thì 409
     * `fee_change_pending`. Học sinh đã rời lớp: 409.
     */
    async proposeFee(
      userId: string,
      classId: string,
      enrollmentId: string,
      input: ProposeFeeRateRequest,
    ): Promise<ClassDetail> {
      await mutate(userId, classId, ['tutor'], async ({ manager, rows }) => {
        assertEnrollmentVisible(rows, enrollmentId);
        const repo = createClassesRepository(manager);
        const enrollment = await repo.findEnrollment(classId, enrollmentId);
        if (!enrollment) throw notFound('Enrollment');
        if (enrollment.status === 'left') throw invalidStateTransition('Learner has left');
        if (await repo.hasProposedFee(enrollmentId)) {
          throw new AppError('fee_change_pending', 'A fee change is already pending');
        }
        await repo.proposeFee({
          enrollmentId,
          sessionPriceVnd: input.sessionPriceVnd,
          sessionMinutes: input.sessionMinutes,
          note: input.note,
          proposedBy: userId,
        });
      });
      logger.info({ userId, classId, enrollmentId }, 'Fee change proposed');
      return loadDetail(userId, classId);
    },

    /**
     * Quyết định về một đề xuất học phí đang chờ: phụ huynh đồng ý (`accept`: mức mới áp dụng từ bây giờ, mức cũ
     * thành `superseded`) hoặc từ chối (`reject`); gia sư rút (`withdraw`). Đề xuất không còn chờ: 409.
     */
    async decideFee(
      userId: string,
      classId: string,
      enrollmentId: string,
      rateId: string,
      decision: 'accept' | 'reject' | 'withdraw',
    ): Promise<ClassDetail> {
      const roles: ClassRole[] = decision === 'withdraw' ? ['tutor'] : ['client'];
      await mutate(userId, classId, roles, async ({ manager, rows }) => {
        assertEnrollmentVisible(rows, enrollmentId);
        const repo = createClassesRepository(manager);
        const rate = await repo.findFeeRate(enrollmentId, rateId);
        if (!rate) throw notFound('Fee rate');
        if (rate.status !== 'proposed') throw invalidStateTransition(`Fee rate is ${rate.status}`);
        if (decision === 'accept') await repo.activateFee(enrollmentId, rateId, userId);
        else await repo.decideFee(rateId, decision === 'reject' ? 'rejected' : 'withdrawn', userId);
      });
      logger.info({ userId, classId, enrollmentId, rateId, decision }, 'Fee change decided');
      return loadDetail(userId, classId);
    },

    /** Gia sư thêm mục tiêu học tập cho một học sinh (§6). */
    async createGoal(
      userId: string,
      classId: string,
      enrollmentId: string,
      input: CreateLearningGoalRequest,
    ): Promise<ClassDetail> {
      await mutate(userId, classId, ['tutor'], async ({ manager, rows }) => {
        assertEnrollmentVisible(rows, enrollmentId);
        const repo = createClassesRepository(manager);
        if ((await repo.countGoals(enrollmentId)) >= CLASS_LIMITS.goalsPerEnrollment) {
          throw new AppError('limit_reached', 'Too many learning goals', undefined, {
            meta: { limit: CLASS_LIMITS.goalsPerEnrollment },
          });
        }
        await repo.createGoal({ enrollmentId, ...input, createdBy: userId });
      });
      return loadDetail(userId, classId);
    },

    /** Gia sư sửa mục tiêu, cập nhật kết quả và ghi chú tiến độ. Khoảng thời gian sau khi sửa phải hợp lệ. */
    async updateGoal(
      userId: string,
      classId: string,
      enrollmentId: string,
      goalId: string,
      input: UpdateLearningGoalRequest,
    ): Promise<ClassDetail> {
      await mutate(userId, classId, ['tutor'], async ({ manager, rows }) => {
        assertEnrollmentVisible(rows, enrollmentId);
        const repo = createClassesRepository(manager);
        const goal = await repo.findGoal(enrollmentId, goalId);
        if (!goal) throw notFound('Learning goal');
        const periodStart = input.periodStart ?? goal.periodStart;
        const periodEnd = input.periodEnd ?? goal.periodEnd;
        if (periodEnd < periodStart) {
          throw new AppError('validation_failed', 'Period end is before its start', [
            {
              path: 'periodEnd',
              code: 'period_end_before_start',
              message: 'Period end is before its start',
            },
          ]);
        }
        const changes: Partial<LearningGoalRow> = {};
        if (input.periodType !== undefined) changes.periodType = input.periodType;
        if (input.periodStart !== undefined) changes.periodStart = input.periodStart;
        if (input.periodEnd !== undefined) changes.periodEnd = input.periodEnd;
        if (input.description !== undefined) changes.description = input.description;
        if (input.status !== undefined) changes.status = input.status;
        if (input.progressNote !== undefined) changes.progressNote = input.progressNote;
        await repo.updateGoal(goalId, changes);
      });
      return loadDetail(userId, classId);
    },
  };
}

export type ClassesService = ReturnType<typeof createClassesService>;
