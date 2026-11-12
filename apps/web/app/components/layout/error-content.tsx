import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, buttonVariants } from '~/components/ui/button';
import { PATHS } from '~/lib/navigation';
import { PageContainer } from './page';

interface ErrorContentProps {
  kind: 'notFound' | 'error';
  /** Chỉ truyền ở môi trường dev. */
  stack?: string | undefined;
  homePath?: string;
}

/** Nội dung trang 404 / trang lỗi: nói rõ chuyện gì xảy ra và một hành động để đi tiếp. */
export function ErrorContent({ kind, stack, homePath = PATHS.home }: ErrorContentProps) {
  const { t } = useTranslation();
  const title = kind === 'notFound' ? t('notFound.title') : t('errorPage.title');
  const body = kind === 'notFound' ? t('notFound.body') : t('errorPage.body');

  return (
    <PageContainer className="max-w-2xl py-12 md:py-16">
      <h1 className="text-h1">{title}</h1>
      <p className="text-body-lg text-muted-foreground">{body}</p>
      <div className="flex flex-wrap gap-2">
        {kind === 'notFound' ? (
          <Link to={homePath} className={buttonVariants({ variant: 'primary' })}>
            {t('notFound.backHome')}
          </Link>
        ) : (
          <Button onClick={() => window.location.reload()}>{t('errorPage.reload')}</Button>
        )}
      </div>
      {stack && (
        <pre className="overflow-x-auto rounded-md bg-surface-sunken p-4 text-small">
          <code>{stack}</code>
        </pre>
      )}
    </PageContainer>
  );
}
