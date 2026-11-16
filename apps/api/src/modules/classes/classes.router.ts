import {
  ClassIdParams,
  ClassListQuery,
  CreateLearningGoalRequest,
  EndClassRequest,
  EnrollmentParams,
  FeeRateParams,
  LearningGoalParams,
  ProposeFeeRateRequest,
  UpdateClassRequest,
  UpdateEnrollmentNotesRequest,
  UpdateLearningGoalRequest,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import type { ClassesController } from './classes.controller.js';

/**
 * /api/v1/classes: lớp mà người đang đăng nhập là gia sư, phụ huynh của học sinh, hoặc chính học sinh. Lớp khác: 404.
 * Thao tác không dành cho vai trò của mình trong lớp: 403. Lớp đã kết thúc chỉ còn xem: 409.
 *
 *   GET   /                                                       200  lớp của tôi (?as=tutor|client|student
 *                                                                      &state=current|ended&learnerId=&page=&pageSize=)
 *   GET   /:classId                                               200  chi tiết
 *   PATCH /:classId                                               200  gia sư đặt tên lớp `{ name }`
 *   POST  /:classId/pause | /resume                               200  gia sư tạm nghỉ / cho học lại (D35)
 *   POST  /:classId/end                                           200  gia sư kết thúc lớp `{ reason }`
 *   PATCH /:classId/enrollments/:enrollmentId                     200  gia sư ghi năng lực ban đầu, lưu ý giảng dạy
 *   POST  /:classId/enrollments/:enrollmentId/fee-rates           201  gia sư đề xuất học phí mới (D17);
 *                                                                      đang có đề xuất: 409 fee_change_pending
 *   POST  /:classId/enrollments/:enrollmentId/fee-rates/:rateId/accept | /reject   200  phụ huynh
 *   POST  /:classId/enrollments/:enrollmentId/fee-rates/:rateId/withdraw           200  gia sư
 *   POST  /:classId/enrollments/:enrollmentId/goals               201  gia sư thêm mục tiêu
 *   PATCH /:classId/enrollments/:enrollmentId/goals/:goalId       200  gia sư sửa mục tiêu, kết quả, tiến độ
 *
 * Quản lý lớp không cần tài khoản `active`: tài khoản bị hạn chế (B.9.3) vẫn dạy và ghi nhận lớp đang có.
 */
export function classesRouter(controller: ClassesController, authenticate: RequestHandler): Router {
  const router = Router();
  router.use(authenticate, requireRole('tutor', 'parent', 'student'));
  const cls = { params: ClassIdParams };
  const enrollment = { params: EnrollmentParams };
  const rate = { params: FeeRateParams };

  router.get('/', validate({ query: ClassListQuery }), controller.list);
  router.get('/:classId', validate(cls), controller.get);
  router.patch('/:classId', validate({ ...cls, body: UpdateClassRequest }), controller.update);
  router.post('/:classId/pause', validate(cls), controller.pause);
  router.post('/:classId/resume', validate(cls), controller.resume);
  router.post('/:classId/end', validate({ ...cls, body: EndClassRequest }), controller.end);

  router.patch(
    '/:classId/enrollments/:enrollmentId',
    validate({ ...enrollment, body: UpdateEnrollmentNotesRequest }),
    controller.updateNotes,
  );
  router.post(
    '/:classId/enrollments/:enrollmentId/fee-rates',
    validate({ ...enrollment, body: ProposeFeeRateRequest }),
    controller.proposeFee,
  );
  router.post(
    '/:classId/enrollments/:enrollmentId/fee-rates/:rateId/accept',
    validate(rate),
    controller.acceptFee,
  );
  router.post(
    '/:classId/enrollments/:enrollmentId/fee-rates/:rateId/reject',
    validate(rate),
    controller.rejectFee,
  );
  router.post(
    '/:classId/enrollments/:enrollmentId/fee-rates/:rateId/withdraw',
    validate(rate),
    controller.withdrawFee,
  );
  router.post(
    '/:classId/enrollments/:enrollmentId/goals',
    validate({ ...enrollment, body: CreateLearningGoalRequest }),
    controller.createGoal,
  );
  router.patch(
    '/:classId/enrollments/:enrollmentId/goals/:goalId',
    validate({ params: LearningGoalParams, body: UpdateLearningGoalRequest }),
    controller.updateGoal,
  );
  return router;
}
