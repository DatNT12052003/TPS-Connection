// Hiển thị cuộc trò chuyện (G5): dòng xem trước tin cuối, dùng ở danh sách hội thoại và trang tổng quan.
import type { ConversationSummary } from '@tps/shared';
import type { TFunction } from 'i18next';

/** Dòng xem trước tin cuối: "Bạn: …", "Đã gửi tệp", "Tin nhắn đã xóa". */
export function lastMessagePreview(t: TFunction, conversation: ConversationSummary): string {
  const last = conversation.lastMessage;
  if (!last) return t('chat.noMessages');
  const text = last.deleted
    ? t('chat.deleted')
    : (last.preview ?? (last.hasAttachments ? t('chat.sentFile') : ''));
  return last.isMine ? t('chat.youPrefix', { text }) : text;
}
