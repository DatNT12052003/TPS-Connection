// Lịch học, buổi học, điểm danh, xác nhận buổi, khiếu nại, điểm và nhận xét (G6 đợt 2; §7, §9; B.6–B.8).
//
// Quyền theo vai trò trong lớp của buổi (xem `classes.service.ts`): không thấy lớp: 404; sai vai trò: 403.
// - Gia sư: lịch lặp, buổi lẻ / buổi bù, dời buổi, điểm danh và sửa điểm danh (D37), điểm và nhận xét.
// - Phụ huynh (client): xác nhận hoặc khiếu nại điểm danh trong 48 giờ, đồng ý hoặc rút khiếu nại (C5).
// - Gia sư hoặc phụ huynh: hủy buổi chưa diễn ra (dưới 2 giờ là hủy muộn, C5), chuyển khiếu nại cho Manager sớm (D38).
// - Học sinh: chỉ xem, không thấy học phí.
// Lớp đã kết thúc: không xếp lịch, không tạo, dời hay hủy buổi, không ghi điểm; vẫn điểm danh, xác nhận và khiếu
// nại được các buổi đã diễn ra (lịch sử dùng để đối chiếu học phí).
// Thông báo ghi trong transaction, đẩy sau commit (như G5).
import {
  type AdminDispute,
  type AdminDisputeList,
  type AdminDisputeListQuery,
  type Assessment,
  type AttendanceDispute,
  type ClassRole,
  type ClassSchedule,
  type CreateAssessmentRequest,
  type CreateLessonRequest,
  LESSON_LIMITS,
  type Lesson,
  type LessonAttendance,
  type LessonDetail,
  type LessonList,
  type LessonListQuery,
  type OpenDisputeRequest,
  type RecordAttendanceRequest,
  type ResolveDisputeRequest,
  type ScheduleInput,
  type UpdateAssessmentRequest,
  type UpdateLessonRequest,
} from '@tps/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AppError, forbidden, invalidStateTransition, notFound } from '../../lib/app-error.js';
import type { Logger } from '../../lib/logger.js';
import { createAuditRepository } from '../audit/audit.repository.js';
import {
  type ClassRecipient,
  displayNameOf,
  recordClassNotices,
} from '../classes/class-notifications.js';
import type { TutoringClass } from '../classes/class.entity.js';
import { type ClassRow, createClassesRepository } from '../classes/classes.repository.js';
import {
  noopNotifier,
  type Notifier,
  type PendingNotification,
} from '../notifications/notifications.service.js';
import type {
  AssessmentRow,
  AttendanceDisputeRow,
  ClassScheduleRow,
  LessonAttendanceRow,
  LessonRow,
} from './lesson.entity.js';
import { type AttendanceWrite, createLessonsRepository } from './lessons.repository.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const iso = (date: Date | null) => date?.toISOString() ?? null;

const fieldError = (path: string, code: string, message: string) =>
  new AppError('validation_failed', message, [{ path, code, message }]);

const classEnded = () => invalidStateTransition('Class has ended');

/** Ngày theo giờ Việt Nam (YYYY-MM-DD) của một thời điểm. */
const localDate = (instant: Date) =>
  new Date(instant.getTime() + 7 * HOUR_MS).toISOString().slice(0, 10);

/** Thời điểm buổi lẻ / buổi bù / dời buổi phải nằm trong khoảng cho phép. */
function assertLessonTime(startsAt: Date, options: { future: boolean }) {
  const now = Date.now();
  const earliest = options.future ? now : now - LESSON_LIMITS.pastLessonDays * DAY_MS;
  const latest = now + LESSON_LIMITS.futureLessonDays * DAY_MS;
  if (startsAt.getTime() <= earliest || startsAt.getTime() > latest) {
    throw fieldError('startsAt', 'lesson_time_out_of_range', 'Lesson time is out of range');
  }
}

