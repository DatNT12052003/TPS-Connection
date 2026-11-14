import type {
  RejectVerificationRequest,
  VerificationDocumentParams,
  VerificationQueueQuery,
  VerificationRequestIdParams,
} from '@tps/shared';
import type { Request, RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { Reviewer, VerificationReviewService } from './verification-review.service.js';

const reviewerOf = (req: Request): Reviewer => ({
  userId: requireAuth(req).user.id,
  ipAddress: req.ip ?? null,
});

/** HTTP cho Manager duyệt xác minh (`/admin/verification-requests`). */
export function createVerificationReviewController(service: VerificationReviewService) {
  const queue: RequestHandler = async (req, res) => {
    // validate() đã thay req.query bằng giá trị đã parse (có mặc định).
    res.json(await service.queue(req.query as unknown as VerificationQueueQuery));
  };

  const detail: RequestHandler<VerificationRequestIdParams> = async (req, res) => {
    res.json(await service.detail(req.params.requestId, reviewerOf(req)));
  };

  const viewDocument: RequestHandler<VerificationDocumentParams> = async (req, res) => {
    const { requestId, documentId } = req.params;
    res.set('Cache-Control', 'no-store');
    res.json(await service.viewDocument(requestId, documentId, reviewerOf(req)));
  };

  const approve: RequestHandler<VerificationRequestIdParams> = async (req, res) => {
    res.json(await service.approve(req.params.requestId, reviewerOf(req)));
  };

  const reject: RequestHandler<
    VerificationRequestIdParams,
    unknown,
    RejectVerificationRequest
  > = async (req, res) => {
    res.json(await service.reject(req.params.requestId, req.body, reviewerOf(req)));
  };

  return { queue, detail, viewDocument, approve, reject };
}

export type VerificationReviewController = ReturnType<typeof createVerificationReviewController>;
