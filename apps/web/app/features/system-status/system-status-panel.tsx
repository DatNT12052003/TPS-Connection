// Phần hiển thị trạng thái hệ thống: chỉ nhận dữ liệu qua props (không gọi API), để test đủ các trạng thái.
import type { ErrorCode, HealthReport } from '@tps/shared';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { cn } from '~/lib/utils';

export type SystemStatusState =
  | { kind: 'loading' }
  | { kind: 'unreachable'; code: ErrorCode }
  | { kind: 'ready'; report: HealthReport; checkedAt: number };

interface SystemStatusPanelProps {
  state: SystemStatusState;
  /** Đang kiểm tra lại (đã có dữ liệu cũ trên màn hình). */
  refreshing: boolean;
  onRefresh: () => void;
  showDevHint?: boolean;
}

const CHECK_LABELS = {
  database: 'status.checkDatabase',
  redis: 'status.checkRedis',
  storage: 'status.checkStorage',
} as const;

const isKnownCheck = (name: string): name is keyof typeof CHECK_LABELS => name in CHECK_LABELS;

export function SystemStatusPanel({
  state,
  refreshing,
  onRefresh,
  showDevHint = false,
}: SystemStatusPanelProps) {
  const { t, i18n } = useTranslation();

  // Giờ hiển thị theo Asia/Ho_Chi_Minh (cố định), để server và trình duyệt render giống nhau.
  const formatTime = (timestamp: number) =>
    new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(timestamp);

  return (
    <Card aria-labelledby="system-status-title" aria-busy={refreshing || state.kind === 'loading'}>
      <CardHeader>
        <h2 id="system-status-title" className="text-h3">
          {t('status.services')}
        </h2>
        <Button variant="secondary" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw
            aria-hidden="true"
            className={cn(refreshing && 'animate-spin motion-reduce:animate-none')}
          />
          {refreshing ? t('status.checking') : t('status.recheck')}
        </Button>
      </CardHeader>

      {state.kind === 'loading' && (
        <p role="status" className="text-muted-foreground">
          {t('status.checking')}
        </p>
      )}

      {state.kind === 'unreachable' && (
        <Alert variant="danger" role="alert" title={t('status.apiUnreachable')}>
          <p>{t('status.apiUnreachableBody')}</p>
          {showDevHint && <p className="mt-1">{t('status.devHint')}</p>}
        </Alert>
      )}

      {state.kind === 'ready' && (
        <>
          {state.report.status === 'ok' ? (
            <Alert variant="success" role="status" title={t('status.allOk')} />
          ) : (
            <Alert variant="danger" role="alert" title={t('status.someDown')}>
              <p>{t('status.someDownBody')}</p>
            </Alert>
          )}

          <ul className="flex flex-col">
            {Object.entries(state.report.checks).map(([name, check]) => (
              <li
                key={name}
                className="flex min-h-control-md items-center justify-between gap-4 border-t border-border py-2 first:border-t-0"
              >
                <span className="font-semibold">
                  {isKnownCheck(name) ? t(CHECK_LABELS[name]) : name}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-small text-muted-foreground tabular-nums">
                    {t('status.latency', { ms: check.latencyMs })}
                  </span>
                  <Badge variant={check.status === 'ok' ? 'success' : 'danger'} dot>
                    {check.status === 'ok' ? t('status.checkOk') : t('status.checkError')}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>

          <p className="text-small text-muted-foreground">
            {t('status.checkedAt', { time: formatTime(state.checkedAt) })}
          </p>
        </>
      )}
    </Card>
  );
}
