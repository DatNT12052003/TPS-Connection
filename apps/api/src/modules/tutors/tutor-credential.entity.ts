import type { CredentialKind, CredentialVerificationStatus } from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Bằng cấp, chứng chỉ, thẻ sinh viên của gia sư (`tutor_credentials`). Gia sư tự khai (`self_declared`);
 * nộp ảnh để Manager xác minh ở G3 (`pending` → `verified` / `rejected`, B.4.2).
 */
@Entity({ name: 'tutor_credentials' })
export class TutorCredential {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tutor_id', type: 'uuid' })
  tutorId!: string;

  @Column({ type: 'text' })
  kind!: CredentialKind;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  issuer!: string | null;

  @Column({ name: 'issued_year', type: 'smallint', nullable: true })
  issuedYear!: number | null;

  @Column({ name: 'verification_status', type: 'text', default: 'self_declared' })
  verificationStatus!: CredentialVerificationStatus;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
