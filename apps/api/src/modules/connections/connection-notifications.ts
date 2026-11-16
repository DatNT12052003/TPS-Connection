// Nội dung thông báo về một yêu cầu kết nối (G5 đợt 3), dùng chung cho service và job hết hạn. Chỉ id, môn, chiều và
// tên hiển thị của bên kia; không có thông tin của trẻ (§12). Gia sư chỉ biết tên phụ huynh sau khi yêu cầu được
// chấp nhận (cùng quy tắc với `ConnectionRequestSummary.client`).
import type { ConnectionParty, NotificationContent } from '@tps/shared';
import type { EntityManager } from 'typeorm';
import type { ConnectionRequest } from './connection.entity.js';
import { createConnectionsRepository } from './connections.repository.js';

type ConnectionNoticeType = Exclude<
  NotificationContent['type'],
  'message_new' | 'verification_result' | 'connection_expiring'
>;

export interface ConnectionNotice {
  userId: string;
  content: NotificationContent;
}

/**
 * Thông báo `type` cho bên `recipient` của yêu cầu. `accepted`: yêu cầu đã (hoặc vừa) được chấp nhận, nên gia sư
 * được thấy tên phụ huynh. `expiring`: thông tin hạn cho loại `connection_expiring`.
 */
export async function connectionNotice(
  manager: EntityManager,
  request: Pick<ConnectionRequest, 'id' | 'direction' | 'subjectId' | 'tutorId' | 'clientUserId'>,
  type: ConnectionNoticeType | 'connection_expiring',
  recipient: ConnectionParty,
  options: {
    accepted: boolean;
    expiring?: { status: 'pending' | 'negotiating'; expiresAt: Date };
  },
): Promise<ConnectionNotice> {
  const display = (await createConnectionsRepository(manager).displayOf([request.id])).get(
    request.id,
  );
  const counterpartName =
    recipient === 'client'
      ? (display?.tutorName ?? null)
      : options.accepted
        ? (display?.clientName ?? null)
        : null;
  const data = {
    requestId: request.id,
    direction: request.direction,
    subjectId: request.subjectId,
    counterpartName,
  };
  const userId = recipient === 'tutor' ? request.tutorId : request.clientUserId;
  if (type === 'connection_expiring') {
    const expiring = options.expiring!;
    return {
      userId,
      content: {
        type,
        data: { ...data, status: expiring.status, expiresAt: expiring.expiresAt.toISOString() },
      },
    };
  }
  return { userId, content: { type, data } };
}
