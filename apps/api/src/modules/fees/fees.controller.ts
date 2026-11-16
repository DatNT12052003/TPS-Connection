import type {
  FeeEnrollmentParams,
  FeeMonthQuery,
  FeeOverviewQuery,
  FeeStatementParams,
  PaymentNoteRequest,
  PaymentParams,
  RecordPaymentRequest,
  VoidFeeStatementRequest,
} from '@tps/shared';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { FeesService } from './fees.service.js';

const userIdOf = (req: Parameters<typeof requireAuth>[0]) => requireAuth(req).user.id;

/** HTTP cho học phí (`/fees`). */
export function createFeesController(service: FeesService) {
  const overview: RequestHandler = async (req, res) => {
    res.json(await service.overview(userIdOf(req), req.query as unknown as FeeOverviewQuery));
  };

  const month: RequestHandler<FeeEnrollmentParams> = async (req, res) => {
    const { month } = req.query as unknown as FeeMonthQuery;
    res.json(await service.month(userIdOf(req), req.params.enrollmentId, month));
  };

  const statement: RequestHandler<FeeStatementParams> = async (req, res) => {
    res.json(await service.statement(userIdOf(req), req.params.statementId));
  };

  const voidStatement: RequestHandler<
    FeeStatementParams,
    unknown,
    VoidFeeStatementRequest
  > = async (req, res) => {
    res.json(await service.voidStatement(userIdOf(req), req.params.statementId, req.body.reason));
  };

  const recordPayment: RequestHandler<FeeStatementParams, unknown, RecordPaymentRequest> = async (
    req,
    res,
  ) => {
    res
      .status(201)
      .json(await service.recordPayment(userIdOf(req), req.params.statementId, req.body));
  };

  const decide =
    (
      decision: 'acknowledge' | 'decline' | 'void',
    ): RequestHandler<PaymentParams, unknown, PaymentNoteRequest> =>
    async (req, res) => {
      const { statementId, paymentId } = req.params;
      res.json(
        await service.decidePayment(
          userIdOf(req),
          statementId,
          paymentId,
          decision,
          req.body?.note ?? null,
        ),
      );
    };

  return {
    overview,
    month,
    statement,
    voidStatement,
    recordPayment,
    acknowledgePayment: decide('acknowledge'),
    declinePayment: decide('decline'),
    voidPayment: decide('void'),
  };
}

export type FeesController = ReturnType<typeof createFeesController>;