export function toScheduleDto(row: ClassScheduleRow): ClassSchedule {
  return {
    id: row.id,
    weekdays: [...row.weekdays].sort((a, b) => a - b),
    startTime: row.localStartTime.slice(0, 5),
    durationMinutes: row.durationMinutes,
    startDate: row.startDate,
    untilDate: row.untilDate,
    teachingMode: row.teachingMode,
    locationNote: row.locationNote,
    onlineUrl: row.onlineUrl,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAssessmentDto(row: AssessmentRow): Assessment {
  return {
    id: row.id,
    enrollmentId: row.enrollmentId,
    lessonId: row.lessonId,
    kind: row.kind,
    title: row.title,
    score: row.score === null ? null : Number(row.score),
    maxScore: Number(row.maxScore),
    comment: row.comment,
    assessedOn: row.assessedOn,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDisputeDto(row: AttendanceDisputeRow): AttendanceDispute {
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    claimedStatus: row.claimedStatus,
    negotiateUntil: row.negotiateUntil.toISOString(),
    resolutionNote: row.resolutionNote,
    resolvedAt: iso(row.resolvedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Thông tin một lớp theo góc nhìn của người xem (gộp các dòng "lớp × học sinh"). */
interface ClassView {
  classId: string;
  name: string | null;
  subjectId: number;
  tutorId: string;
  tutorName: string;
  status: TutoringClass['status'];
  role: ClassRole;
  learnerNames: Map<string, { learnerId: string; name: string }>;
}

function groupRows(rows: ClassRow[]): Map<string, ClassView> {
  const views = new Map<string, ClassView>();
  for (const row of rows) {
    let view = views.get(row.id);
    if (!view) {
      view = {
        classId: row.id,
        name: row.name,
        subjectId: row.subjectId,
        tutorId: row.tutorId,
        tutorName: row.tutorName,
        status: row.status,
        role: row.myRole,
        learnerNames: new Map(),
      };
      views.set(row.id, view);
    }
    view.learnerNames.set(row.enrollmentId, { learnerId: row.learnerId, name: row.learnerName });
  }
  return views;
}

export function createLessonsService(deps: {
  dataSource: DataSource;
  logger: Logger;
  /** Thông báo của lớp (G6). Mặc định: không thông báo. */
  notifier?: Notifier;
}) {
  const { dataSource, logger } = deps;
  const notifier = deps.notifier ?? noopNotifier;

  function toLessonDto(
    lesson: LessonRow,
    view: ClassView,
    attendances: LessonAttendanceRow[],
  ): Lesson {
    let awaitingMe = false;
    if (view.role === 'tutor') {
      awaitingMe = lesson.status === 'scheduled' && lesson.startsAt.getTime() <= Date.now();
    } else if (view.role === 'client') {
      awaitingMe = attendances.some(
        (a) =>
          a.lessonId === lesson.id &&
          view.learnerNames.has(a.enrollmentId) &&
          a.confirmationStatus === 'pending',
      );
    }
    return {
      id: lesson.id,
      classId: lesson.classId,
      className: view.name,
      subjectId: view.subjectId,
      learnerNames: [...view.learnerNames.values()].map((l) => l.name),
      tutorName: view.tutorName,
      myRole: view.role,
      status: lesson.status,
      startsAt: lesson.startsAt.toISOString(),
      endsAt: lesson.endsAt.toISOString(),
      teachingMode: lesson.teachingMode,
      locationNote: lesson.locationNote,
      onlineUrl: lesson.onlineUrl,
      scheduleId: lesson.scheduleId,
      makeupForLessonId: lesson.makeupForLessonId,
      rescheduled:
        lesson.occurrenceStart !== null &&
        lesson.occurrenceStart.getTime() !== lesson.startsAt.getTime(),
      cancelledBy:
        lesson.cancelKind === null
          ? null
          : lesson.cancelKind !== 'party'
            ? 'system'
            : lesson.cancelledBy === view.tutorId
              ? 'tutor'
              : 'client',
      cancelKind: lesson.cancelKind,
      cancelReason: lesson.cancelReason,
      isLateCancellation: lesson.isLateCancellation,
      awaitingMe,
      attendanceStates: attendances
        .filter((a) => a.lessonId === lesson.id && view.learnerNames.has(a.enrollmentId))
        .map((a) => ({
          enrollmentId: a.enrollmentId,
          status: a.status,
          confirmationStatus: a.confirmationStatus,
        })),
    };
  }

  /** Buổi `lessonId` và lớp của nó theo góc nhìn của U. Không thấy lớp: 404. */
  async function lessonContext(
    manager: EntityManager,
    userId: string,
    lessonId: string,
    options: { lock?: boolean } = {},
  ) {
    const lessons = createLessonsRepository(manager);
    const lesson = await lessons.findLesson(lessonId, options);
    if (!lesson) throw notFound('Lesson');
    const rows = await createClassesRepository(manager).visibleRowsOfClass(userId, lesson.classId);
    const view = groupRows(rows).get(lesson.classId);
    if (!view) throw notFound('Lesson');
    return { lesson, view };
  }

  function requireRole(view: ClassView, roles: readonly ClassRole[]) {
    if (!roles.includes(view.role)) throw forbidden(`Requires class role: ${roles.join(', ')}`);
  }

  async function loadLessonDetail(userId: string, lessonId: string): Promise<LessonDetail> {
    const manager = dataSource.manager;
    const repo = createLessonsRepository(manager);
    const { lesson, view } = await lessonContext(manager, userId, lessonId);
    const attendances = (await repo.attendancesOf([lesson.id])).filter((a) =>
      view.learnerNames.has(a.enrollmentId),
    );
    const disputes = await repo.latestDisputes(attendances.map((a) => a.id));
    const assessments = (await repo.assessmentsOf({ lessonId: lesson.id })).filter((s) =>
      view.learnerNames.has(s.enrollmentId),
    );
    const isStudent = view.role === 'student';
    return {
      ...toLessonDto(lesson, view, attendances),
      contentTaught: lesson.contentTaught,
      notes: lesson.tutorNotes,
      actualMinutes: lesson.actualMinutes,
      recordedAt: iso(lesson.recordedAt),
      attendances: attendances.map((a): LessonAttendance => {
        const learner = view.learnerNames.get(a.enrollmentId)!;
        const dispute = disputes.get(a.id);
        return {
          id: a.id,
          enrollmentId: a.enrollmentId,
          learner: { id: learner.learnerId, name: learner.name },
          status: a.status,
          comment: a.tutorComment,
          sessionPriceVnd: isStudent ? null : Number(a.sessionPriceVnd),
          sessionMinutes: a.sessionMinutes,
          isBillable: isStudent ? null : a.isBillable,
          billableAmountVnd: isStudent ? null : Number(a.billableAmountVnd),
          confirmationStatus: a.confirmationStatus,
          confirmDueAt: a.confirmDueAt.toISOString(),
          confirmedAt: iso(a.confirmedAt),
          dispute: dispute ? toDisputeDto(dispute) : null,
        };
      }),
      assessments: assessments.map(toAssessmentDto),
    };
  }

  const notifyClass = (
    manager: EntityManager,
    classId: string,
    to: readonly ClassRecipient[],
    build: Parameters<typeof recordClassNotices>[4],
    options: Parameters<typeof recordClassNotices>[5] = {},
  ) => recordClassNotices(manager, notifier, classId, to, build, options);
  const displayName = displayNameOf;

  /** Chạy trong transaction với lớp đã khóa, U phải là gia sư của lớp; lớp đã kết thúc: 409. */
  async function withTutorClass<T>(
    userId: string,
    classId: string,
    fn: (ctx: { manager: EntityManager; cls: TutoringClass; rows: ClassRow[] }) => Promise<T>,
  ): Promise<T> {
    return dataSource.transaction(async (manager) => {
      const classes = createClassesRepository(manager);
      const rows = await classes.visibleRowsOfClass(userId, classId);
      if (rows.length === 0) throw notFound('Class');
      if (rows[0]!.myRole !== 'tutor') throw forbidden('Requires class role: tutor');
      const cls = await classes.findClass(classId, { lock: true });
      if (!cls) throw notFound('Class');
      if (cls.status === 'ended') throw classEnded();
      return fn({ manager, cls, rows });
    });
  }

  /** Điểm danh của buổi mà U (phụ huynh) quản lý học sinh, đã khóa buổi. */
  async function clientAttendance(
    manager: EntityManager,
    userId: string,
    lessonId: string,
    attendanceId: string,
    roles: readonly ClassRole[] = ['client'],
  ) {
    const ctx = await lessonContext(manager, userId, lessonId, { lock: true });
    requireRole(ctx.view, roles);
    const attendance = await createLessonsRepository(manager).findAttendance(
      lessonId,
      attendanceId,
    );
    if (!attendance || !ctx.view.learnerNames.has(attendance.enrollmentId)) {
      throw notFound('Attendance');
    }
    return { ...ctx, attendance };
  }

  async function disputeNotice(
    manager: EntityManager,
    lesson: LessonRow,
    event: 'opened' | 'settled' | 'withdrawn' | 'escalated' | 'resolved',
    to: readonly ClassRecipient[],
    options: { except?: string; actorName?: string | null } = {},
  ) {
    return notifyClass(
      manager,
      lesson.classId,
      to,
      (base) => ({
        type: 'lesson_dispute',
        data: { ...base, lessonId: lesson.id, startsAt: lesson.startsAt.toISOString(), event },
      }),
      options,
    );
  }

  async function adminGet(disputeId: string): Promise<AdminDispute> {
    const [row] = await createLessonsRepository(dataSource.manager).adminDisputeRows([disputeId]);
    if (!row) throw notFound('Dispute');
    return toAdminDispute(row);
  }

  return {
    // ---- Lịch lặp --------------------------------------------------------------------------------

    schedulesOf: async (manager: EntityManager, classId: string) =>
      (await createLessonsRepository(manager).schedulesOf(classId)).map(toScheduleDto),

    assessmentsOf: async (manager: EntityManager, enrollmentIds: string[]) =>
      (await createLessonsRepository(manager).assessmentsOf({ enrollmentIds })).map(
        toAssessmentDto,
      ),

    /** Gia sư thêm lịch lặp hằng tuần; sinh ngay buổi trong 8 tuần tới nếu lớp đang học (D27). */
    async createSchedule(userId: string, classId: string, input: ScheduleInput): Promise<void> {
      await withTutorClass(userId, classId, async ({ manager, cls }) => {
        const repo = createLessonsRepository(manager);
        if ((await repo.countActiveSchedules(cls.id)) >= LESSON_LIMITS.schedulesPerClass) {
          throw new AppError('limit_reached', 'Too many schedules', undefined, {
            meta: { limit: LESSON_LIMITS.schedulesPerClass },
          });
        }
        const schedule = await repo.createSchedule({
          classId: cls.id,
          ...input,
          createdBy: userId,
        });
        const created = await repo.generate([schedule.id]);
        logger.info({ userId, classId, scheduleId: schedule.id, created }, 'Schedule created');
      });
    },

    /**
     * Sửa lịch: xóa các buổi tương lai còn `scheduled` của lịch rồi sinh lại theo quy tắc mới. Buổi đã qua, đã dời,
     * đã hủy hoặc đã điểm danh giữ nguyên (§7).
     */
    async replaceSchedule(
      userId: string,
      classId: string,
      scheduleId: string,
      input: ScheduleInput,
    ): Promise<void> {
      await withTutorClass(userId, classId, async ({ manager, cls }) => {
        const repo = createLessonsRepository(manager);
        const schedule = await repo.findSchedule(cls.id, scheduleId);
        if (!schedule) throw notFound('Schedule');
        if (schedule.status !== 'active') throw invalidStateTransition('Schedule has ended');
        await repo.deleteFutureOfSchedule(schedule.id);
        await repo.replaceSchedule(schedule.id, input);
        await repo.generate([schedule.id]);
      });
      logger.info({ userId, classId, scheduleId }, 'Schedule replaced');
    },

    /** Dừng lịch: không sinh thêm, xóa các buổi tương lai còn `scheduled` của lịch. */
    async endSchedule(userId: string, classId: string, scheduleId: string): Promise<void> {
      await withTutorClass(userId, classId, async ({ manager, cls }) => {
        const repo = createLessonsRepository(manager);
        const schedule = await repo.findSchedule(cls.id, scheduleId);
        if (!schedule) throw notFound('Schedule');
        if (schedule.status !== 'active') throw invalidStateTransition('Schedule has ended');
        await repo.deleteFutureOfSchedule(schedule.id);
        await repo.endSchedule(schedule.id);
      });
      logger.info({ userId, classId, scheduleId }, 'Schedule ended');
    },

    // ---- Xem lịch --------------------------------------------------------------------------------

    /** Buổi trong khoảng [from, to) của mọi lớp U thấy. */
    async list(userId: string, query: LessonListQuery): Promise<LessonList> {
      const manager = dataSource.manager;
      const views = groupRows(
        await createClassesRepository(manager).allVisibleRows(userId, {
          classId: query.classId,
          learnerId: query.learnerId,
        }),
      );
      const repo = createLessonsRepository(manager);
      const lessons = await repo.lessonsInRange(
        [...views.keys()],
        new Date(query.from),
        new Date(query.to),
      );
      const attendances = await repo.attendancesOf(lessons.map((l) => l.id));
      return { items: lessons.map((l) => toLessonDto(l, views.get(l.classId)!, attendances)) };
    },

    /** Việc cần làm: gia sư thấy buổi chưa điểm danh, phụ huynh thấy buổi chờ xác nhận. */
    async todo(userId: string, classId?: string): Promise<LessonList> {
      const manager = dataSource.manager;
      const views = groupRows(
        await createClassesRepository(manager).allVisibleRows(userId, { classId }),
      );
      const repo = createLessonsRepository(manager);
      const tutorClasses = [...views.values()]
        .filter((v) => v.role === 'tutor' && v.status !== 'ended')
        .map((v) => v.classId);
      const clientEnrollments = [...views.values()]
        .filter((v) => v.role === 'client')
        .flatMap((v) => [...v.learnerNames.keys()]);
      const lessons = [
        ...(await repo.awaitingAttendance(tutorClasses)),
        ...(await repo.awaitingConfirmation(clientEnrollments)),
      ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      const attendances = await repo.attendancesOf(lessons.map((l) => l.id));
      return { items: lessons.map((l) => toLessonDto(l, views.get(l.classId)!, attendances)) };
    },

    get: loadLessonDetail,

    // ---- Buổi lẻ, dời, hủy -----------------------------------------------------------------------

    /** Gia sư tạo buổi lẻ hoặc buổi bù (B.6). Lớp phải đang học. */
    async createLesson(
      userId: string,
      classId: string,
      input: CreateLessonRequest,
    ): Promise<LessonDetail> {
      const startsAt = new Date(input.startsAt);
      assertLessonTime(startsAt, { future: false });
      const id = await withTutorClass(userId, classId, async ({ manager, cls }) => {
        if (cls.status !== 'active') throw invalidStateTransition(`Class is ${cls.status}`);
        // Không xếp buổi trước ngày bắt đầu lớp (chưa có học sinh nào để điểm danh).
        if (localDate(startsAt) < cls.startedOn) {
          throw fieldError(
            'startsAt',
            'lesson_time_out_of_range',
            'Lesson is before the class start',
          );
        }
        const repo = createLessonsRepository(manager);
        if (input.makeupForLessonId) {
          const original = await repo.findLesson(input.makeupForLessonId);
          if (
            !original ||
            original.classId !== cls.id ||
            (original.status !== 'cancelled' && original.status !== 'tutor_absent')
          ) {
            throw fieldError('makeupForLessonId', 'makeup_invalid', 'Not a missed lesson');
          }
        }
        const lesson = await repo.createLesson({
          classId: cls.id,
          tutorId: cls.tutorId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000),
          teachingMode: input.teachingMode,
          locationNote: input.locationNote,
          onlineUrl: input.onlineUrl,
          makeupForLessonId: input.makeupForLessonId,
          createdBy: userId,
        });
        return lesson.id;
      });
      logger.info({ userId, classId, lessonId: id }, 'Lesson created');
      return loadLessonDetail(userId, id);
    },

    /** Gia sư dời giờ / đổi hình thức của buổi chưa diễn ra; báo phụ huynh và học sinh khi dời giờ. */
    async updateLesson(
      userId: string,
      lessonId: string,
      input: UpdateLessonRequest,
    ): Promise<LessonDetail> {
      let pending: PendingNotification[] = [];
      await dataSource.transaction(async (manager) => {
        const { lesson, view } = await lessonContext(manager, userId, lessonId, { lock: true });
        requireRole(view, ['tutor']);
        if (view.status === 'ended') throw classEnded();
        if (lesson.status !== 'scheduled' || lesson.startsAt.getTime() <= Date.now()) {
          throw invalidStateTransition('Only upcoming lessons can be changed');
        }
        const startsAt = input.startsAt ? new Date(input.startsAt) : lesson.startsAt;
        if (input.startsAt) assertLessonTime(startsAt, { future: true });
        const minutes =
          input.durationMinutes ?? (lesson.endsAt.getTime() - lesson.startsAt.getTime()) / 60_000;
        const moved =
          startsAt.getTime() !== lesson.startsAt.getTime() ||
          minutes * 60_000 !== lesson.endsAt.getTime() - lesson.startsAt.getTime();
        const changes: Partial<LessonRow> = {
          startsAt,
          endsAt: new Date(startsAt.getTime() + minutes * 60_000),
        };
        if (input.teachingMode !== undefined) changes.teachingMode = input.teachingMode;
        if (input.locationNote !== undefined) changes.locationNote = input.locationNote;
        if (input.onlineUrl !== undefined) changes.onlineUrl = input.onlineUrl;
        if (moved) changes.upcomingRemindedAt = null;
        await createLessonsRepository(manager).updateLesson(lesson.id, changes);
        if (moved) {
          pending = await notifyClass(manager, lesson.classId, ['clients', 'students'], (base) => ({
            type: 'lesson_changed',
            data: {
              ...base,
              lessonId: lesson.id,
              startsAt: startsAt.toISOString(),
              change: 'rescheduled',
            },
          }));
        }
      });
      await notifier.dispatch(pending);
      return loadLessonDetail(userId, lessonId);
    },

    /**
     * Gia sư hoặc phụ huynh hủy buổi chưa diễn ra, kèm lý do (B.6). Báo dưới 2 giờ trước giờ học là hủy muộn (C5).
     * Báo bên còn lại và học sinh.
     */
    async cancelLesson(userId: string, lessonId: string, reason: string): Promise<LessonDetail> {
      let pending: PendingNotification[] = [];
      await dataSource.transaction(async (manager) => {
        const { lesson, view } = await lessonContext(manager, userId, lessonId, { lock: true });
        requireRole(view, ['tutor', 'client']);
        if (lesson.status !== 'scheduled' || lesson.startsAt.getTime() <= Date.now()) {
          throw invalidStateTransition('Only upcoming lessons can be cancelled');
        }
        const late =
          lesson.startsAt.getTime() - Date.now() < LESSON_LIMITS.lateCancelHours * HOUR_MS;
        await createLessonsRepository(manager).updateLesson(lesson.id, {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: userId,
          cancelKind: 'party',
          cancelReason: reason,
          isLateCancellation: late,
        });
        const to: ClassRecipient[] =
          view.role === 'tutor' ? ['clients', 'students'] : ['tutor', 'clients', 'students'];
        pending = await notifyClass(
          manager,
          lesson.classId,
          to,
          (base) => ({
            type: 'lesson_changed',
            data: {
              ...base,
              lessonId: lesson.id,
              startsAt: lesson.startsAt.toISOString(),
              change: 'cancelled',
            },
          }),
          {
            except: userId,
            ...(view.role === 'client' ? { actorName: await displayName(manager, userId) } : {}),
          },
        );
      });
      await notifier.dispatch(pending);
      logger.info({ userId, lessonId }, 'Lesson cancelled');
      return loadLessonDetail(userId, lessonId);
    },

    // ---- Điểm danh (B.6, B.7) --------------------------------------------------------------------

    /**
     * Gia sư điểm danh sau giờ bắt đầu: buổi `held` (từng học sinh) hoặc `tutor_absent` (mọi học sinh
     * `not_applicable`, không tính tiền). Chụp giá học phí đang áp dụng (D17). Hạn xác nhận 48 giờ (C5).
     * Gửi lại khi chưa ai xác nhận là sửa điểm danh: hạn tính lại từ đầu, báo phụ huynh (D37). Đang có khiếu nại mở:
     * gia sư sửa được để hai bên thống nhất, hạn không đổi.
     */
    async recordAttendance(
      userId: string,
      lessonId: string,
      input: RecordAttendanceRequest,
    ): Promise<LessonDetail> {
      let pending: PendingNotification[] = [];
      await dataSource.transaction(async (manager) => {
        const { lesson, view } = await lessonContext(manager, userId, lessonId, { lock: true });
        requireRole(view, ['tutor']);
        const repo = createLessonsRepository(manager);
        const existing = await repo.attendancesOf([lesson.id]);

        let resetDue = true;
        if (lesson.status === 'scheduled') {
          if (lesson.startsAt.getTime() > Date.now()) {
            throw invalidStateTransition('Lesson has not started yet');
          }
        } else if (lesson.status === 'held' || lesson.status === 'tutor_absent') {
          const allPending = existing.every((a) => a.confirmationStatus === 'pending');
          const disputedOpen =
            existing.length > 0 &&
            existing.every((a) => a.confirmationStatus === 'disputed') &&
            (await Promise.all(existing.map((a) => repo.findActiveDispute(a.id)))).every(
              (d) => d?.status === 'open',
            );
          if (!allPending && !disputedOpen) {
            throw invalidStateTransition('Attendance is already confirmed or under review');
          }
          resetDue = allPending;
        } else {
          throw invalidStateTransition(`Lesson is ${lesson.status}`);
        }

        const enrollments = await repo.enrollmentsForLesson(lesson.id);
        if (enrollments.length === 0)
          throw invalidStateTransition('No learner was enrolled on this day');
        const byEnrollment = new Map(input.attendances.map((a) => [a.enrollmentId, a]));
        if (input.outcome === 'held') {
          if (
            input.attendances.some(
              (a) => !enrollments.some((e) => e.enrollmentId === a.enrollmentId),
            )
          ) {
            throw fieldError('attendances', 'unknown_option', 'Unknown enrollment');
          }
          if (enrollments.some((e) => !byEnrollment.has(e.enrollmentId))) {
            throw fieldError(
              'attendances',
              'attendance_incomplete',
              'Every learner needs a status',
            );
          }
        }
        const lessonMinutes = Math.round(
          (lesson.endsAt.getTime() - lesson.startsAt.getTime()) / 60_000,
        );
        const writes: AttendanceWrite[] = enrollments.map((e) => {
          const given = byEnrollment.get(e.enrollmentId);
          const status = input.outcome === 'tutor_absent' ? 'not_applicable' : given!.status;
          const price = e.activePrice ?? 0;
          // Tính tiền ở bản đầu (C5): chỉ buổi đã dạy và học sinh có mặt.
          const billable = input.outcome === 'held' && status === 'present';
          return {
            enrollmentId: e.enrollmentId,
            status,
            comment: input.outcome === 'tutor_absent' ? null : (given?.comment ?? null),
            feeRateId: e.activeRateId,
            sessionPriceVnd: price,
            sessionMinutes: e.activeMinutes ?? Math.min(Math.max(lessonMinutes, 15), 600),
            isBillable: billable,
            billableAmountVnd: billable ? price : 0,
          };
        });
        const now = new Date();
        await repo.updateLesson(lesson.id, {
          status: input.outcome,
          contentTaught: input.contentTaught,
          tutorNotes: input.notes,
          actualMinutes: input.actualMinutes,
          recordedAt: now,
          recordedBy: userId,
        });
        const due = new Date(now.getTime() + LESSON_LIMITS.confirmHours * HOUR_MS);
        await repo.upsertAttendances(lesson.id, writes, resetDue ? due : null);
        if (resetDue) {
          pending = await notifyClass(manager, lesson.classId, ['clients'], (base) => ({
            type: 'lesson_to_confirm',
            data: {
              ...base,
              lessonId: lesson.id,
              startsAt: lesson.startsAt.toISOString(),
              confirmDueAt: due.toISOString(),
              reminder: false,
            },
          }));
        }
      });
      await notifier.dispatch(pending);
      logger.info({ userId, lessonId, outcome: input.outcome }, 'Attendance recorded');
      return loadLessonDetail(userId, lessonId);
    },

    /** Phụ huynh xác nhận điểm danh trước hạn (C5). */
    async confirmAttendance(
      userId: string,
      lessonId: string,
      attendanceId: string,
    ): Promise<LessonDetail> {
      await dataSource.transaction(async (manager) => {
        const { attendance } = await clientAttendance(manager, userId, lessonId, attendanceId);
        if (attendance.confirmationStatus !== 'pending') {
          throw invalidStateTransition(`Attendance is ${attendance.confirmationStatus}`);
        }
        if (attendance.confirmDueAt.getTime() <= Date.now()) {
          throw invalidStateTransition('The confirmation period has ended');
        }
        await createLessonsRepository(manager).updateAttendance(attendance.id, {
          confirmationStatus: 'confirmed',
          confirmedAt: new Date(),
          confirmedBy: userId,
        });
      });
      logger.info({ userId, lessonId, attendanceId }, 'Attendance confirmed');
      return loadLessonDetail(userId, lessonId);
    },

    /** Phụ huynh khiếu nại trước hạn (C5): điểm danh sang `disputed`, hai bên có 3 ngày tự thống nhất. */
    async openDispute(
      userId: string,
      lessonId: string,
      attendanceId: string,
      input: OpenDisputeRequest,
    ): Promise<LessonDetail> {
      let pending: PendingNotification[] = [];
      await dataSource.transaction(async (manager) => {
        const { attendance, lesson } = await clientAttendance(
          manager,
          userId,
          lessonId,
          attendanceId,
        );
        if (attendance.confirmationStatus !== 'pending') {
          throw invalidStateTransition(`Attendance is ${attendance.confirmationStatus}`);
        }
        if (attendance.confirmDueAt.getTime() <= Date.now()) {
          throw invalidStateTransition('The confirmation period has ended');
        }
        const repo = createLessonsRepository(manager);
        await repo.updateAttendance(attendance.id, { confirmationStatus: 'disputed' });
        await repo.openDispute({
          attendanceId: attendance.id,
          openedBy: userId,
          reason: input.reason,
          claimedStatus: input.claimedStatus,
          negotiateUntil: new Date(Date.now() + LESSON_LIMITS.disputeNegotiateDays * DAY_MS),
        });
        pending = await disputeNotice(manager, lesson, 'opened', ['tutor'], {
          actorName: await displayName(manager, userId),
        });
      });
      await notifier.dispatch(pending);
      logger.info({ userId, lessonId, attendanceId }, 'Attendance disputed');
      return loadLessonDetail(userId, lessonId);
    },

    /**
     * Kết thúc khiếu nại đang mở do phụ huynh: đồng ý điểm danh hiện tại (gia sư có thể đã sửa;
     * `settled_by_parties`) hoặc rút khiếu nại (`withdrawn`). Điểm danh → `resolved` (B.8).
     */
    async closeDispute(
      userId: string,
      lessonId: string,
      attendanceId: string,
      outcome: 'settle' | 'withdraw',
    ): Promise<LessonDetail> {
      let pending: PendingNotification[] = [];
      await dataSource.transaction(async (manager) => {
        const { attendance, lesson } = await clientAttendance(
          manager,
          userId,
          lessonId,
          attendanceId,
        );
        const repo = createLessonsRepository(manager);
        const dispute = await repo.findActiveDispute(attendance.id);
        if (!dispute || dispute.status !== 'open') {
          throw invalidStateTransition('No open dispute');
        }
        const now = new Date();
        await repo.updateDispute(dispute.id, {
          status: outcome === 'settle' ? 'settled_by_parties' : 'withdrawn',
          resolvedAt: now,
        });
        await repo.updateAttendance(attendance.id, {
          confirmationStatus: 'resolved',
          confirmedAt: now,
          confirmedBy: userId,
        });
        pending = await disputeNotice(
          manager,
          lesson,
          outcome === 'settle' ? 'settled' : 'withdrawn',
          ['tutor'],
          { actorName: await displayName(manager, userId) },
        );
      });
      await notifier.dispatch(pending);
      logger.info({ userId, lessonId, attendanceId, outcome }, 'Dispute closed by client');
      return loadLessonDetail(userId, lessonId);
    },

    /** Gia sư hoặc phụ huynh chuyển khiếu nại cho Manager trước hạn 3 ngày (D38). */
    async escalateDispute(
      userId: string,
      lessonId: string,
      attendanceId: string,
    ): Promise<LessonDetail> {
      let pending: PendingNotification[] = [];
      await dataSource.transaction(async (manager) => {
        const { attendance, lesson, view } = await clientAttendance(
          manager,
          userId,
          lessonId,
          attendanceId,
          ['tutor', 'client'],
        );
        const repo = createLessonsRepository(manager);
        const dispute = await repo.findActiveDispute(attendance.id);
        if (!dispute || dispute.status !== 'open') {
          throw invalidStateTransition('No open dispute');
        }
        await repo.updateDispute(dispute.id, { status: 'escalated', escalatedAt: new Date() });
        pending = await disputeNotice(manager, lesson, 'escalated', ['tutor', 'clients'], {
          except: userId,
          ...(view.role === 'client' ? { actorName: await displayName(manager, userId) } : {}),
        });
      });
      await notifier.dispatch(pending);
      logger.info({ userId, lessonId, attendanceId }, 'Dispute escalated');
      return loadLessonDetail(userId, lessonId);
    },

    // ---- Điểm và nhận xét (§9) -------------------------------------------------------------------

    /** Gia sư ghi điểm và nhận xét cho một học sinh; báo phụ huynh và học sinh. */
    async createAssessment(
      userId: string,
      classId: string,
      enrollmentId: string,
      input: CreateAssessmentRequest,
    ): Promise<Assessment> {
      let pending: PendingNotification[] = [];
      const created = await withTutorClass(userId, classId, async ({ manager, cls, rows }) => {
        if (!rows.some((r) => r.enrollmentId === enrollmentId)) throw notFound('Enrollment');
        const repo = createLessonsRepository(manager);
        if (input.lessonId) {
          const lesson = await repo.findLesson(input.lessonId);
          if (!lesson || lesson.classId !== cls.id || lesson.status !== 'held') {
            throw fieldError('lessonId', 'invalid', 'Not a held lesson of this class');
          }
        }
        const row = await repo.createAssessment({
          enrollmentId,
          lessonId: input.lessonId,
          kind: input.kind,
          title: input.title,
          score: input.score,
          maxScore: input.maxScore,
          comment: input.comment,
          assessedOn: input.assessedOn,
          createdBy: userId,
        });
        pending = await notifyClass(
          manager,
          cls.id,
          ['clients', 'students'],
          (base) => ({ type: 'assessment_new', data: { ...base, assessmentId: row.id } }),
          { enrollmentId },
        );
        return row;
      });
      await notifier.dispatch(pending);
      return toAssessmentDto(created);
    },

    /** Gia sư sửa điểm và nhận xét. Điểm phải không vượt điểm tối đa sau khi sửa. */
    async updateAssessment(
      userId: string,
      classId: string,
      enrollmentId: string,
      assessmentId: string,
      input: UpdateAssessmentRequest,
    ): Promise<Assessment> {
      return withTutorClass(userId, classId, async ({ manager, rows }) => {
        if (!rows.some((r) => r.enrollmentId === enrollmentId)) throw notFound('Enrollment');
        const repo = createLessonsRepository(manager);
        const row = await repo.findAssessment(enrollmentId, assessmentId);
        if (!row) throw notFound('Assessment');
        const score =
          input.score !== undefined ? input.score : row.score === null ? null : Number(row.score);
        const maxScore = input.maxScore ?? Number(row.maxScore);
        if (score !== null && score > maxScore) {
          throw fieldError('score', 'score_above_max', 'Score is above the maximum');
        }
        const changes: Partial<AssessmentRow> = {
          score: score === null ? null : String(score),
          maxScore: String(maxScore),
        };
        if (input.kind !== undefined) changes.kind = input.kind;
        if (input.title !== undefined) changes.title = input.title;
        if (input.comment !== undefined) changes.comment = input.comment;
        if (input.assessedOn !== undefined) changes.assessedOn = input.assessedOn;
        await repo.updateAssessment(row.id, changes);
        return toAssessmentDto((await repo.findAssessment(enrollmentId, assessmentId))!);
      });
    },

    // ---- Manager xử lý khiếu nại (B.8) ---------------------------------------------------------

    async adminList(query: AdminDisputeListQuery): Promise<AdminDisputeList> {
      const pageSize = 20;
      const repo = createLessonsRepository(dataSource.manager);
      const { ids, total } = await repo.adminDisputes(query.status, query.page, pageSize);
      const rows = await repo.adminDisputeRows(ids);
      const byId = new Map(rows.map((r) => [r.id, r]));
      return {
        items: ids.flatMap((id) => {
          const row = byId.get(id);
          return row ? [toAdminDispute(row)] : [];
        }),
        page: query.page,
        pageSize,
        total,
      };
    },

    adminGet,

    /**
     * Manager quyết định khiếu nại đã chuyển (B.8): chỉ sửa bản ghi buổi và điểm danh, không hoàn tiền (D6); tính
     * lại tiền theo quy tắc C5; điểm danh → `resolved`; ghi audit log; báo hai bên.
     */
    async adminResolve(
      actor: { userId: string; ipAddress: string | null },
      disputeId: string,
      input: ResolveDisputeRequest,
    ): Promise<AdminDispute> {
      let pending: PendingNotification[] = [];
      await dataSource.transaction(async (manager) => {
        const repo = createLessonsRepository(manager);
        const dispute = await repo.findDispute(disputeId, { lock: true });
        if (!dispute) throw notFound('Dispute');
        if (dispute.status !== 'escalated') {
          throw invalidStateTransition(`Dispute is ${dispute.status}`);
        }
        const [attendance] = await manager.query<{ lesson_id: string }[]>(
          `SELECT lesson_id FROM lesson_attendances WHERE id = $1`,
          [dispute.attendanceId],
        );
        const lesson = await repo.findLesson(attendance!.lesson_id, { lock: true });
        if (!lesson) throw notFound('Lesson');
        const current = (await repo.attendancesOf([lesson.id])).find(
          (a) => a.id === dispute.attendanceId,
        )!;
        const billable = input.lessonStatus === 'held' && input.attendanceStatus === 'present';
        const now = new Date();
        await repo.updateLesson(lesson.id, { status: input.lessonStatus });
        await repo.updateAttendance(current.id, {
          status: input.attendanceStatus,
          isBillable: billable,
          billableAmountVnd: billable ? Number(current.sessionPriceVnd) : 0,
          confirmationStatus: 'resolved',
          confirmedAt: now,
          confirmedBy: null,
        });
        await repo.updateDispute(dispute.id, {
          status: 'resolved_by_manager',
          resolutionNote: input.note,
          resolvedBy: actor.userId,
          resolvedAt: now,
        });
        await createAuditRepository(manager).record({
          actorUserId: actor.userId,
          actorRole: 'manager',
          action: 'attendance_dispute.resolved',
          entityType: 'attendance_dispute',
          entityId: dispute.id,
          metadata: {
            lessonId: lesson.id,
            from: { lessonStatus: lesson.status, attendanceStatus: current.status },
            to: { lessonStatus: input.lessonStatus, attendanceStatus: input.attendanceStatus },
          },
          ipAddress: actor.ipAddress,
        });
        pending = await disputeNotice(manager, lesson, 'resolved', ['tutor', 'clients'], {
          actorName: null,
        });
      });
      await notifier.dispatch(pending);
      logger.info({ managerId: actor.userId, disputeId }, 'Dispute resolved by manager');
      return adminGet(disputeId);
    },
  };
}

function toAdminDispute(
  row: Awaited<ReturnType<ReturnType<typeof createLessonsRepository>['adminDisputeRows']>>[number],
): AdminDispute {
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    claimedStatus: row.claimed_status,
    negotiateUntil: row.negotiate_until.toISOString(),
    createdAt: row.created_at.toISOString(),
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    subjectId: row.subject_id,
    tutorName: row.tutor_name,
    clientName: row.client_name,
    lesson: {
      id: row.lesson_id,
      status: row.lesson_status,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at.toISOString(),
      contentTaught: row.content_taught,
      actualMinutes: row.actual_minutes,
    },
    attendance: {
      id: row.attendance_id,
      status: row.attendance_status,
      comment: row.tutor_comment,
      sessionPriceVnd: Number(row.session_price_vnd),
    },
  };
}

export type LessonsService = ReturnType<typeof createLessonsService>;
