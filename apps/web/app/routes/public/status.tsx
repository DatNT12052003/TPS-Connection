// Trang mẫu gọi API: lần đầu lấy trạng thái ở server (SSR, loader), sau đó TanStack Query tự kiểm tra lại
// mỗi 15 giây trên trình duyệt và khi bấm "Kiểm tra lại".
import { useQuery } from '@tanstack/react-query';
import type { ErrorCode } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '~/components/layout/page';
import { fetchHealth, healthQueryOptions } from '~/features/system-status/health-query';
import {
  SystemStatusPanel,
  type SystemStatusState,
} from '~/features/system-status/system-status-panel';
import { ApiError } from '~/lib/api';
import { messagesFromMatches } from '~/lib/meta';
import type { Route } from './+types/status';

export function meta({ matches }: Route.MetaArgs) {
  const { status } = messagesFromMatches(matches);
  return [{ title: status.metaTitle }, { name: 'robots', content: 'noindex' }];
}

export async function loader() {
  try {
    const report = await fetchHealth(AbortSignal.timeout(5_000));
    return { initial: { kind: 'ready', report, checkedAt: Date.now() } as const };
  } catch (err) {
    const code: ErrorCode = err instanceof ApiError ? err.code : 'service_unavailable';
    return { initial: { kind: 'unreachable', code } as const };
  }
}

export default function StatusPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { initial } = loaderData;

  const query = useQuery({
    ...healthQueryOptions,
    ...(initial.kind === 'ready' && {
      initialData: initial.report,
      initialDataUpdatedAt: initial.checkedAt,
    }),
  });

  let state: SystemStatusState;
  if (query.isError) {
    state = {
      kind: 'unreachable',
      code: query.error instanceof ApiError ? query.error.code : 'internal_error',
    };
  } else if (query.data) {
    state = { kind: 'ready', report: query.data, checkedAt: query.dataUpdatedAt };
  } else if (initial.kind === 'unreachable') {
    state = initial;
  } else {
    state = { kind: 'loading' };
  }

  return (
    <PageContainer className="max-w-3xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('status.title')}</h1>
        <p className="text-muted-foreground">{t('status.lead')}</p>
      </div>
      <SystemStatusPanel
        state={state}
        refreshing={query.isFetching}
        onRefresh={() => void query.refetch()}
        showDevHint={import.meta.env.DEV}
      />
    </PageContainer>
  );
}
