// Nghiệp vụ xác thực (G2): đăng ký, xác thực email bằng OTP (D54), đăng nhập, làm mới phiên có xoay vòng,
// đăng xuất, đặt lại mật khẩu (đổi xong thì đăng xuất mọi thiết bị, D50). Không phụ thuộc Express.
import { randomUUID } from 'node:crypto';
import {
  type ActiveSession,
  AUTH_TOKEN_TTL,
  type ChangePasswordRequest,
  type AuthUser,
  type CodeSentResponse,
  LEGAL_DOCUMENT_VERSION,
  type LoginRequest,
  OTP_RULES,
  type PasswordResetConfirmRequest,
  type RegisterRequest,
  type VerifyEmailRequest,
} from '@tps/shared';
import { type DataSource, QueryFailedError } from 'typeorm';
import { AppError, rateLimited } from '../../lib/app-error.js';
import type { EmailMessage } from '../../lib/email/email-sender.js';
import type { Logger } from '../../lib/logger.js';
import type { RateLimiter } from '../../lib/rate-limiter.js';
import { createUsersRepository, type UserWithRoles } from '../users/users.repository.js';
import type { User } from '../users/user.entity.js';
import { createAuthSessionsRepository } from './auth-sessions.repository.js';
import { buildOtpEmail } from './auth.emails.js';
import type { OtpPurpose, OtpStore, VerifyResult } from './otp-store.js';
import type { PasswordHasher } from './password-hasher.js';
import { generateRefreshToken, hashRefreshToken, type TokenService } from './tokens.js';

/** Đăng nhập sai quá 5 lần trong 15 phút cho một email: tạm khóa đăng nhập email đó tới hết cửa sổ. */
export const LOGIN_FAILURE_LIMIT = { limit: 5, windowSeconds: 15 * 60 } as const;

/**
 * Token cũ được dùng lại trong khoảng này sau khi đã xoay: coi là hai tab làm mới cùng lúc (chỉ từ chối),
 * không phải token bị đánh cắp (thu hồi cả chuỗi).
 */
export const REFRESH_REUSE_GRACE_SECONDS = 30;

/** Thông tin request cần cho nghiệp vụ (không phải đối tượng Express). */
export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

/** Phiên vừa cấp: controller đặt token vào cookie, trả `user` trong body. */
export interface IssuedSession {
  user: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  rememberMe: boolean;
}

export interface AuthServiceDeps {
  dataSource: DataSource;
  hasher: PasswordHasher;
  tokens: TokenService;
  otp: OtpStore;
  rateLimiter: RateLimiter;
  /** Xếp email vào hàng đợi (jobs.enqueueEmail). Không gửi trực tiếp trong request. */
  sendEmail: (message: EmailMessage) => Promise<unknown>;
  logger: Logger;
  now?: () => Date;
}

