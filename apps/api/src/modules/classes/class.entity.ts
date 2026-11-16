// Lớp học (`tutoring_classes`, B.5.1), ghi danh (`class_enrollments`, B.5.2), mức học phí (`enrollment_fee_rates`,
// B.5.3) và mục tiêu học tập (`learning_goals`). Thiết kế: docs/thiet_ke_co_so_du_lieu.md mục 7.1; migration
// CreateTeachingClasses. Không trả thẳng entity ra API: lưu ý giảng dạy chỉ gia sư xem, học phí không cho học sinh.
import type {
  EnrollmentStatus,
  FeeRateStatus,
  LearningGoalPeriod,
  LearningGoalStatus,
  TeachingMode,
  TutoringClassStatus,
} from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tutoring_classes' })
export class TutoringClass {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tutor_id', type: 'uuid' })
  tutorId!: string;

  @Column({ type: 'text', nullable: true })
  name!: string | null;

  @Column({ name: 'subject_id', type: 'integer' })
  subjectId!: number;

  @Column({ name: 'grade_level_id', type: 'integer' })
  gradeLevelId!: number;

  @Column({ name: 'teaching_mode', type: 'text' })
  teachingMode!: TeachingMode;

  @Column({ name: 'class_type', type: 'text', default: 'one_on_one' })
  classType!: 'one_on_one' | 'group';

  @Column({ type: 'smallint', default: 1 })
  capacity!: number;

  @Column({ type: 'text', default: 'active' })
  status!: TutoringClassStatus;

  @Column({ name: 'started_on', type: 'date' })
  startedOn!: string;

  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  pausedAt!: Date | null;

  @Column({ name: 'ended_on', type: 'date', nullable: true })
  endedOn!: string | null;

  @Column({ name: 'ended_reason', type: 'text', nullable: true })
  endedReason!: string | null;

  @Column({ type: 'text', default: 'Asia/Ho_Chi_Minh' })
  timezone!: string;

  @Column({ name: 'created_from_request_id', type: 'uuid', nullable: true })
  createdFromRequestId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'class_enrollments' })
export class ClassEnrollmentRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @Column({ name: 'learner_id', type: 'uuid' })
  learnerId!: string;

  /** Người trả học phí tại thời điểm ghi danh. */
  @Column({ name: 'client_user_id', type: 'uuid' })
  clientUserId!: string;

  @Column({ name: 'connection_request_id', type: 'uuid', nullable: true })
  connectionRequestId!: string | null;

  @Column({ type: 'text', default: 'active' })
  status!: EnrollmentStatus;

  @Column({ name: 'joined_on', type: 'date' })
  joinedOn!: string;

  @Column({ name: 'left_on', type: 'date', nullable: true })
  leftOn!: string | null;

  @Column({ name: 'initial_assessment', type: 'text', nullable: true })
  initialAssessment!: string | null;

  /** Chỉ gia sư xem. */
  @Column({ name: 'teaching_notes', type: 'text', nullable: true })
  teachingNotes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'enrollment_fee_rates' })
export class EnrollmentFeeRate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @Column({ name: 'session_price_vnd', type: 'bigint' })
  sessionPriceVnd!: number;

  @Column({ name: 'session_minutes', type: 'smallint' })
  sessionMinutes!: number;

  @Column({ type: 'text' })
  status!: FeeRateStatus;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'effective_from', type: 'timestamptz', nullable: true })
  effectiveFrom!: Date | null;

  @Column({ name: 'proposed_by', type: 'uuid' })
  proposedBy!: string;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy!: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @Column({ name: 'source_terms_id', type: 'uuid', nullable: true })
  sourceTermsId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'learning_goals' })
export class LearningGoalRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @Column({ name: 'period_type', type: 'text' })
  periodType!: LearningGoalPeriod;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text', default: 'active' })
  status!: LearningGoalStatus;

  @Column({ name: 'progress_note', type: 'text', nullable: true })
  progressNote!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
