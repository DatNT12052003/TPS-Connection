// Lời mời con tạo tài khoản học sinh (D4, D50): liên kết dùng một lần, hết hạn sau 7 ngày. Phụ huynh gửi
// cho email của con; con mở liên kết, đặt mật khẩu, tài khoản học sinh được tạo và gắn vào hồ sơ có sẵn.
// Token chỉ có trong email; database lưu SHA-256. Không phụ thuộc Express.
import { createHash, randomBytes } from 'node:crypto';
import {
  type AcceptStudentInvitationRequest,
  LEGAL_DOCUMENT_VERSION,
  type Locale,
  type PendingStudentInvitation,
  STUDENT_INVITATION_RULES,
  type StudentInvitationPreview,
} from '@tps/shared';
import { type DataSource, type EntityManager, QueryFailedError } from 'typeorm';
import { AppError, conflict, notFound, rateLimited } from '../../lib/app-error.js';
import type { EmailMessage } from '../../lib/email/email-sender.js';
import type { Logger } from '../../lib/logger.js';
import type { RateLimiter } from '../../lib/rate-limiter.js';
import type { PasswordHasher } from '../auth/password-hasher.js';
import { createUsersRepository } from '../users/users.repository.js';
import { createLearnerAccess } from './learner-access.js';
import type { Learner } from './learner.entity.js';
import { toPendingInvitationDto } from './learners.service.js';
import { createLearnersRepository } from './learners.repository.js';
import type { StudentInvitation } from './student-invitation.entity.js';
import {
  buildStudentInvitationEmail,
  studentInvitationLink,
} from './student-invitations.emails.js';
import { createStudentInvitationsRepository } from './student-invitations.repository.js';

/** Token 256 bit ngẫu nhiên; SHA-256 là đủ để lưu (không dò được như mật khẩu). */
const generateToken = () => randomBytes(32).toString('base64url');
export const hashInvitationToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export interface StudentInvitationsServiceDeps {
  dataSource: DataSource;
  hasher: PasswordHasher;
  rateLimiter: RateLimiter;
  /** Xếp email vào hàng đợi (jobs.enqueueEmail). */
  sendEmail: (message: EmailMessage) => Promise<unknown>;
  /** Địa chỉ web, để dựng liên kết trong email. */
  webUrl: string;
  logger: Logger;
  now?: () => Date;
}

/** Người gửi lời mời. */
export interface Inviter {
  id: string;
  displayName: string;
  locale: Locale;
}

