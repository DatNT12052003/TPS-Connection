// /admin/accounts (chưa chọn tài khoản): ô bên phải nhắc chọn một tài khoản (chỉ thấy từ 1024 px).
import { useTranslation } from 'react-i18next';
import { Card } from '~/components/ui/card';

export default function AccountSelectPrompt() {
  const { t } = useTranslation();
  return <Card className="p-6 text-muted-foreground">{t('adminAccounts.selectPrompt')}</Card>;
}
