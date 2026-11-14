// /admin/verifications (chưa chọn hồ sơ): ô bên phải nhắc chọn một hồ sơ (chỉ thấy từ 1024 px).
import { useTranslation } from 'react-i18next';
import { Card } from '~/components/ui/card';

export default function VerificationSelectPrompt() {
  const { t } = useTranslation();
  return <Card className="p-6 text-muted-foreground">{t('review.selectPrompt')}</Card>;
}
