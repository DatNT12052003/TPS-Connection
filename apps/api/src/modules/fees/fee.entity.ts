// Bảng học phí tháng (`fee_statements`, B.10.1), dòng học phí (`fee_statement_items`), thanh toán (`payments`,
// B.10.2). Thiết kế: docs/thiet_ke_co_so_du_lieu.md mục 8; migration CreateFeeStatements. Không trả thẳng entity ra
// API. Tiền là số nguyên VND (bigint, đọc ra số).
import type { FeeStatementStatus, PaymentMethod, PaymentStatus } from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'fee_statements' })
export class FeeStatementRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId!: string;

  @Column({ name: 'tutor_id', type: 'uuid' })
  tutorId!: string;

  @Column({ name: 'client_user_id', type: 'uuid' })
  clientUserId!: string;

  /** Ngày đầu tháng (`YYYY-MM-01`). */
  @Column({ name: 'period_month', type: 'date' })
  periodMonth!: string;

  @Column({ name: 'billable_sessions', type: 'integer', default: 0 })
  billableSessions!: number;

  @Column({ name: 'total_amount_vnd', type: 'bigint', default: 0 })
  totalAmountVnd!: number;

  @Column({ name: 'paid_amount_vnd', type: 'bigint', default: 0 })
  paidAmountVnd!: number;

  @Column({ type: 'text', default: 'issued' })
  status!: FeeStatementStatus;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  @Column({ name: 'due_reminded_at', type: 'timestamptz', nullable: true })
  dueRemindedAt!: Date | null;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt!: Date | null;

  @Column({ name: 'voided_by', type: 'uuid', nullable: true })
  voidedBy!: string | null;

  @Column({ name: 'void_reason', type: 'text', nullable: true })
  voidReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'fee_statement_items' })
export class FeeStatementItemRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'statement_id', type: 'uuid' })
  statementId!: string;

  @Column({ name: 'attendance_id', type: 'uuid', nullable: true })
  attendanceId!: string | null;

  @Column({ name: 'item_type', type: 'text' })
  itemType!: 'session' | 'adjustment';

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'amount_vnd', type: 'bigint' })
  amountVnd!: number;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'payments' })
export class PaymentRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'statement_id', type: 'uuid' })
  statementId!: string;

  @Column({ name: 'amount_vnd', type: 'bigint' })
  amountVnd!: number;

  @Column({ type: 'text' })
  method!: PaymentMethod;

  @Column({ type: 'text', default: 'manual' })
  channel!: 'manual' | 'online';

  @Column({ name: 'paid_on', type: 'date' })
  paidOn!: string;

  @Column({ type: 'text', nullable: true })
  reference!: string | null;

  @Column({ type: 'text', default: 'recorded' })
  status!: PaymentStatus;

  @Column({ name: 'recorded_by', type: 'uuid' })
  recordedBy!: string;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy!: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @Column({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote!: string | null;

  @Column({ name: 'gateway_transaction_id', type: 'text', nullable: true })
  gatewayTransactionId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
