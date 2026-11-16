// Thông báo và tùy chọn thông báo (`notifications`, `notification_preferences`). Thiết kế:
// docs/thiet_ke_co_so_du_lieu.md mục 9; migration CreateNotificationsAndReports.
import type { NotificationChannel, NotificationType } from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Tên `NotificationRow` để không trùng kiểu DTO `Notification` của `@tps/shared`. */
@Entity({ name: 'notifications' })
export class NotificationRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'text' })
  type!: NotificationType;

  /** Chỉ id và tên hiển thị; không có thông tin của trẻ. */
  @Column({ type: 'jsonb', default: {} })
  data!: Record<string, unknown>;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'notification_preferences' })
export class NotificationPreferenceRow {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'text' })
  type!: NotificationType;

  @PrimaryColumn({ type: 'text' })
  channel!: NotificationChannel;

  @Column({ type: 'boolean' })
  enabled!: boolean;
}
