import { data } from 'react-router';
import { ErrorContent } from '~/components/layout/error-content';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import type { Route } from './+types/not-found';

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: messagesFromMatches(matches).notFound.metaTitle }];
}

// Mục điều hướng chưa có trang (làm từ G2): 404 nhưng vẫn giữ khung, thanh điều hướng của khu vực.
export function loader() {
  return data(null, { status: 404 });
}

export default function AppNotFoundPage() {
  return <ErrorContent kind="notFound" homePath={PATHS.app} />;
}
