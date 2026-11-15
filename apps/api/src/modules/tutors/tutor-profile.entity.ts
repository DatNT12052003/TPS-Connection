import type { RateUnit, TutorOccupation, TutorProfileStatus } from '@tps/shared';
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Hồ sơ gia sư (`tutor_profiles`), 1-1 với `users`. Các cột văn bản là tự khai. Công khai khi
 * `profileStatus = 'verified'` và tài khoản đang hoạt động (D5, C8). Không trả thẳng entity ra API.
 */
@Entity({ name: 'tutor_profiles' })
export class TutorProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'text', nullable: true })
  headline!: string | null;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Column({ type: 'text', nullable: true })
  occupation!: TutorOccupation | null;

  /** Trường học hoặc đơn vị công tác. */
  @Column({ type: 'text', nullable: true })
  institution!: string | null;

  @Column({ type: 'text', nullable: true })
  major!: string | null;

  @Column({ name: 'highest_education', type: 'text', nullable: true })
  highestEducation!: string | null;

  @Column({ name: 'experience_years', type: 'smallint', nullable: true })
  experienceYears!: number | null;

  @Column({ name: 'teaching_method', type: 'text', nullable: true })
  teachingMethod!: string | null;

  @Column({ type: 'text', nullable: true })
  achievements!: string | null;

  @Column({ name: 'intro_video_url', type: 'text', nullable: true })
  introVideoUrl!: string | null;

  @Column({ name: 'teaches_online', type: 'boolean', default: false })
  teachesOnline!: boolean;

  @Column({ name: 'teaches_in_person', type: 'boolean', default: false })
  teachesInPerson!: boolean;

  /** Học phí tham khảo (D18), VND. int8 được đọc thành number. */
  @Column({ name: 'rate_amount_vnd', type: 'bigint', nullable: true })
  rateAmountVnd!: number | null;

  @Column({ name: 'rate_unit', type: 'text', nullable: true })
  rateUnit!: RateUnit | null;

  @Column({ name: 'accepting_students', type: 'boolean', default: true })
  acceptingStudents!: boolean;

  @Column({ name: 'profile_status', type: 'text', default: 'incomplete' })
  profileStatus!: TutorProfileStatus;

  @Column({ name: 'identity_verified_at', type: 'timestamptz', nullable: true })
  identityVerifiedAt!: Date | null;

  /** Phi chuẩn hóa cho bộ lọc "có bằng cấp đã xác minh" (D20). */
  @Column({ name: 'has_verified_degree', type: 'boolean', default: false })
  hasVerifiedDegree!: boolean;

  /** numeric(3,2): driver pg trả về chuỗi. Có từ bản 3 (đánh giá). */
  @Column({ name: 'rating_avg', type: 'numeric', precision: 3, scale: 2, nullable: true })
  ratingAvg!: string | null;

  @Column({ name: 'rating_count', type: 'integer', default: 0 })
  ratingCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
