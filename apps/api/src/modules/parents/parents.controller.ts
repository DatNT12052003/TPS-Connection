import type { UpdateParentProfileRequest } from '@tps/shared';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { ParentsService } from './parents.service.js';

/** HTTP cho hồ sơ phụ huynh. Chỉ thao tác trên hồ sơ của chính người đang đăng nhập. */
export function createParentsController(service: ParentsService) {
  const getOwn: RequestHandler = async (req, res) => {
    res.json(await service.getOwn(requireAuth(req).user.id));
  };

  const replaceOwn: RequestHandler<unknown, unknown, UpdateParentProfileRequest> = async (
    req,
    res,
  ) => {
    res.json(await service.replaceOwn(requireAuth(req).user.id, req.body));
  };

  return { getOwn, replaceOwn };
}

export type ParentsController = ReturnType<typeof createParentsController>;
