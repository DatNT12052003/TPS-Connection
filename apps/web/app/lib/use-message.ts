import { useTranslation } from 'react-i18next';
import type { Message } from './form';

/** Dịch một Message (khóa i18n + tham số); không có thì undefined (tiện cho prop `error` của ô nhập). */
export function useMessage(): (message: Message | undefined) => string | undefined {
  const { t } = useTranslation();
  return (message) => (message ? t(message.key, { ...message.values }) : undefined);
}
