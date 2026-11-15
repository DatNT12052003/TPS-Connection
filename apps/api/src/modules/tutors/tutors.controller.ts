import type {
  CreateTutorCredentialRequest,
  CredentialIdParams,
  TutorIdParams,
  UpdateTutorCredentialRequest,
  UpdateTutorProfileRequest,
} from '@tps/shared';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { TutorsService } from './tutors.service.js';

/** HTTP cho hồ sơ gia sư: hồ sơ của chính gia sư (`/me/tutor-profile`) và hồ sơ công khai (`/tutors`). */
export function createTutorsController(service: TutorsService) {
  const getOwn: RequestHandler = async (req, res) => {
    res.json(await service.getOwn(requireAuth(req).user.id));
  };

  const replaceOwn: RequestHandler<unknown, unknown, UpdateTutorProfileRequest> = async (
    req,
    res,
  ) => {
    res.json(await service.replaceOwn(requireAuth(req).user.id, req.body));
  };

  const addCredential: RequestHandler<unknown, unknown, CreateTutorCredentialRequest> = async (
    req,
    res,
  ) => {
    res.status(201).json(await service.addCredential(requireAuth(req).user.id, req.body));
  };

  const updateCredential: RequestHandler<
    CredentialIdParams,
    unknown,
    UpdateTutorCredentialRequest
  > = async (req, res) => {
    res.json(
      await service.updateCredential(requireAuth(req).user.id, req.params.credentialId, req.body),
    );
  };

  const removeCredential: RequestHandler<CredentialIdParams> = async (req, res) => {
    await service.removeCredential(requireAuth(req).user.id, req.params.credentialId);
    res.status(204).end();
  };

  const getPublic: RequestHandler<TutorIdParams> = async (req, res) => {
    res.json(await service.getPublic(req.params.tutorId));
  };

  return { getOwn, replaceOwn, addCredential, updateCredential, removeCredential, getPublic };
}

export type TutorsController = ReturnType<typeof createTutorsController>;
