import {
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
import { type RequestHandler, Router } from 'express';
import { requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import type { LessonsController } from './lessons.controller.js';

/**
 * Đường dẫn của lịch, buổi học, điểm trong một lớp, gắn vào router `/classes` (cùng xác thực và vai trò).
 *
 *   POST  /:classId/schedules                                        201  gia sư thêm lịch lặp (trả chi tiết lớp)
 *   PUT   /:classId/schedules/:scheduleId                            200  gia sư sửa lịch (sinh lại buổi tương lai)
 *   POST  /:classId/schedules/:scheduleId/end                        200  gia sư dừng lịch
 *   POST  /:classId/lessons                                          201  gia sư tạo buổi lẻ / buổi bù
 *   POST  /:classId/enrollments/:enrollmentId/assessments            201  gia sư ghi điểm và nhận xét
 *   PATCH /:classId/enrollments/:enrollmentId/assessments/:assessmentId  200  gia sư sửa
 */
export function mountClassLessonRoutes(router: Router, controller: LessonsController): void {
  router.post(
    '/:classId/schedules',
    validate({ params: ClassIdParams, body: ScheduleInput }),
    controller.createSchedule,
  );
  router.put(
    '/:classId/schedules/:scheduleId',
    validate({ params: ScheduleParams, body: ScheduleInput }),
    controller.replaceSchedule,
  );
  router.post(
    '/:classId/schedules/:scheduleId/end',
    validate({ params: ScheduleParams }),
    controller.endSchedule,
  );
  router.post(
    '/:classId/lessons',
    validate({ params: ClassIdParams, body: CreateLessonRequest }),
    controller.createLesson,
  );
  router.post(
    '/:classId/enrollments/:enrollmentId/assessments',
    validate({ params: EnrollmentParams, body: CreateAssessmentRequest }),
    controller.createAssessment,
  );
  router.patch(
    '/:classId/enrollments/:enrollmentId/assessments/:assessmentId',
    validate({ params: AssessmentParams, body: UpdateAssessmentRequest }),
    controller.updateAssessment,
  );
}

/**
 * /api/v1/lessons: buổi học của các lớp mà người đang đăng nhập có vai trò (gia sư, phụ huynh, học sinh). Buổi của lớp
 * khác: 404; thao tác không dành cho vai trò của mình: 403; trạng thái không cho phép: 409.
 *
 *   GET  /                                                    200  lịch [from, to) (?from=&to=&classId=&learnerId=)
 *   GET  /todo                                                200  việc cần làm (gia sư: chưa điểm danh; phụ huynh:
 *                                                                  chờ xác nhận)
 *   GET  /:lessonId                                           200  chi tiết (điểm danh, khiếu nại, điểm của buổi)
 *   PATCH /:lessonId                                          200  gia sư dời giờ, đổi hình thức, địa điểm
 *   POST /:lessonId/cancel                                    200  gia sư hoặc phụ huynh hủy (dưới 2 giờ: hủy muộn)
 *   PUT  /:lessonId/attendance                                200  gia sư điểm danh / sửa điểm danh (D37)
 *   POST /:lessonId/attendances/:attendanceId/confirm         200  phụ huynh xác nhận (C5)
 *   POST /:lessonId/attendances/:attendanceId/dispute         200  phụ huynh khiếu nại
 *   POST /:lessonId/attendances/:attendanceId/dispute/settle | /withdraw   200  phụ huynh đồng ý / rút khiếu nại
 *   POST /:lessonId/attendances/:attendanceId/dispute/escalate             200  một bên chuyển Manager (D38)
 */
export function lessonsRouter(controller: LessonsController, authenticate: RequestHandler): Router {
  const router = Router();
  router.use(authenticate, requireRole('tutor', 'parent', 'student'));
  const lesson = { params: LessonIdParams };
  const attendance = { params: AttendanceParams };
  router.get('/', validate({ query: LessonListQuery }), controller.list);
  router.get('/todo', validate({ query: LessonTodoQuery }), controller.todo);
  router.get('/:lessonId', validate(lesson), controller.get);
  router.patch('/:lessonId', validate({ ...lesson, body: UpdateLessonRequest }), controller.update);
  router.post(
    '/:lessonId/cancel',
    validate({ ...lesson, body: CancelLessonRequest }),
    controller.cancel,
  );
  router.put(
    '/:lessonId/attendance',
    validate({ ...lesson, body: RecordAttendanceRequest }),
    controller.recordAttendance,
  );
  router.post(
    '/:lessonId/attendances/:attendanceId/confirm',
    validate(attendance),
    controller.confirm,
  );
  router.post(
    '/:lessonId/attendances/:attendanceId/dispute',
    validate({ ...attendance, body: OpenDisputeRequest }),
    controller.dispute,
  );
  router.post(
    '/:lessonId/attendances/:attendanceId/dispute/settle',
    validate(attendance),
    controller.settleDispute,
  );
  router.post(
    '/:lessonId/attendances/:attendanceId/dispute/withdraw',
    validate(attendance),
    controller.withdrawDispute,
  );
  router.post(
    '/:lessonId/attendances/:attendanceId/dispute/escalate',
    validate(attendance),
    controller.escalate,
  );
  return router;
}

/**
 * /api/v1/admin/attendance-disputes: Manager xử lý khiếu nại buổi học đã chuyển (B.8). Không có danh tính của trẻ,
 * không có tin nhắn. Quyết định ghi audit log.
 *
 *   GET  /                         200  hàng chờ (?status=escalated|resolved_by_manager&page=)
 *   GET  /:disputeId               200  chi tiết
 *   POST /:disputeId/resolve       200  quyết định `{ lessonStatus, attendanceStatus, note }`
 */
export function disputeReviewRouter(
  controller: LessonsController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate, requireRole('manager'));
  router.get('/', validate({ query: AdminDisputeListQuery }), controller.adminList);
  router.get('/:disputeId', validate({ params: DisputeIdParams }), controller.adminGet);
  router.post(
    '/:disputeId/resolve',
    validate({ params: DisputeIdParams, body: ResolveDisputeRequest }),
    controller.adminResolve,
  );
  return router;
}
