// Tình trạng tài khoản học sinh của một hồ sơ con (D4, D50): đã có tài khoản / đang chờ con nhận lời mời /
// chưa mời. Hiện trên trang tổng quan và trang hồ sơ con của phụ huynh.
import type { Learner } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button';
import { PATHS } from '~/lib/navigation';
import { cn } from '~/lib/utils';
import { formatDate } from '~/lib/format';

type Props = { learner: Pick<Learner, 'id' | 'hasStudentAccount' | 'pendingInvitation'> };

export const invitePath = (learnerId: string) => `${PATHS.children}/${learnerId}/invite`;

/** Dạng gọn cho danh sách: chỉ một nhãn (đã có tài khoản / chờ con nhận lời mời); chưa mời thì không có. */
export function StudentAccountBadge({ learner }: Props) {
  const { t } = useTranslation();
  if (learner.hasStudentAccount) return <Badge variant="success">{t('invite.hasAccount')}</Badge>;
  if (learner.pendingInvitation) return <Badge variant="warning">{t('invite.pending')}</Badge>;
  return null;
}

export function StudentAccountStatus({ learner }: Props) {
  const { t, i18n } = useTranslation();
  if (learner.hasStudentAccount) {
    return (
      <div className="flex flex-col gap-2">
        <span>
          <Badge variant="success">{t('invite.hasAccount')}</Badge>
        </span>
        <p className="text-small text-muted-foreground">{t('invite.hasAccountNote')}</p>
      </div>
    );
  }
  const pending = learner.pendingInvitation;
  return (
    <div className="flex flex-col items-start gap-2">
      {pending ? (
        <>
          <Badge variant="warning">{t('invite.pending')}</Badge>
          <p className="text-small text-muted-foreground">
            {t('invite.pendingDetail', {
              email: pending.email,
              date: formatDate(pending.expiresAt, i18n.language),
            })}
          </p>
        </>
      ) : (
        <p className="text-small text-muted-foreground">{t('invite.noAccountNote')}</p>
      )}
      <Link
        to={invitePath(learner.id)}
        className={cn(
          buttonVariants({ variant: pending ? 'ghost' : 'secondary' }),
          pending && 'px-0',
        )}
      >
        {t(pending ? 'invite.manage' : 'invite.cta')}
      </Link>
    </div>
  );
}
