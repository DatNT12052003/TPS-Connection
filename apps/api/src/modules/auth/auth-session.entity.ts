import type { AuthSessionRevokeReason } from '@tps/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Một refresh token trong chuỗi xoay vòng (`auth_sessions`). Mỗi lần làm mới tạo dòng mới cùng `familyId`
 * và ghi `rotatedAt` cho dòng cũ. Dùng lại token đã xoay = bị lộ: thu hồi cả chuỗi (`reuse_detected`).
 * Chỉ lưu hash của token, không lưu token.
 */
@Entity({ name: 'auth_sessions' })
export class AuthSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** Cả chuỗi token sinh ra từ cùng một lần đăng nhập. */
  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Column({ name: 'refresh_token_hash', type: 'text', select: false })
  refreshTokenHash!: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revoke_reason', type: 'text', nullable: true })
  revokeReason!: AuthSessionRevokeReason | null;

  /** Ghi nhớ đăng nhập: refresh cookie bền 30 ngày; không thì cookie phiên, token 12 giờ. */
  @Column({ name: 'remember_me', type: 'boolean', default: false })
  rememberMe!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
