import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Hồ sơ người học (`learners`), độc lập với tài khoản: hồ sơ con tồn tại khi trẻ chưa có tài khoản (D4).
 * Họ tên, ngày sinh, trường, địa chỉ là thông tin nhận dạng riêng tư (D16): không bao giờ trả thẳng entity
 * ra API, chỉ qua DTO sau khi đã kiểm tra quyền (learner-access.ts).
 */
@Entity({ name: 'learners' })
export class Learner {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Tài khoản học sinh, NULL khi chưa nhận lời mời. */
  @Column({ name: 'account_user_id', type: 'uuid', nullable: true })
  accountUserId!: string | null;

  /** Người học trưởng thành tự quản lý (D3, chưa mở ở bản đầu). */
  @Column({ name: 'is_self_managed', type: 'boolean', default: false })
  isSelfManaged!: boolean;

  /** NULL chỉ sau khi ẩn danh hóa. */
  @Column({ name: 'full_name', type: 'text', nullable: true })
  fullName!: string | null;

  @Column({ type: 'text', nullable: true })
  nickname!: string | null;

  /** `date`: chuỗi YYYY-MM-DD (không đổi múi giờ). */
  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ name: 'grade_level_id', type: 'integer', nullable: true })
  gradeLevelId!: number | null;

  @Column({ name: 'school_name', type: 'text', nullable: true })
  schoolName!: string | null;

  @Column({ name: 'province_id', type: 'integer', nullable: true })
  provinceId!: number | null;

  @Column({ name: 'commune_id', type: 'integer', nullable: true })
  communeId!: number | null;

  @Column({ name: 'address_line', type: 'text', nullable: true })
  addressLine!: string | null;

  /** Ghi chú của phụ huynh cho gia sư. */
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  /** Xóa mềm: ẩn ngay; lịch sử học tập vẫn giữ (C2). */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'anonymized_at', type: 'timestamptz', nullable: true })
  anonymizedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
