// Hội thoại, người tham gia, tin nhắn và tệp đính kèm (`conversations`, `conversation_participants`, `messages`,
// `message_attachments`). Thiết kế: docs/thiet_ke_co_so_du_lieu.md mục 6.5; migration CreateMessaging.
import type { ConversationKind, ConversationParticipantRole, MessageKind } from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'conversations' })
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  kind!: ConversationKind;

  @Column({ name: 'connection_request_id', type: 'uuid', nullable: true })
  connectionRequestId!: string | null;

  @Column({ name: 'class_id', type: 'uuid', nullable: true })
  classId!: string | null;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'conversation_participants' })
export class ConversationParticipant {
  @PrimaryColumn({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'participant_role', type: 'text' })
  participantRole!: ConversationParticipantRole;

  @Column({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt!: Date | null;

  @Column({ name: 'last_read_message_id', type: 'uuid', nullable: true })
  lastReadMessageId!: string | null;

  @Column({ type: 'boolean', default: false })
  muted!: boolean;
}

/** Tên `MessageRow` để không trùng kiểu DTO `Message` của `@tps/shared`. */
@Entity({ name: 'messages' })
export class MessageRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @Column({ name: 'sender_id', type: 'uuid', nullable: true })
  senderId!: string | null;

  @Column({ type: 'text', default: 'text' })
  kind!: MessageKind;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt!: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'message_attachments' })
export class MessageAttachmentRow {
  @PrimaryColumn({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  @PrimaryColumn({ name: 'file_id', type: 'uuid' })
  fileId!: string;
}
