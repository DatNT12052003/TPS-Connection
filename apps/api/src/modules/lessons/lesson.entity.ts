// Lịch lặp (`class_schedules`), buổi học (`lessons`, B.6), điểm danh (`lesson_attendances`, B.7), khiếu nại
// (`attendance_disputes`, B.8), điểm và nhận xét (`assessments`). Thiết kế: docs/thiet_ke_co_so_du_lieu.md mục 7.2–7.4;
// migration CreateLessons. Không trả thẳng entity ra API: học sinh không thấy học phí.
import type {
  AssessmentKind,
  AttendanceConfirmationStatus,
  AttendanceDisputeStatus,
  AttendanceStatus,
  ClassScheduleStatus,
  LessonCancelKind,
  LessonMode,
  LessonStatus,
} from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'class_schedules' })
export class ClassScheduleRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  /** ISO: 1 = thứ Hai … 7 = Chủ nhật. */
  @Column({ type: 'smallint', array: true })
  weekdays!: number[];

  @Column({ type: 'text' })
  rrule!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'until_date', type: 'date', nullable: true })
  untilDate!: string | null;

  /** `HH:MM:SS` theo giờ địa phương (`timezone`). */
  @Column({ name: 'local_start_time', type: 'time' })
  localStartTime!: string;

  @Column({ name: 'duration_minutes', type: 'smallint' })
  durationMinutes!: number;

  @Column({ type: 'text', default: 'Asia/Ho_Chi_Minh' })
  timezone!: string;

  @Column({ name: 'teaching_mode', type: 'text' })
  teachingMode!: LessonMode;

  @Column({ name: 'location_note', type: 'text', nullable: true })
  locationNote!: string | null;

  @Column({ name: 'online_url', type: 'text', nullable: true })
  onlineUrl!: string | null;

  @Column({ name: 'generated_until', type: 'date', nullable: true })
  generatedUntil!: string | null;

  @Column({ type: 'text', default: 'active' })
  status!: ClassScheduleStatus;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'lessons' })
export class LessonRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @Column({ name: 'tutor_id', type: 'uuid' })
  tutorId!: string;

  @Column({ name: 'schedule_id', type: 'uuid', nullable: true })
  scheduleId!: string | null;

  @Column({ name: 'occurrence_start', type: 'timestamptz', nullable: true })
  occurrenceStart!: Date | null;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ name: 'teaching_mode', type: 'text' })
  teachingMode!: LessonMode;

  @Column({ name: 'location_note', type: 'text', nullable: true })
  locationNote!: string | null;

  @Column({ name: 'online_url', type: 'text', nullable: true })
  onlineUrl!: string | null;

  @Column({ type: 'text', default: 'scheduled' })
  status!: LessonStatus;

  @Column({ name: 'makeup_for_lesson_id', type: 'uuid', nullable: true })
  makeupForLessonId!: string | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancel_kind', type: 'text', nullable: true })
  cancelKind!: LessonCancelKind | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason!: string | null;

  @Column({ name: 'is_late_cancellation', type: 'boolean', default: false })
  isLateCancellation!: boolean;

  @Column({ name: 'content_taught', type: 'text', nullable: true })
  contentTaught!: string | null;

  @Column({ name: 'tutor_notes', type: 'text', nullable: true })
  tutorNotes!: string | null;

  @Column({ name: 'actual_minutes', type: 'smallint', nullable: true })
  actualMinutes!: number | null;

  @Column({ name: 'recorded_at', type: 'timestamptz', nullable: true })
  recordedAt!: Date | null;

  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedBy!: string | null;

  @Column({ name: 'upcoming_reminded_at', type: 'timestamptz', nullable: true })
  upcomingRemindedAt!: Date | null;

  @Column({ name: 'attendance_reminded_at', type: 'timestamptz', nullable: true })
  attendanceRemindedAt!: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'lesson_attendances' })
export class LessonAttendanceRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId!: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @Column({ type: 'text' })
  status!: AttendanceStatus;

  @Column({ name: 'tutor_comment', type: 'text', nullable: true })
  tutorComment!: string | null;

  @Column({ name: 'fee_rate_id', type: 'uuid', nullable: true })
  feeRateId!: string | null;

  @Column({ name: 'session_price_vnd', type: 'bigint' })
  sessionPriceVnd!: number;

  @Column({ name: 'session_minutes', type: 'smallint' })
  sessionMinutes!: number;

  @Column({ name: 'is_billable', type: 'boolean', default: false })
  isBillable!: boolean;

  @Column({ name: 'billable_amount_vnd', type: 'bigint', default: 0 })
  billableAmountVnd!: number;

  @Column({ name: 'confirmation_status', type: 'text', default: 'pending' })
  confirmationStatus!: AttendanceConfirmationStatus;

  @Column({ name: 'confirm_due_at', type: 'timestamptz' })
  confirmDueAt!: Date;

  @Column({ name: 'confirm_reminded_at', type: 'timestamptz', nullable: true })
  confirmRemindedAt!: Date | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;

  @Column({ name: 'confirmed_by', type: 'uuid', nullable: true })
  confirmedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'attendance_disputes' })
export class AttendanceDisputeRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'attendance_id', type: 'uuid' })
  attendanceId!: string;

  @Column({ name: 'opened_by', type: 'uuid' })
  openedBy!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'claimed_status', type: 'text', nullable: true })
  claimedStatus!: AttendanceStatus | null;

  @Column({ type: 'text', default: 'open' })
  status!: AttendanceDisputeStatus;

  @Column({ name: 'negotiate_until', type: 'timestamptz' })
  negotiateUntil!: Date;

  @Column({ name: 'escalated_at', type: 'timestamptz', nullable: true })
  escalatedAt!: Date | null;

  @Column({ name: 'case_id', type: 'uuid', nullable: true })
  caseId!: string | null;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote!: string | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'assessments' })
export class AssessmentRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @Column({ name: 'lesson_id', type: 'uuid', nullable: true })
  lessonId!: string | null;

  @Column({ name: 'submission_id', type: 'uuid', nullable: true })
  submissionId!: string | null;

  @Column({ type: 'text' })
  kind!: AssessmentKind;

  @Column({ type: 'text' })
  title!: string;

  /** numeric(6,2): driver trả chuỗi, service đổi sang số. */
  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  score!: string | null;

  @Column({ name: 'max_score', type: 'numeric', precision: 6, scale: 2, default: 10 })
  maxScore!: string;

  @Column({ type: 'text' })
  comment!: string;

  @Column({ name: 'assessed_on', type: 'date' })
  assessedOn!: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
