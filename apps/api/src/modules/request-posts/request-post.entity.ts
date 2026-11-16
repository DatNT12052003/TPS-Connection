// Bài tìm gia sư của phụ huynh (`request_posts`, B.3) và lịch học mong muốn (`request_post_slots`).
// Một bài cho một hồ sơ con và một môn (D25). Không lưu địa chỉ chi tiết, chỉ tỉnh/xã (§16.7).
import type {
  BudgetUnit,
  RequestPostClosedReason,
  RequestPostGoal,
  RequestPostStatus,
  TeachingMode,
} from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Không trả thẳng entity ra API; gia sư không bao giờ thấy `learnerId` hay `authorUserId`. */
@Entity({ name: 'request_posts' })
export class RequestPost {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'author_user_id', type: 'uuid' })
  authorUserId!: string;

  @Column({ name: 'learner_id', type: 'uuid' })
  learnerId!: string;

  @Column({ name: 'subject_id', type: 'integer' })
  subjectId!: number;

  @Column({ name: 'grade_level_id', type: 'integer' })
  gradeLevelId!: number;

  @Column({ type: 'text' })
  goal!: RequestPostGoal;

  @Column({ name: 'goal_note', type: 'text', nullable: true })
  goalNote!: string | null;

  @Column({ name: 'teaching_mode', type: 'text' })
  teachingMode!: TeachingMode;

  @Column({ name: 'province_id', type: 'integer', nullable: true })
  provinceId!: number | null;

  @Column({ name: 'commune_id', type: 'integer', nullable: true })
  communeId!: number | null;

  /** VND. int8 được đọc thành number. */
  @Column({ name: 'budget_min_vnd', type: 'bigint', nullable: true })
  budgetMinVnd!: number | null;

  @Column({ name: 'budget_max_vnd', type: 'bigint', nullable: true })
  budgetMaxVnd!: number | null;

  @Column({ name: 'budget_unit', type: 'text', nullable: true })
  budgetUnit!: BudgetUnit | null;

  /** `date`: chuỗi YYYY-MM-DD. */
  @Column({ name: 'desired_start_date', type: 'date', nullable: true })
  desiredStartDate!: string | null;

  @Column({ name: 'tutor_requirements', type: 'text', nullable: true })
  tutorRequirements!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', default: 'draft' })
  status!: RequestPostStatus;

  @Column({ name: 'closed_reason', type: 'text', nullable: true })
  closedReason!: RequestPostClosedReason | null;

  @Column({ name: 'moderation_hidden_at', type: 'timestamptz', nullable: true })
  moderationHiddenAt!: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/** `request_post_slots`: khung giờ học mong muốn trong tuần (giờ Việt Nam). */
@Entity({ name: 'request_post_slots' })
export class RequestPostSlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId!: string;

  /** ISO: 1 = thứ Hai … 7 = Chủ nhật. */
  @Column({ type: 'smallint' })
  weekday!: number;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;
}