export function createStudentInvitationsService(deps: StudentInvitationsServiceDeps) {
  const { dataSource, hasher, rateLimiter, logger } = deps;
  const now = deps.now ?? (() => new Date());

  const invalid = () => new AppError('invitation_invalid', 'Invitation is not usable');

  function assertUsable(invitation: StudentInvitation | null): StudentInvitation {
    if (!invitation || invitation.acceptedAt || invitation.revokedAt) throw invalid();
    if (invitation.expiresAt.getTime() <= now().getTime()) {
      throw new AppError('invitation_expired', 'Invitation expired');
    }
    return invitation;
  }

  /**
   * Lời mời còn dùng được và hồ sơ của nó. Không tồn tại, đã dùng, đã hủy, hồ sơ đã xóa hoặc đã có tài
   * khoản: `invitation_invalid`. Quá 7 ngày: `invitation_expired`.
   *
   * `lock` (trong transaction): khóa hồ sơ TRƯỚC rồi mới khóa lời mời, cùng thứ tự với `invite`, để gửi
   * lời mời mới và nhận lời mời cùng lúc không bị deadlock; sau khi khóa thì đọc và kiểm tra lại.
   */
  async function resolveUsable(
    manager: EntityManager,
    token: string,
    options: { lock?: boolean } = {},
  ): Promise<{ invitation: StudentInvitation; learner: Learner }> {
    const invitations = createStudentInvitationsRepository(manager);
    const tokenHash = hashInvitationToken(token);
    let invitation = assertUsable(await invitations.findByTokenHash(tokenHash));
    const learner = await createLearnersRepository(manager).findActive(
      invitation.learnerId,
      options,
    );
    if (!learner || learner.accountUserId) throw invalid();
    if (options.lock) {
      invitation = assertUsable(await invitations.findByTokenHash(tokenHash, { lock: true }));
    }
    return { invitation, learner };
  }

  const learnerName = (learner: Learner) => learner.nickname ?? learner.fullName ?? '';

  const isEmailUniqueViolation = (error: unknown) =>
    error instanceof QueryFailedError &&
    (error.driverError as { constraint?: string } | undefined)?.constraint === 'users_email_uq';

  return {
    /**
     * Phụ huynh mời con. Lời mời đang mở trước đó (nếu có) bị hủy: chỉ liên kết mới nhất dùng được.
     * Không kiểm tra email đã có tài khoản hay chưa ở bước này, để không lộ email nào đã đăng ký.
     */
    async invite(
      inviter: Inviter,
      learnerId: string,
      email: string,
    ): Promise<PendingStudentInvitation> {
      const limit = await rateLimiter.hit(
        `student-invite:${inviter.id}`,
        STUDENT_INVITATION_RULES.maxSendsPerHour,
        60 * 60,
      );
      if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds, 'Too many invitations');

      const token = generateToken();
      const invitation = await dataSource.transaction(async (manager) => {
        await createLearnerAccess(manager).assertParentOf(inviter.id, learnerId);
        const learner = await createLearnersRepository(manager).findActive(learnerId, {
          lock: true,
        });
        if (!learner) throw notFound('Learner');
        if (learner.accountUserId) throw conflict('Learner already has a student account');

        const invitations = createStudentInvitationsRepository(manager);
        await invitations.revokeOpen(learnerId);
        return invitations.create({
          learnerId,
          email,
          tokenHash: hashInvitationToken(token),
          invitedBy: inviter.id,
          expiresAt: new Date(now().getTime() + STUDENT_INVITATION_RULES.ttlSeconds * 1000),
        });
      });

      await deps.sendEmail(
        buildStudentInvitationEmail({
          locale: inviter.locale,
          to: email,
          inviterName: inviter.displayName,
          link: studentInvitationLink(deps.webUrl, token),
        }),
      );
      logger.info(
        { userId: inviter.id, learnerId, invitationId: invitation.id },
        'Student invitation sent',
      );
      return toPendingInvitationDto(invitation);
    },

    /** Phụ huynh hủy lời mời đang mở. Không có lời mời nào đang mở: 404. */
    async revoke(actorId: string, learnerId: string): Promise<void> {
      await dataSource.transaction(async (manager) => {
        await createLearnerAccess(manager).assertParentOf(actorId, learnerId);
        const revoked = await createStudentInvitationsRepository(manager).revokeOpen(learnerId);
        if (revoked === 0) throw notFound('Invitation');
      });
      logger.info({ userId: actorId, learnerId }, 'Student invitation revoked');
    },

    /** Trang nhận lời mời: thông tin để hiển thị trước khi đặt mật khẩu. */
    async preview(token: string): Promise<StudentInvitationPreview> {
      const { invitation, learner } = await resolveUsable(dataSource.manager, token);
      const inviter = await createUsersRepository(dataSource.manager).findById(
        invitation.invitedBy,
      );
      return {
        email: invitation.email,
        inviterName: inviter?.displayName ?? '',
        learnerName: learnerName(learner),
        expiresAt: invitation.expiresAt.toISOString(),
      };
    },

    /**
     * Con nhận lời mời: tạo tài khoản học sinh (email lấy từ lời mời, coi như đã xác thực vì nhận được
     * liên kết), gắn vào hồ sơ, đánh dấu lời mời đã dùng. Tất cả trong một transaction, khóa dòng lời mời
     * để hai lần bấm cùng lúc chỉ một lần thành công. Trả id tài khoản để controller đăng nhập.
     *
     * Email đã có tài khoản đã xác thực: 409 `email_taken` (người nhận chính là chủ email nên không lộ gì).
     * Email chỉ có tài khoản đăng ký dở (chưa xác thực): dùng lại tài khoản đó (D57).
     */
    async accept(
      input: AcceptStudentInvitationRequest,
      ipAddress: string | null,
    ): Promise<{ userId: string; learnerId: string }> {
      // Kiểm tra trước khi băm mật khẩu (argon2 tốn CPU): token sai không tốn công băm.
      await resolveUsable(dataSource.manager, input.token);
      const passwordHash = await hasher.hash(input.password);

      try {
        const result = await dataSource.transaction(async (manager) => {
          const { invitation, learner } = await resolveUsable(manager, input.token, {
            lock: true,
          });
          const users = createUsersRepository(manager);
          const fullName = learner.fullName ?? '';
          const profile = {
            passwordHash,
            fullName,
            displayName: learner.nickname ?? fullName,
            phone: null,
            locale: input.locale,
          };

          const existing = await users.findByEmail(invitation.email);
          if (existing?.emailVerifiedAt) {
            throw new AppError('email_taken', 'Email already registered');
          }
          let userId: string;
          if (existing) {
            await users.updatePendingRegistration(existing.id, profile);
            await users.revokeOtherSelfRegisteredRoles(existing.id, 'student');
            userId = existing.id;
          } else {
            userId = (await users.create({ email: invitation.email, ...profile })).id;
          }
          await users.markEmailVerified(userId);
          // Vai trò học sinh do phụ huynh cấp (granted_by), không phải tự đăng ký.
          await users.grantRole(userId, 'student', invitation.invitedBy);
          await users.recordConsents(
            userId,
            ['terms_of_service', 'privacy_policy'],
            LEGAL_DOCUMENT_VERSION,
            ipAddress,
          );

          const learners = createLearnersRepository(manager);
          if (!(await learners.linkAccount(learner.id, userId))) throw invalid();
          if (!(await createStudentInvitationsRepository(manager).markAccepted(invitation.id))) {
            throw invalid();
          }
          return { userId, learnerId: learner.id };
        });
        logger.info(result, 'Student invitation accepted');
        return result;
      } catch (error) {
        if (isEmailUniqueViolation(error)) {
          throw new AppError('email_taken', 'Email already registered', undefined, {
            cause: error,
          });
        }
        throw error;
      }
    },
  };
}

export type StudentInvitationsService = ReturnType<typeof createStudentInvitationsService>;
