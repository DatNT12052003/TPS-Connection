import type {
  AdminDisputeListQuery,
  AssessmentParams,
  AttendanceParams,
  CancelLessonRequest,
  ClassIdParams,
  CreateAssessmentRequest,
  CreateLessonRequest,
  DisputeIdParams,
  EnrollmentParams,
  LessonIdParams,
  LessonListQuery,
  LessonTodoQuery,
  OpenDisputeRequest,
  RecordAttendanceRequest,
  ResolveDisputeRequest,
  ScheduleInput,
  ScheduleParams,
  UpdateAssessmentRequest,
  UpdateLessonRequest,
} from '@tps/shared';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { ClassesService } from '../classes/classes.service.js';
import type { LessonsService } from './lessons.service.js';

const userIdOf = (req: Parameters<typeof requireAuth>[0]) => requireAuth(req).user.id;

/** HTTP cho lịch, buổi học, điểm danh, khiếu nại, điểm (`/classes/:classId/...`, `/lessons`, Manager). */
export function createLessonsController(deps: {
  lessons: LessonsService;
  classes: ClassesService;
}) {
  const { lessons, classes } = deps;

  // ---- Lịch lặp (trả chi tiết lớp: lịch nằm trong `schedules`) ----------------------------------

  const createSchedule: RequestHandler<ClassIdParams, unknown, ScheduleInput> = async (
    req,
    res,
  ) => {
    const userId = userIdOf(req);
    await lessons.createSchedule(userId, req.params.classId, req.body);
    res.status(201).json(await classes.get(userId, req.params.classId));
  };

  const replaceSchedule: RequestHandler<ScheduleParams, unknown, ScheduleInput> = async (
    req,
    res,
  ) => {
    const userId = userIdOf(req);
    await lessons.replaceSchedule(userId, req.params.classId, req.params.scheduleId, req.body);
    res.json(await classes.get(userId, req.params.classId));
  };

  const endSchedule: RequestHandler<ScheduleParams> = async (req, res) => {
    const userId = userIdOf(req);
    await lessons.endSchedule(userId, req.params.classId, req.params.scheduleId);
    res.json(await classes.get(userId, req.params.classId));
  };

  // ---- Buổi học ----------------------------------------------------------------------------------

  const list: RequestHandler = async (req, res) => {
    res.json(await lessons.list(userIdOf(req), req.query as unknown as LessonListQuery));
  };

  const todo: RequestHandler = async (req, res) => {
    const query = req.query as unknown as LessonTodoQuery;
    res.json(await lessons.todo(userIdOf(req), query.classId));
  };

  const get: RequestHandler<LessonIdParams> = async (req, res) => {
    res.json(await lessons.get(userIdOf(req), req.params.lessonId));
  };

  const createLesson: RequestHandler<ClassIdParams, unknown, CreateLessonRequest> = async (
    req,
    res,
  ) => {
    res.status(201).json(await lessons.createLesson(userIdOf(req), req.params.classId, req.body));
  };

  const update: RequestHandler<LessonIdParams, unknown, UpdateLessonRequest> = async (req, res) => {
    res.json(await lessons.updateLesson(userIdOf(req), req.params.lessonId, req.body));
  };

  const cancel: RequestHandler<LessonIdParams, unknown, CancelLessonRequest> = async (req, res) => {
    res.json(await lessons.cancelLesson(userIdOf(req), req.params.lessonId, req.body.reason));
  };

  const recordAttendance: RequestHandler<LessonIdParams, unknown, RecordAttendanceRequest> = async (
    req,
    res,
  ) => {
    res.json(await lessons.recordAttendance(userIdOf(req), req.params.lessonId, req.body));
  };

  const confirm: RequestHandler<AttendanceParams> = async (req, res) => {
    const { lessonId, attendanceId } = req.params;
    res.json(await lessons.confirmAttendance(userIdOf(req), lessonId, attendanceId));
  };

  const dispute: RequestHandler<AttendanceParams, unknown, OpenDisputeRequest> = async (
    req,
    res,
  ) => {
    const { lessonId, attendanceId } = req.params;
    res.json(await lessons.openDispute(userIdOf(req), lessonId, attendanceId, req.body));
  };

  const closeDispute =
    (outcome: 'settle' | 'withdraw'): RequestHandler<AttendanceParams> =>
    async (req, res) => {
      const { lessonId, attendanceId } = req.params;
      res.json(await lessons.closeDispute(userIdOf(req), lessonId, attendanceId, outcome));
    };

  const escalate: RequestHandler<AttendanceParams> = async (req, res) => {
    const { lessonId, attendanceId } = req.params;
    res.json(await lessons.escalateDispute(userIdOf(req), lessonId, attendanceId));
  };

  // ---- Điểm và nhận xét --------------------------------------------------------------------------

  const createAssessment: RequestHandler<
    EnrollmentParams,
    unknown,
    CreateAssessmentRequest
  > = async (req, res) => {
    const { classId, enrollmentId } = req.params;
    res
      .status(201)
      .json(await lessons.createAssessment(userIdOf(req), classId, enrollmentId, req.body));
  };

  const updateAssessment: RequestHandler<
    AssessmentParams,
    unknown,
    UpdateAssessmentRequest
  > = async (req, res) => {
    const { classId, enrollmentId, assessmentId } = req.params;
    res.json(
      await lessons.updateAssessment(userIdOf(req), classId, enrollmentId, assessmentId, req.body),
    );
  };

  // ---- Manager -----------------------------------------------------------------------------------

  const adminList: RequestHandler = async (req, res) => {
    res.json(await lessons.adminList(req.query as unknown as AdminDisputeListQuery));
  };

  const adminGet: RequestHandler<DisputeIdParams> = async (req, res) => {
    res.json(await lessons.adminGet(req.params.disputeId));
  };

  const adminResolve: RequestHandler<DisputeIdParams, unknown, ResolveDisputeRequest> = async (
    req,
    res,
  ) => {
    res.json(
      await lessons.adminResolve(
        { userId: userIdOf(req), ipAddress: req.ip ?? null },
        req.params.disputeId,
        req.body,
      ),
    );
  };

  return {
    createSchedule,
    replaceSchedule,
    endSchedule,
    list,
    todo,
    get,
    createLesson,
    update,
    cancel,
    recordAttendance,
    confirm,
    dispute,
    settleDispute: closeDispute('settle'),
    withdrawDispute: closeDispute('withdraw'),
    escalate,
    createAssessment,
    updateAssessment,
    adminList,
    adminGet,
    adminResolve,
  };
}

export type LessonsController = ReturnType<typeof createLessonsController>;
