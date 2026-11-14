import type {
  ActiveSession,
  AuthSessionResponse,
  ChangePasswordRequest,
  EmailRequest,
  LoginRequest,
  PasswordResetConfirmRequest,
  RegisterRequest,
  VerifyEmailRequest,
} from '@tps/shared';
import type { RequestHandler, Response } from 'express';
import { requireAuth } from '../../http/authorize.js';
import { AppError } from '../../lib/app-error.js';
import {
  clearSessionCookies,
  type CookieSettings,
  readRefreshToken,
  setSessionCookies,
} from './auth.cookies.js';
import type { AuthService, ClientInfo, IssuedSession } from './auth.service.js';

const clientInfo = (req: {
  ip?: string | undefined;
  get(name: string): string | undefined;
}): ClientInfo => ({
  ip: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

/** HTTP cho module auth: lấy dữ liệu đã validate, gọi service, đặt cookie, trả response. */
export function createAuthController(service: AuthService, cookies: CookieSettings) {
  const sendSession = (res: Response, session: IssuedSession) => {
    setSessionCookies(res, session, cookies);
    const body: AuthSessionResponse = {
      user: session.user,
      accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
    };
    res.json(body);
  };

  const register: RequestHandler<unknown, unknown, RegisterRequest> = async (req, res) => {
    res.status(201).json(await service.register(req.body, clientInfo(req)));
  };

  const resendVerification: RequestHandler<unknown, unknown, EmailRequest> = async (req, res) => {
    res.status(202).json(await service.resendVerification(req.body.email));
  };

  const verifyEmail: RequestHandler<unknown, unknown, VerifyEmailRequest> = async (req, res) => {
    sendSession(res, await service.verifyEmail(req.body, clientInfo(req)));
  };

  const login: RequestHandler<unknown, unknown, LoginRequest> = async (req, res) => {
    sendSession(res, await service.login(req.body, clientInfo(req)));
  };

  const refresh: RequestHandler = async (req, res) => {
    try {
      sendSession(res, await service.refresh(readRefreshToken(req), clientInfo(req)));
    } catch (error) {
      // Phiên không còn dùng được: xóa cookie để client không thử lại mãi.
      if (error instanceof AppError && error.code === 'unauthenticated') {
        clearSessionCookies(res, cookies);
      }
      throw error;
    }
  };

  const logout: RequestHandler = async (req, res) => {
    await service.logout(readRefreshToken(req));
    clearSessionCookies(res, cookies);
    res.status(204).end();
  };

  const requestPasswordReset: RequestHandler<unknown, unknown, EmailRequest> = async (req, res) => {
    res.status(202).json(await service.requestPasswordReset(req.body.email));
  };

  const resetPassword: RequestHandler<unknown, unknown, PasswordResetConfirmRequest> = async (
    req,
    res,
  ) => {
    await service.resetPassword(req.body);
    clearSessionCookies(res, cookies);
    res.status(204).end();
  };

  const me: RequestHandler = (req, res) => {
    res.json(requireAuth(req).user);
  };

  const changePassword: RequestHandler<unknown, unknown, ChangePasswordRequest> = async (
    req,
    res,
  ) => {
    const { user, sessionFamilyId } = requireAuth(req);
    await service.changePassword(user.id, sessionFamilyId, req.body);
    res.status(204).end();
  };

  const listSessions: RequestHandler = async (req, res) => {
    const { user, sessionFamilyId } = requireAuth(req);
    const sessions: ActiveSession[] = await service.listSessions(user.id, sessionFamilyId);
    res.json({ items: sessions });
  };

  const revokeOtherSessions: RequestHandler = async (req, res) => {
    const { user, sessionFamilyId } = requireAuth(req);
    await service.revokeOtherSessions(user.id, sessionFamilyId);
    res.status(204).end();
  };

  return {
    changePassword,
    listSessions,
    revokeOtherSessions,
    register,
    resendVerification,
    verifyEmail,
    login,
    refresh,
    logout,
    requestPasswordReset,
    resetPassword,
    me,
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
