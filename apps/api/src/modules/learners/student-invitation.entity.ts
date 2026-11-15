import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Lời mời con tạo tài khoản học sinh (`student_invitations`, D4, D50). Chỉ lưu SHA-256 của token trong
 * liên kết: lộ database cũng không dùng được liên kết. Dùng một lần (`acceptedAt`), hết hạn sau 7 ngày.
 */
@Entity({ name: 'student_invitations' })
export class StudentInvitation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'learner_id', type: 'uuid' })
  learnerId!: string;

  /** Email của con, nơi nhận liên kết; cũng là email đăng nhập của tài khoản học sinh. */
  @Column({ type: 'citext' })
  email!: string;

  @Column({ name: 'token_hash', type: 'text', select: false })
  tokenHash!: string;

  @Column({ name: 'invited_by', type: 'uuid' })
  invitedBy!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
