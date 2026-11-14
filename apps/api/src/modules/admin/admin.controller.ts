import type {
  AccountIdParams,
  AdminAccountsQuery,
  CreateGradeLevelRequest,
  CreateSubjectRequest,
  GrantManagerRequest,
  LockAccountRequest,
  UpdateSubjectRequest,
} from '@tps/shared';
import type { Request, RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { AdminAccountsService, AdminActor } from './admin-accounts.service.js';
import type { AdminCatalogService } from './admin-catalog.service.js';

const actorOf = <P, B>(req: Request<P, unknown, B>): AdminActor => ({
  userId: requireAuth(req).user.id,
  ipAddress: req.ip ?? null,
});

/** HTTP cho khu Admin: tài khoản, vai trò Manager, danh mục. */
export function createAdminController(deps: {
  accounts: AdminAccountsService;
  catalog: AdminCatalogService;
}) {
  const { accounts, catalog } = deps;

  const listAccounts: RequestHandler = async (req, res) => {
    // validate() đã thay req.query bằng giá trị đã parse.
    res.json(await accounts.list(req.query as unknown as AdminAccountsQuery));
  };
  const getAccount: RequestHandler<AccountIdParams> = async (req, res) => {
    res.json(await accounts.detail(actorOf(req), req.params.userId));
  };
  const lockAccount: RequestHandler<AccountIdParams, unknown, LockAccountRequest> = async (
    req,
    res,
  ) => {
    res.json(await accounts.lock(actorOf(req), req.params.userId, req.body.reason));
  };
  const unlockAccount: RequestHandler<AccountIdParams> = async (req, res) => {
    res.json(await accounts.unlock(actorOf(req), req.params.userId));
  };
  const grantManager: RequestHandler<unknown, unknown, GrantManagerRequest> = async (req, res) => {
    const result = await accounts.grantManager(actorOf(req), req.body);
    res.status(result.created ? 201 : 200).json(result.account);
  };
  const revokeManager: RequestHandler<AccountIdParams> = async (req, res) => {
    res.json(await accounts.revokeManager(actorOf(req), req.params.userId));
  };

  const listSubjects: RequestHandler = async (_req, res) => {
    res.json({ items: await catalog.subjects() });
  };
  const createSubject: RequestHandler<unknown, unknown, CreateSubjectRequest> = async (
    req,
    res,
  ) => {
    res.status(201).json(await catalog.createSubject(actorOf(req), req.body));
  };
  // Params `:id` đã được validate() đổi thành số; kiểu của Express vẫn là chuỗi nên đọc qua Number().
  const updateSubject: RequestHandler<{ id: string }, unknown, UpdateSubjectRequest> = async (
    req,
    res,
  ) => {
    res.json(await catalog.updateSubject(actorOf(req), Number(req.params.id), req.body));
  };
  const listGradeLevels: RequestHandler = async (_req, res) => {
    res.json({ items: await catalog.gradeLevels() });
  };
  const createGradeLevel: RequestHandler<unknown, unknown, CreateGradeLevelRequest> = async (
    req,
    res,
  ) => {
    res.status(201).json(await catalog.createGradeLevel(actorOf(req), req.body));
  };
  const updateGradeLevel: RequestHandler<{ id: string }, unknown, UpdateSubjectRequest> = async (
    req,
    res,
  ) => {
    res.json(await catalog.updateGradeLevel(actorOf(req), Number(req.params.id), req.body));
  };

  return {
    listAccounts,
    getAccount,
    lockAccount,
    unlockAccount,
    grantManager,
    revokeManager,
    listSubjects,
    createSubject,
    updateSubject,
    listGradeLevels,
    createGradeLevel,
    updateGradeLevel,
  };
}

export type AdminController = ReturnType<typeof createAdminController>;
