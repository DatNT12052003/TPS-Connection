import type {
  AcceptStudentInvitationRequest,
  AuthSessionResponse,
  CreateLearnerRequest,
  CreateStudentInvitationRequest,
  LearnerIdParams,
  LearnerList,
  StudentInvitationLookupRequest,
  UpdateLearnerRequest,
} from '@tps/shared';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import { type CookieSettings, setSessionCookies } from '../auth/auth.cookies.js';
import type { AuthService } from '../auth/auth.service.js';
import type { LearnersService } from './learners.service.js';
import type { StudentInvitationsService } from './student-invitations.service.js';

/** HTTP cho hồ sơ con và lời mời học sinh: lấy dữ liệu đã validate, gọi service, trả response. */
export function createLearnersController(deps: {
  learners: LearnersService;
  invitations: StudentInvitationsService;
  auth: Pick<AuthService, 'signIn'>;
  cookies: CookieSettings;
}) {
  const { learners, invitations } = deps;

  const list: RequestHandler = async (req, res) => {
    const { user } = requireAuth(req);
    const body: LearnerList = { items: await learners.list(user) };
    res.json(body);
  };

  const create: RequestHandler<unknown, unknown, CreateLearnerRequest> = async (req, res) => {
    const { user } = requireAuth(req);
    res.status(201).json(await learners.create(user.id, req.body, req.ip ?? null));
  };

  const get: RequestHandler<LearnerIdParams> = async (req, res) => {
    const { user } = requireAuth(req);
    res.json(await learners.get(user.id, req.params.learnerId));
  };

  const update: RequestHandler<LearnerIdParams, unknown, UpdateLearnerRequest> = async (
    req,
    res,
  ) => {
    const { user } = requireAuth(req);
    res.json(await learners.update(user.id, req.params.learnerId, req.body));
  };

  const remove: RequestHandler<LearnerIdParams> = async (req, res) => {
    const { user } = requireAuth(req);
    await learners.remove(user.id, req.params.learnerId);
    res.status(204).end();
  };

  const invite: RequestHandler<LearnerIdParams, unknown, CreateStudentInvitationRequest> = async (
    req,
    res,
  ) => {
    const { user } = requireAuth(req);
    const invitation = await invitations.invite(
      { id: user.id, displayName: user.displayName, locale: user.locale },
      req.params.learnerId,
      req.body.email,
    );
    res.status(201).json(invitation);
  };

  const revokeInvitation: RequestHandler<LearnerIdParams> = async (req, res) => {
    const { user } = requireAuth(req);
    await invitations.revoke(user.id, req.params.learnerId);
    res.status(204).end();
  };

  const lookupInvitation: RequestHandler<unknown, unknown, StudentInvitationLookupRequest> = async (
    req,
    res,
  ) => {
    res.json(await invitations.preview(req.body.token));
  };

  /** Nhận lời mời: tạo tài khoản học sinh rồi đăng nhập luôn (cookie như /auth/login). */
  const acceptInvitation: RequestHandler<unknown, unknown, AcceptStudentInvitationRequest> = async (
    req,
    res,
  ) => {
    const { userId } = await invitations.accept(req.body, req.ip ?? null);
    const session = await deps.auth.signIn(userId, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    setSessionCookies(res, session, deps.cookies);
    const body: AuthSessionResponse = {
      user: session.user,
      accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
    };
    res.status(201).json(body);
  };

  return {
    list,
    create,
    get,
    update,
    remove,
    invite,
    revokeInvitation,
    lookupInvitation,
    acceptInvitation,
  };
}

export type LearnersController = ReturnType<typeof createLearnersController>;
