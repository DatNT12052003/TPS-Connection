import type {
  ChangeTutorPostStatusRequest,
  OwnTutorPostsQuery,
  SaveTutorPostRequest,
  TutorPostIdParams,
  TutorPostRefParams,
  TutorPostSearchQuery,
} from '@tps/shared';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { TutorPostsService } from './tutor-posts.service.js';

/** HTTP cho bài tuyển học sinh: bài của chính gia sư (`/me/tutor-posts`) và bài công khai (`/tutor-posts`). */
export function createTutorPostsController(service: TutorPostsService) {
  const listOwn: RequestHandler = async (req, res) => {
    res.json(
      await service.listOwn(requireAuth(req).user.id, req.query as unknown as OwnTutorPostsQuery),
    );
  };

  const create: RequestHandler<unknown, unknown, SaveTutorPostRequest> = async (req, res) => {
    res.status(201).json(await service.create(requireAuth(req).user.id, req.body));
  };

  const getOwn: RequestHandler<TutorPostIdParams> = async (req, res) => {
    res.json(await service.getOwn(requireAuth(req).user.id, req.params.postId));
  };

  const update: RequestHandler<TutorPostIdParams, unknown, SaveTutorPostRequest> = async (
    req,
    res,
  ) => {
    res.json(await service.update(requireAuth(req).user.id, req.params.postId, req.body));
  };

  const changeStatus: RequestHandler<
    TutorPostIdParams,
    unknown,
    ChangeTutorPostStatusRequest
  > = async (req, res) => {
    const { user } = requireAuth(req);
    res.json(
      await service.changeStatus(
        { userId: user.id, status: user.status },
        req.params.postId,
        req.body.status,
      ),
    );
  };

  const duplicate: RequestHandler<TutorPostIdParams> = async (req, res) => {
    res.status(201).json(await service.duplicate(requireAuth(req).user.id, req.params.postId));
  };

  const remove: RequestHandler<TutorPostIdParams> = async (req, res) => {
    await service.remove(requireAuth(req).user.id, req.params.postId);
    res.status(204).end();
  };

  const getPublic: RequestHandler<TutorPostRefParams> = async (req, res) => {
    res.json(await service.getPublic(req.params.postRef));
  };

  const search: RequestHandler = async (req, res) => {
    res.json(await service.search(req.query as unknown as TutorPostSearchQuery));
  };

  return {
    listOwn,
    create,
    getOwn,
    update,
    changeStatus,
    duplicate,
    remove,
    getPublic,
    search,
  };
}

export type TutorPostsController = ReturnType<typeof createTutorPostsController>;
