import {
  FeeEnrollmentParams,
  FeeMonthQuery,
  FeeOverviewQuery,
  FeeStatementParams,
  PaymentNoteRequest,
  PaymentParams,
  RecordPaymentRequest,
  VoidFeeStatementRequest,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import type { FeesController } from './fees.controller.js';

/**
 * /api/v1/fees: học phí (G7) của các học sinh tôi dạy (gia sư) hoặc quản lý (phụ huynh). Học sinh khác: 404; chính
 * học sinh: 403. Tháng `YYYY-MM` theo giờ Việt Nam.
 *
 *   GET  /overview?month=&as=tutor|client                     200  tổng hợp tháng qua mọi lớp, khoản chờ tôi xác nhận
 *   GET  /enrollments/:enrollmentId?month=                     200  đối chiếu tháng của một học sinh
 *   GET  /statements/:statementId                              200  đối chiếu của tháng có bảng này
 *   POST /statements/:statementId/void                         200  gia sư hủy bảng để lập lại `{ reason }` (B.10.1)
 *   POST /statements/:statementId/payments                     201  ghi nhận đã trả / đã nhận
 *   POST /statements/:statementId/payments/:paymentId/acknowledge | /decline   200  bên kia xác nhận / chưa nhận được
 *   POST /statements/:statementId/payments/:paymentId/void     200  người ghi nhận hủy `{ note? }`
 *
 * Không cần tài khoản `active`: tài khoản bị hạn chế (B.9.3) vẫn đối chiếu học phí lớp đang có.
 */
export function feesRouter(controller: FeesController, authenticate: RequestHandler): Router {
  const router = Router();
  router.use(authenticate, requireRole('tutor', 'parent', 'student'));
  const statement = { params: FeeStatementParams };
  const payment = { params: PaymentParams, body: PaymentNoteRequest };

  router.get('/overview', validate({ query: FeeOverviewQuery }), controller.overview);
  router.get(
    '/enrollments/:enrollmentId',
    validate({ params: FeeEnrollmentParams, query: FeeMonthQuery }),
    controller.month,
  );
  router.get('/statements/:statementId', validate(statement), controller.statement);
  router.post(
    '/statements/:statementId/void',
    validate({ ...statement, body: VoidFeeStatementRequest }),
    controller.voidStatement,
  );
  router.post(
    '/statements/:statementId/payments',
    validate({ ...statement, body: RecordPaymentRequest }),
    controller.recordPayment,
  );
  router.post(
    '/statements/:statementId/payments/:paymentId/acknowledge',
    validate(payment),
    controller.acknowledgePayment,
  );
  router.post(
    '/statements/:statementId/payments/:paymentId/decline',
    validate(payment),
    controller.declinePayment,
  );
  router.post(
    '/statements/:statementId/payments/:paymentId/void',
    validate(payment),
    controller.voidPayment,
  );
  return router;
}
