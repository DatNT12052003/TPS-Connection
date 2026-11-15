import {
  CredentialIdParams,
  SubmitCredentialVerificationRequest,
  SubmitIdentityVerificationRequest,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import type { VerificationController } from './verification.controller.js';

/**
 * Xác minh của chính gia sư, gắn dưới /api/v1/me/tutor-profile (cùng tiền tố với router hồ sơ gia sư, nên
 * `authenticate` gắn theo từng route, không `router.use`).
 *
 *   GET    /verification                              200  tình trạng xác minh danh tính
 *   POST   /verification                              201  nộp giấy tờ danh tính (hồ sơ → chờ xác minh)
 *   DELETE /verification                              204  hủy yêu cầu đang chờ (hồ sơ → chưa hoàn thiện)
 *   POST   /credentials/:credentialId/verification    201  nộp giấy tờ của một bằng cấp
 *   DELETE /credentials/:credentialId/verification    204  hủy yêu cầu đang chờ của bằng cấp đó
 */
export function ownVerificationRouter(
  controller: VerificationController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  const tutor = [authenticate, requireRole('tutor')];
  router.get('/verification', ...tutor, controller.getIdentity);
  router.post(
    '/verification',
    ...tutor,
    validate({ body: SubmitIdentityVerificationRequest }),
    controller.submitIdentity,
  );
  router.delete('/verification', ...tutor, controller.cancelIdentity);
  router.post(
    '/credentials/:credentialId/verification',
    ...tutor,
    validate({ params: CredentialIdParams, body: SubmitCredentialVerificationRequest }),
    controller.submitCredential,
  );
  router.delete(
    '/credentials/:credentialId/verification',
    ...tutor,
    validate({ params: CredentialIdParams }),
    controller.cancelCredential,
  );
  return router;
}