export function createAuthService(deps: AuthServiceDeps) {
  const { dataSource, hasher, tokens, otp, rateLimiter, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const usersRepo = () => createUsersRepository(dataSource.manager);
  const sessionsRepo = () => createAuthSessionsRepository(dataSource.manager);

  const codeSent: CodeSentResponse = {
    resendAfterSeconds: OTP_RULES.resendCooldownSeconds,
    expiresInSeconds: OTP_RULES.ttlSeconds,
  };

  /** Gửi mã nếu chưa bị giới hạn. Trả số giây phải chờ nếu bị giới hạn. */
  async function sendCode(purpose: OtpPurpose, user: User): Promise<number | null> {
    const email = user.email;
    if (!email) return null;
    const result = await otp.issue(purpose, email);
    if (!result.issued) return result.retryAfterSeconds;
    await deps.sendEmail(
      buildOtpEmail({
        kind: purpose,
        locale: user.locale,
        to: email,
        name: user.displayName,
        code: result.code,
      }),
    );
    return null;
  }

  function codeError(result: Exclude<VerifyResult, { ok: true }>): AppError {
    switch (result.reason) {
      case 'invalid':
        return new AppError('invalid_code', 'Invalid code', undefined, {
          meta: { attemptsLeft: result.attemptsLeft },
        });
      case 'attempts_exceeded':
        return new AppError('code_attempts_exceeded', 'Too many wrong codes; code cancelled');
      case 'expired':
        return new AppError('code_expired', 'Code expired or not issued');
    }
  }

  function toAuthUser({ user, roles }: UserWithRoles): AuthUser {
    return {
      id: user.id,
      email: user.email ?? '',
      displayName: user.displayName,
      fullName: user.fullName,
      phone: user.phone,
      locale: user.locale,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      roles,
    };
  }

  /** Cấp một chuỗi phiên mới (đăng nhập) hoặc token kế tiếp trong chuỗi (làm mới). */
  async function issueSession(
    account: UserWithRoles,
    options: { familyId: string; rememberMe: boolean; client: ClientInfo },
  ): Promise<IssuedSession> {
    const refreshToken = generateRefreshToken();
    const refreshTtl = options.rememberMe
      ? AUTH_TOKEN_TTL.refreshRememberSeconds
      : AUTH_TOKEN_TTL.refreshSessionSeconds;
    const refreshTokenExpiresAt = new Date(now().getTime() + refreshTtl * 1000);
    await sessionsRepo().create({
      userId: account.user.id,
      familyId: options.familyId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      userAgent: options.client.userAgent?.slice(0, 500) ?? null,
      ipAddress: options.client.ip,
      expiresAt: refreshTokenExpiresAt,
      rememberMe: options.rememberMe,
    });
    const access = tokens.signAccessToken({
      userId: account.user.id,
      sessionFamilyId: options.familyId,
    });
    return {
      user: toAuthUser(account),
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      rememberMe: options.rememberMe,
    };
  }

  async function startSession(user: User, rememberMe: boolean, client: ClientInfo) {
    const account = await usersRepo().findWithRoles(user.id);
    if (!account) throw new AppError('unauthenticated', 'Account no longer exists');
    await usersRepo().recordLogin(user.id);
    return issueSession(account, { familyId: randomUUID(), rememberMe, client });
  }

  const isEmailUniqueViolation = (error: unknown) =>
    error instanceof QueryFailedError &&
    (error.driverError as { constraint?: string } | undefined)?.constraint === 'users_email_uq';

  return {
    /**
     * Đăng ký phụ huynh hoặc gia sư. Chưa đăng nhập cho tới khi xác thực email. Email đã có tài khoản
     * đã xác thực: 409 email_taken. Email đã đăng ký nhưng chưa xác thực: cập nhật lại thông tin
     * (chưa ai chứng minh sở hữu email, nên không để một lần đăng ký dở chặn chủ thật của email).
     */
    async register(input: RegisterRequest, client: ClientInfo): Promise<CodeSentResponse> {
      const passwordHash = await hasher.hash(input.password);
      const profile = {
        passwordHash,
        fullName: input.fullName,
        displayName: input.fullName,
        phone: input.phone ?? null,
        locale: input.locale,
      };

      let user: User;
      try {
        user = await dataSource.transaction(async (manager) => {
          const repo = createUsersRepository(manager);
          const existing = await repo.findByEmail(input.email);
          if (existing?.emailVerifiedAt) {
            throw new AppError('email_taken', 'Email already registered');
          }
          let account: User;
          if (existing) {
            await repo.updatePendingRegistration(existing.id, profile);
            await repo.revokeOtherSelfRegisteredRoles(existing.id, input.role);
            account = { ...existing, ...profile };
          } else {
            account = await repo.create({ email: input.email, ...profile });
          }
          await repo.grantRole(account.id, input.role);
          await repo.recordConsents(
            account.id,
            ['terms_of_service', 'privacy_policy'],
            LEGAL_DOCUMENT_VERSION,
            client.ip,
          );
          return account;
        });
      } catch (error) {
        if (isEmailUniqueViolation(error)) {
          throw new AppError('email_taken', 'Email already registered', undefined, {
            cause: error,
          });
        }
        throw error;
      }

      // Đăng ký lại trong 45 giây: không gửi mã mới, mã trước vẫn dùng được.
      await sendCode('verify_email', user);
      logger.info({ userId: user.id, role: input.role }, 'User registered');
      return codeSent;
    },

    /** Gửi lại mã xác thực. Trả cùng một kết quả dù email có tài khoản hay không. */
    async resendVerification(email: string): Promise<CodeSentResponse> {
      const user = await usersRepo().findByEmail(email);
      if (user && !user.emailVerifiedAt) {
        const wait = await sendCode('verify_email', user);
        if (wait !== null) throw rateLimited(wait, 'Verification code requested too often');
      }
      return codeSent;
    },

    /** Nhập đúng mã: xác thực email và đăng nhập luôn. */
    async verifyEmail(input: VerifyEmailRequest, client: ClientInfo): Promise<IssuedSession> {
      const user = await usersRepo().findByEmail(input.email);
      // Không có tài khoản chờ xác thực: trả như mã hết hạn, không lộ email có tồn tại hay không.
      if (!user || user.emailVerifiedAt) {
        throw new AppError('code_expired', 'Code expired or not issued');
      }
      const result = await otp.verify('verify_email', input.email, input.code);
      if (!result.ok) throw codeError(result);

      await usersRepo().markEmailVerified(user.id);
      logger.info({ userId: user.id }, 'Email verified');
      return startSession(user, false, client);
    },

    async login(input: LoginRequest, client: ClientInfo): Promise<IssuedSession> {
      // Sai đủ 5 lần: chặn đăng nhập email này tới hết cửa sổ, kể cả khi lần này nhập đúng mật khẩu
      // (không thì kẻ dò mật khẩu chỉ cần đoán tiếp).
      const failureKey = `login-failures:${input.email}`;
      const failures = await rateLimiter.peek(failureKey);
      if (failures.count >= LOGIN_FAILURE_LIMIT.limit) {
        throw rateLimited(failures.retryAfterSeconds, 'Too many failed logins for this email');
      }

      const user = await usersRepo().findByEmail(input.email, { withPassword: true });
      const passwordOk = await hasher.verify(user?.passwordHash ?? null, input.password);
      if (!user || !passwordOk) {
        await rateLimiter.hit(
          failureKey,
          LOGIN_FAILURE_LIMIT.limit,
          LOGIN_FAILURE_LIMIT.windowSeconds,
        );
        throw new AppError('invalid_credentials', 'Invalid email or password');
      }
      await rateLimiter.reset(failureKey);

      // Chỉ nói lý do khác "sai mật khẩu" khi đã nhập đúng mật khẩu.
      if (user.status === 'locked') throw new AppError('account_locked', 'Account is locked');
      if (!user.emailVerifiedAt) {
        throw new AppError('email_not_verified', 'Email not verified');
      }
      return startSession(user, input.rememberMe, client);
    },

    /**
     * Đổi refresh token lấy cặp token mới. Token đã bị đổi trước đó mà vẫn được gửi lại (sau thời gian
     * ân hạn) nghĩa là token có thể bị đánh cắp: thu hồi cả chuỗi phiên.
     */
    async refresh(refreshToken: string | undefined, client: ClientInfo): Promise<IssuedSession> {
      const unauthenticated = () => new AppError('unauthenticated', 'Invalid refresh token');
      if (!refreshToken) throw unauthenticated();

      const sessions = sessionsRepo();
      const session = await sessions.findByTokenHash(hashRefreshToken(refreshToken));
      if (!session || session.revokedAt) throw unauthenticated();

      if (session.rotatedAt) {
        const sinceRotation = (now().getTime() - session.rotatedAt.getTime()) / 1000;
        if (sinceRotation > REFRESH_REUSE_GRACE_SECONDS) {
          await sessions.revokeFamily(session.familyId, 'reuse_detected');
          logger.warn(
            { userId: session.userId, familyId: session.familyId },
            'Refresh token reuse detected; session family revoked',
          );
        }
        throw unauthenticated();
      }
      if (session.expiresAt.getTime() <= now().getTime()) throw unauthenticated();

      const account = await usersRepo().findWithRoles(session.userId);
      if (!account || account.user.status === 'locked') {
        await sessions.revokeFamily(session.familyId, 'account_locked');
        throw unauthenticated();
      }
      // Hai request làm mới cùng lúc: chỉ một bên đổi được.
      if (!(await sessions.markRotated(session.id))) throw unauthenticated();

      return issueSession(account, {
        familyId: session.familyId,
        rememberMe: session.rememberMe,
        client,
      });
    },

    /** Thu hồi chuỗi phiên của refresh token này. Không có token hoặc token lạ: không làm gì. */
    async logout(refreshToken: string | undefined): Promise<void> {
      if (!refreshToken) return;
      const sessions = sessionsRepo();
      const session = await sessions.findByTokenHash(hashRefreshToken(refreshToken));
      if (session) await sessions.revokeFamily(session.familyId, 'logout');
    },

    /** Quên mật khẩu: gửi mã nếu email có tài khoản. Trả cùng một kết quả trong mọi trường hợp. */
    async requestPasswordReset(email: string): Promise<CodeSentResponse> {
      const user = await usersRepo().findByEmail(email);
      if (user) {
        const wait = await sendCode('reset_password', user);
        if (wait !== null) throw rateLimited(wait, 'Reset code requested too often');
      }
      return codeSent;
    },

    /**
     * Đặt mật khẩu mới bằng mã. Thu hồi mọi phiên đang đăng nhập (D50); người dùng đăng nhập lại.
     * Nhập đúng mã cũng chứng minh sở hữu email, nên email chưa xác thực được xác thực luôn.
     */
    async resetPassword(input: PasswordResetConfirmRequest): Promise<void> {
      const user = await usersRepo().findByEmail(input.email);
      if (!user) throw new AppError('code_expired', 'Code expired or not issued');
      const result = await otp.verify('reset_password', input.email, input.code);
      if (!result.ok) throw codeError(result);

      const passwordHash = await hasher.hash(input.newPassword);
      await dataSource.transaction(async (manager) => {
        const repo = createUsersRepository(manager);
        await repo.setPassword(user.id, passwordHash);
        await repo.markEmailVerified(user.id);
        await createAuthSessionsRepository(manager).revokeAllForUser(user.id, 'password_changed');
      });
      await rateLimiter.reset(`login-failures:${input.email}`);
      logger.info({ userId: user.id }, 'Password reset; all sessions revoked');
    },

    /**
     * Đổi mật khẩu khi đã đăng nhập: phải nhập đúng mật khẩu hiện tại; xong thì đăng xuất các thiết bị
     * khác, giữ thiết bị đang dùng (D50). Sai mật khẩu hiện tại 5 lần trong 15 phút thì tạm chặn, để
     * người cầm phiên bị lộ không dò được mật khẩu.
     */
    async changePassword(
      userId: string,
      currentFamilyId: string,
      input: ChangePasswordRequest,
    ): Promise<void> {
      const failureKey = `password-change-failures:${userId}`;
      const failures = await rateLimiter.peek(failureKey);
      if (failures.count >= LOGIN_FAILURE_LIMIT.limit) {
        throw rateLimited(failures.retryAfterSeconds, 'Too many wrong current passwords');
      }
      const user = await usersRepo().findByIdWithPassword(userId);
      if (!user) throw new AppError('unauthenticated', 'Account no longer exists');
      if (!(await hasher.verify(user.passwordHash, input.currentPassword))) {
        await rateLimiter.hit(
          failureKey,
          LOGIN_FAILURE_LIMIT.limit,
          LOGIN_FAILURE_LIMIT.windowSeconds,
        );
        // Lỗi gắn vào ô "mật khẩu hiện tại" (422), không dùng 401 để client không tưởng đã hết phiên.
        throw new AppError('validation_failed', 'Current password is wrong', [
          { path: 'currentPassword', code: 'wrong_password', message: 'Current password is wrong' },
        ]);
      }
      await rateLimiter.reset(failureKey);

      const passwordHash = await hasher.hash(input.newPassword);
      await dataSource.transaction(async (manager) => {
        await createUsersRepository(manager).setPassword(userId, passwordHash);
        await createAuthSessionsRepository(manager).revokeAllForUserExcept(
          userId,
          currentFamilyId,
          'password_changed',
        );
      });
      logger.info({ userId }, 'Password changed; other sessions revoked');
    },

    /** Thiết bị đang đăng nhập (mỗi chuỗi phiên một dòng), phiên hiện tại đánh dấu `current`. */
    async listSessions(userId: string, currentFamilyId: string): Promise<ActiveSession[]> {
      const rows = await sessionsRepo().listActive(userId, now());
      return rows.map((s) => ({
        id: s.familyId,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        lastActiveAt: s.createdAt.toISOString(),
        current: s.familyId === currentFamilyId,
      }));
    },

    /** "Đăng xuất thiết bị khác": thu hồi mọi chuỗi phiên trừ phiên hiện tại. */
    async revokeOtherSessions(userId: string, currentFamilyId: string): Promise<void> {
      await sessionsRepo().revokeAllForUserExcept(userId, currentFamilyId, 'logout');
    },

    /** Người dùng hiện tại (cho middleware xác thực và GET /auth/me). Null nếu đã xóa. */
    async getAuthUser(userId: string): Promise<AuthUser | null> {
      const account = await usersRepo().findWithRoles(userId);
      return account ? toAuthUser(account) : null;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
