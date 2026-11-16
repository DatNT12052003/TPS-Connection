import type {
  ConfirmTermsRequest,
  ConnectionRequestIdParams,
  ConnectionRequestListQuery,
  CreateConnectionRequest,
  ProposeTermsRequest,
  RejectConnectionRequest,
} from '@tps/shared';
import type { RequestHandler } from 'express';
import type { AuthContext } from '../../http/authenticate.js';
import { requireAuth } from '../../http/authorize.js';
import type { ConnectionActor, ConnectionsService } from './connections.service.js';

const actorOf = (req: { auth?: AuthContext | undefined }): ConnectionActor => {
  const { user } = requireAuth(req);
  return { userId: user.id, status: user.status, roles: user.roles };
};

/** HTTP cho yêu cầu kết nối (`/connection-requests`). */
export function createConnectionsController(service: ConnectionsService) {
  const list: RequestHandler = async (req, res) => {
    res.json(
      await service.list(
        requireAuth(req).user.id,
        req.query as unknown as ConnectionRequestListQuery,
      ),
    );
  };

  const create: RequestHandler<unknown, unknown, CreateConnectionRequest> = async (req, res) => {
    res.status(201).json(await service.create(actorOf(req), req.body));
  };

  const get: RequestHandler<ConnectionRequestIdParams> = async (req, res) => {
    res.json(await service.get(requireAuth(req).user.id, req.params.requestId));
  };

  const accept: RequestHandler<ConnectionRequestIdParams> = async (req, res) => {
    res.json(await service.accept(actorOf(req), req.params.requestId));
  };

  const reject: RequestHandler<
    ConnectionRequestIdParams,
    unknown,
    RejectConnectionRequest
  > = async (req, res) => {
    res.json(await service.reject(requireAuth(req).user.id, req.params.requestId, req.body.note));
  };

  const cancel: RequestHandler<ConnectionRequestIdParams> = async (req, res) => {
    res.json(await service.cancel(requireAuth(req).user.id, req.params.requestId));
  };

  const proposeTerms: RequestHandler<
    ConnectionRequestIdParams,
    unknown,
    ProposeTermsRequest
  > = async (req, res) => {
    res.status(201).json(await service.proposeTerms(actorOf(req), req.params.requestId, req.body));
  };

  const confirm: RequestHandler<ConnectionRequestIdParams, unknown, ConfirmTermsRequest> = async (
    req,
    res,
  ) => {
    res.json(await service.confirm(actorOf(req), req.params.requestId, req.body.version));
  };

  return { list, create, get, accept, reject, cancel, proposeTerms, confirm };
}

export type ConnectionsController = ReturnType<typeof createConnectionsController>;
