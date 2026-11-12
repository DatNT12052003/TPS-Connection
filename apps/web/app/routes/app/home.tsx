import { useTranslation } from 'react-i18next';
import { useRouteLoaderData } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Alert } from '~/components/ui/alert';
import { messagesFromMatches } from '~/lib/meta';
import type { Route } from './+types/home';
import type { loader as appLayoutLoader } from './layout';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.appHome.title} – ${m.common.appName}` }];
}

export default function AppHomePage() {
  const { t } = useTranslation();
  const layout = useRouteLoaderData<typeof appLayoutLoader>('routes/app/layout');
  const role = layout?.role ?? 'tutor';

  return (
    <PageContainer>
      <h1 className="text-h1">{t('appHome.title')}</h1>
      <Alert>{t('appHome.placeholder', { role: t(`role.${role}`) })}</Alert>
    </PageContainer>
  );
}
