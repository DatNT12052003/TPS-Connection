import type {
  CredentialIdParams,
  SubmitCredentialVerificationRequest,
  SubmitIdentityVerificationRequest,
} from '@tps/shared';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { VerificationService } from './verification.service.js';

/** HTTP cho xác minh của chính gia sư (`/me/tutor-profile/verification`, `/credentials/:id/verification`). */
export function createVerificationController(service: VerificationService) {
  const getIdentity: RequestHandler = async (req, res) => {
    res.json(await service.getIdentity(requireAuth(req).user.id));
  };

  const submitIdentity: RequestHandler<
    unknown,
    unknown,
    SubmitIdentityVerificationRequest
  > = async (req, res) => {
    const { user } = requireAuth(req);
    res.status(201).json(await service.submitIdentity(user.id, req.body, req.ip ?? null));
  };

  const cancelIdentity: RequestHandler = async (req, res) => {
    await service.cancelIdentity(requireAuth(req).user.id);
    res.status(204).end();
  };

  const submitCredential: RequestHandler<
    CredentialIdParams,
    unknown,
    SubmitCredentialVerificationRequest
  > = async (req, res) => {
    const { user } = requireAuth(req);
    res
      .status(201)
      .json(await service.submitCredential(user.id, req.params.credentialId, req.body));
  };

  const cancelCredential: RequestHandler<CredentialIdParams> = async (req, res) => {
    await service.cancelCredential(requireAuth(req).user.id, req.params.credentialId);
    res.status(204).end();
  };

  return { getIdentity, submitIdentity, cancelIdentity, submitCredential, cancelCredential };
}

export type VerificationController = ReturnType<typeof createVerificationController>;
