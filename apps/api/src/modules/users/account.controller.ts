import type { SetAvatarRequest, UpdateAccountRequest, UploadRequest } from '@tps/shared';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { AccountService } from './account.service.js';

/** HTTP cho thông tin cá nhân của người đang đăng nhập và tệp tải lên của họ. */
export function createAccountController(service: AccountService) {
  const get: RequestHandler = async (req, res) => {
    res.json(await service.get(requireAuth(req).user.id));
  };

  const update: RequestHandler<unknown, unknown, UpdateAccountRequest> = async (req, res) => {
    res.json(await service.update(requireAuth(req).user.id, req.body));
  };

  const setAvatar: RequestHandler<unknown, unknown, SetAvatarRequest> = async (req, res) => {
    res.json(await service.setAvatar(requireAuth(req).user.id, req.body.fileId));
  };

  const removeAvatar: RequestHandler = async (req, res) => {
    await service.removeAvatar(requireAuth(req).user.id);
    res.status(204).end();
  };

  const createUpload: RequestHandler<unknown, unknown, UploadRequest> = async (req, res) => {
    res.status(201).json(await service.createUpload(requireAuth(req).user.id, req.body));
  };

  return { get, update, setAvatar, removeAvatar, createUpload };
}

export type AccountController = ReturnType<typeof createAccountController>;
