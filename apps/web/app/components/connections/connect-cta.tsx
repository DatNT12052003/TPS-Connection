// Nút gửi yêu cầu kết nối trên hồ sơ gia sư và bài tuyển (G5, §5.1). Phụ huynh: tới form gửi yêu cầu. Người đã đăng
// nhập khác (gia sư, học sinh): lời giải thích. Khách: đăng nhập rồi quay lại trang này.
import type { Role } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { Link, useRouteLoaderData } from 'react-router';
import { buttonVariants } from '~/components/ui/button';
import { PATHS } from '~/lib/navigation';
import type { loader as rootLoader } from '~/root';

export function ConnectCta({
  tutorSlug,
  postSlug,
  returnTo,
  showRegister = false,
}: {
  tutorSlug: string;
  /** Gửi từ một bài tuyển. */
  postSlug?: string;
  /** Trang hiện tại, để khách đăng nhập xong quay lại. */
  returnTo: string;
  showRegister?: boolean;
}) {
  const { t } = useTranslation();
  const user = useRouteLoaderData<typeof rootLoader>('root')?.user;
  const roles: readonly Role[] = user?.roles ?? [];

  if (user && roles.includes('parent')) {
    const params = new URLSearchParams({ tutor: tutorSlug });
    if (postSlug) params.set('post', postSlug);
    return (
      <>
        <Link
          to={`${PATHS.newConnection}?${params.toString()}`}
          className={buttonVariants({ size: 'lg', block: true })}
        >
          {t('tutorPublic.sendRequest')}
        </Link>
        <Link to={PATHS.connections} className={buttonVariants({ variant: 'ghost', block: true })}>
          {t('tutorPublic.existingRequests')}
        </Link>
      </>
    );
  }
  if (user) {
    return <p className="text-small text-muted-foreground">{t('tutorPublic.parentsOnly')}</p>;
  }
  return (
    <>
      <Link
        to={`${PATHS.login}?redirectTo=${encodeURIComponent(returnTo)}`}
        className={buttonVariants({ size: 'lg', block: true })}
      >
        {t('tutorPublic.loginToConnect')}
      </Link>
      {showRegister && (
        <Link to={PATHS.register} className={buttonVariants({ variant: 'secondary', block: true })}>
          {t('layout.register')}
        </Link>
      )}
    </>
  );
}
