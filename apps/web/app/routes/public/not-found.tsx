import { data } from 'react-router';
import { ErrorContent } from '~/components/layout/error-content';
import { messagesFromMatches } from '~/lib/meta';
import type { Route } from './+types/not-found';

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: messagesFromMatches(matches).notFound.metaTitle }];
}

// Trả HTTP 404 (cho công cụ tìm kiếm) nhưng vẫn giữ khung trang công khai.
export function loader() {
  return data(null, { status: 404 });
}

export default function NotFoundPage() {
  return <ErrorContent kind="notFound" />;
}
