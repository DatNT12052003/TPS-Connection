import { Outlet } from 'react-router';
import { PublicLayout } from '~/components/layout/public-layout';

export default function PublicLayoutRoute() {
  return (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  );
}
