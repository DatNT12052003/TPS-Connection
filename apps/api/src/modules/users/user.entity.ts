import type { Locale, UserStatus } from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tài khoản (`users`). Không bao giờ trả thẳng entity này ra API: email, số điện thoại, họ tên thật và
 * password hash chỉ đi ra qua DTO đã lọc theo quyền (D16).
 */
@Entity({ name: 'users' })
export class User {
  /** uuidv7 do PostgreSQL sinh (DEFAULT uuidv7()). */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** citext: so sánh không phân biệt hoa thường. NULL sau khi ẩn danh hóa. */
  @Column({ type: 'citext', nullable: true })
  email!: string | null;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  /** argon2. NULL khi tài khoản chưa đặt mật khẩu (học sinh chưa nhận lời mời) hoặc đã ẩn danh hóa. */
  @Column({ name: 'password_hash', type: 'text', nullable: true, select: false })
  passwordHash!: string | null;

  /** Tự khai, chưa xác thực (C12). */
  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ name: 'phone_verified_at', type: 'timestamptz', nullable: true })
  phoneVerifiedAt!: Date | null;

  /** Tên hiển thị công khai. */
  @Column({ name: 'display_name', type: 'text' })
  displayName!: string;

  /** Họ tên thật, không công khai. */
  @Column({ name: 'full_name', type: 'text', nullable: true })
  fullName!: string | null;

  @Column({ name: 'avatar_file_id', type: 'uuid', nullable: true })
  avatarFileId!: string | null;

  @Column({ type: 'text', default: 'vi' })
  locale!: Locale;

  @Column({ type: 'text', default: 'active' })
  status!: UserStatus;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  /**
   * Người dùng xóa tài khoản: ẩn ngay, ẩn danh hóa sau 6 tháng (C2). Không dùng @DeleteDateColumn để mọi
   * truy vấn phải tự lọc `deleted_at IS NULL` một cách tường minh (job ẩn danh hóa cần đọc cả tài khoản đã xóa).
   */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'anonymized_at', type: 'timestamptz', nullable: true })
  anonymizedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
