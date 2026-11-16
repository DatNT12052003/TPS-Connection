import type {
  ChangeRequestPostStatusRequest,
  CreateRequestPostRequest,
  OwnRequestPostsQuery,
  RequestPostIdParams,
  RequestPostSearchQuery,
  UpdateRequestPostRequest,
} from '@tps/shared';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { RequestPostsService } from './request-posts.service.js';

/** HTTP cho bài tìm gia sư: bài của chính phụ huynh (`/me/request-posts`) và bài cho gia sư (`/request-posts`). */
export function createRequestPostsController(service: RequestPostsService) {
  const listOwn: RequestHandler = async (req, res) => {
    res.json(
      await service.listOwn(requireAuth(req).user.id, req.query as unknown as OwnRequestPostsQuery),
    );
  };

  const create: RequestHandler<unknown, unknown, CreateRequestPostRequest> = async (req, res) => {
    res.status(201).json(await service.create(requireAuth(req).user.id, req.body));
  };

  const getOwn: RequestHandler<RequestPostIdParams> = async (req, res) => {
    res.json(await service.getOwn(requireAuth(req).user.id, req.params.postId));
  };

  const update: RequestHandler<RequestPostIdParams, unknown, UpdateRequestPostRequest> = async (
    req,
    res,
  ) => {
    res.json(await service.update(requireAuth(req).user.id, req.params.postId, req.body));
  };

  const changeStatus: RequestHandler<
    RequestPostIdParams,
    unknown,
    ChangeRequestPostStatusRequest
  > = async (req, res) => {
    const { user } = requireAuth(req);
    res.json(
      await service.changeStatus(
        { userId: user.id, status: user.status },
        req.params.postId,
        req.body,
      ),
    );
  };

  const remove: RequestHandler<RequestPostIdParams> = async (req, res) => {
    await service.remove(requireAuth(req).user.id, req.params.postId);
    res.status(204).end();
  };

  const getForTutor: RequestHandler<RequestPostIdParams> = async (req, res) => {
    res.json(await service.getForTutor(requireAuth(req).user.id, req.params.postId));
  };

  const searchForTutor: RequestHandler = async (req, res) => {
    res.json(
      await service.searchForTutor(
        requireAuth(req).user.id,
        req.query as unknown as RequestPostSearchQuery,
      ),
    );
  };

  return { listOwn, create, getOwn, update, changeStatus, remove, getForTutor, searchForTutor };
}

export type RequestPostsController = ReturnType<typeof createRequestPostsController>;
