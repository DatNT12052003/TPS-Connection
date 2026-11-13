import { useTranslation } from 'react-i18next';
import { useRouteLoaderData } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Alert } from '~/components/ui/alert';
import { messagesFromMatches } from '~/lib/meta';
import type { Route } from './+types/home';
import type { loader as adminLayoutLoader } from './layout';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.layout.managerArea} – ${m.common.appName}` }];
}

export default function AdminHomePage() {
  const { t } = useTranslation();
  const layout = useRouteLoaderData<typeof adminLayoutLoader>('routes/admin/layout');
  const area = t(layout?.role === 'admin' ? 'layout.adminArea' : 'layout.managerArea');

  return (
    <PageContainer>
      <h1 className="text-h1">{area}</h1>
      <Alert>{t('adminHome.placeholder', { area })}</Alert>
    </PageContainer>
  );
}
