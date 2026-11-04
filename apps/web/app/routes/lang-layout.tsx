import { Outlet } from 'react-router';
import type { Route } from './+types/lang-layout';
import { isLocale } from '~/lib/i18n';

export const loader = ({ params }: Route.LoaderArgs) => {
  if (!isLocale(params.lang)) throw new Response('Not found', { status: 404 });
  return null;
};

export default function LangLayout() {
  return <Outlet />;
}
