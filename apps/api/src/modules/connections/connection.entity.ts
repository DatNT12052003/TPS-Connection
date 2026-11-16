// Yêu cầu kết nối (`connection_requests`, B.1), điều kiện hợp tác theo phiên bản (`connection_terms`) và lịch sử
// (`connection_events`). Thiết kế: docs/thiet_ke_co_so_du_lieu.md mục 6.4; migration CreateConnections.
import type {
  ConnectionCancelReason,
  ConnectionDirection,
  ConnectionEventType,
  ConnectionRequestStatus,
  RequestPostGoal,
  TeachingMode,
  TermsScheduleEntry,
} from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Không trả thẳng entity ra API: gia sư không bao giờ thấy `learnerId` hay hồ sơ con khi chưa xác nhận (D16). */
@Entity({ name: 'connection_requests' })
export class ConnectionRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  direction!: ConnectionDirection;

  @Column({ name: 'tutor_id', type: 'uuid' })
  tutorId!: string;

  @Column({ name: 'client_user_id', type: 'uuid' })
  clientUserId!: string;

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

  @Column({ name: 'tutor_post_id', type: 'uuid', nullable: true })
  tutorPostId!: string | null;

  @Column({ name: 'request_post_id', type: 'uuid', nullable: true })
  requestPostId!: string | null;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'text', default: 'pending' })
  status!: ConnectionRequestStatus;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason!: ConnectionCancelReason | null;

  @Column({ name: 'rejection_note', type: 'text', nullable: true })
  rejectionNote!: string | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'expiry_reminded_at', type: 'timestamptz', nullable: true })
  expiryRemindedAt!: Date | null;

  @Column({ name: 'agreed_terms_id', type: 'uuid', nullable: true })
  agreedTermsId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/** Một phiên bản điều kiện hợp tác. Nội dung không sửa được (trigger); chỉ ghi thêm thời điểm xác nhận. */
@Entity({ name: 'connection_terms' })
export class ConnectionTermsVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ name: 'proposed_by', type: 'uuid' })
  proposedBy!: string;

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

  /** VND, số nguyên (int8 đọc thành number). */
  @Column({ name: 'session_price_vnd', type: 'bigint' })
  sessionPriceVnd!: number;

  @Column({ name: 'session_minutes', type: 'smallint' })
  sessionMinutes!: number;

  @Column({ name: 'sessions_per_week', type: 'smallint', nullable: true })
  sessionsPerWeek!: number | null;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  schedule!: TermsScheduleEntry[];

  /** `date`: chuỗi YYYY-MM-DD. */
  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'tutor_confirmed_at', type: 'timestamptz', nullable: true })
  tutorConfirmedAt!: Date | null;

  @Column({ name: 'client_confirmed_at', type: 'timestamptz', nullable: true })
  clientConfirmedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

/** Lịch sử chuyển trạng thái. `actorUserId` null là hệ thống. */
@Entity({ name: 'connection_events' })
export class ConnectionEventRow {
  @PrimaryColumn({ type: 'bigint', generatedIdentity: 'ALWAYS', insert: false })
  id!: number;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @Column({ type: 'text' })
  event!: ConnectionEventType;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'from_status', type: 'text', nullable: true })
  fromStatus!: ConnectionRequestStatus | null;

  @Column({ name: 'to_status', type: 'text', nullable: true })
  toStatus!: ConnectionRequestStatus | null;

  @Column({ type: 'jsonb', nullable: true })
  data!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
