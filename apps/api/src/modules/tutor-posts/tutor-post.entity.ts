// Bài tuyển học sinh của gia sư (`tutor_posts`, B.2) và các bảng con: môn × khối, khu vực dạy trực tiếp, lịch dạy.
// Bảng con được lưu lại toàn bộ mỗi lần gia sư lưu bài (xóa rồi thêm trong cùng transaction).
import type { RateUnit, TutorPostStatus } from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Không trả thẳng entity ra API. */
@Entity({ name: 'tutor_posts' })
export class TutorPost {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tutor_id', type: 'uuid' })
  tutorId!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'teaches_online', type: 'boolean', default: false })
  teachesOnline!: boolean;

  @Column({ name: 'teaches_in_person', type: 'boolean', default: false })
  teachesInPerson!: boolean;

  /** VND. int8 được đọc thành number. */
  @Column({ name: 'rate_amount_vnd', type: 'bigint', nullable: true })
  rateAmountVnd!: number | null;

  @Column({ name: 'rate_unit', type: 'text', nullable: true })
  rateUnit!: RateUnit | null;

  /** Số học sinh có thể nhận. */
  @Column({ type: 'smallint', nullable: true })
  capacity!: number | null;

  /** `date`: chuỗi YYYY-MM-DD. */
  @Column({ name: 'available_from', type: 'date', nullable: true })
  availableFrom!: string | null;

  @Column({ type: 'text', default: 'draft' })
  status!: TutorPostStatus;

  @Column({ name: 'moderation_hidden_at', type: 'timestamptz', nullable: true })
  moderationHiddenAt!: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'view_count', type: 'integer', default: 0 })
  viewCount!: number;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/** `tutor_post_subjects`: môn × khối lớp của bài. */
@Entity({ name: 'tutor_post_subjects' })
export class TutorPostSubject {
  @PrimaryColumn({ name: 'post_id', type: 'uuid' })
  postId!: string;

  @PrimaryColumn({ name: 'subject_id', type: 'integer' })
  subjectId!: number;

  @PrimaryColumn({ name: 'grade_level_id', type: 'integer' })
  gradeLevelId!: number;
}

/** `tutor_post_areas`: tỉnh hoặc xã dạy trực tiếp. */
@Entity({ name: 'tutor_post_areas' })
export class TutorPostArea {
  @PrimaryColumn({ name: 'post_id', type: 'uuid' })
  postId!: string;

  @PrimaryColumn({ name: 'area_id', type: 'integer' })
  areaId!: number;
}

/** `tutor_post_slots`: khung giờ có thể dạy trong tuần (giờ Việt Nam). */
@Entity({ name: 'tutor_post_slots' })
export class TutorPostSlot {
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
