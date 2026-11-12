import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { SystemStatusPanel, type SystemStatusState } from './system-status-panel';

const CHECKED_AT = Date.UTC(2026, 10, 12, 12, 30, 5); // 19:30:05 giờ Việt Nam

function renderPanel(state: SystemStatusState, refreshing = false, onRefresh = vi.fn()) {
  renderWithProviders(
    <SystemStatusPanel state={state} refreshing={refreshing} onRefresh={onRefresh} />,
  );
  return { onRefresh };
}

describe('SystemStatusPanel', () => {
  it('shows every check as running when all are ok', () => {
    renderPanel({
      kind: 'ready',
      checkedAt: CHECKED_AT,
      report: {
        status: 'ok',
        checks: {
          database: { status: 'ok', latencyMs: 4 },
          redis: { status: 'ok', latencyMs: 2 },
        },
      },
    });

    expect(screen.getByRole('status')).toHaveTextContent('Mọi dịch vụ đang hoạt động');
    expect(screen.getByText('Cơ sở dữ liệu')).toBeInTheDocument();
    expect(screen.getByText('Bộ nhớ đệm và hàng đợi')).toBeInTheDocument();
    expect(screen.getAllByText('Hoạt động')).toHaveLength(2);
    expect(screen.getByText('Kiểm tra lúc 19:30:05')).toBeInTheDocument();
  });

  it('flags a failing check with text, not colour alone', () => {
    renderPanel({
      kind: 'ready',
      checkedAt: CHECKED_AT,
      report: {
        status: 'error',
        checks: {
          database: { status: 'ok', latencyMs: 4 },
          redis: { status: 'error', latencyMs: 2000 },
        },
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Có dịch vụ đang gặp sự cố');
    expect(screen.getByText('Lỗi')).toBeInTheDocument();
  });

  it('explains that the API cannot be reached', () => {
    renderPanel({ kind: 'unreachable', code: 'service_unavailable' });
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được API');
  });

  it('calls onRefresh when the user asks to check again', async () => {
    const { onRefresh } = renderPanel({ kind: 'loading' });
    await userEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại' }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('disables the button while a check is running', () => {
    renderPanel({ kind: 'loading' }, true);
    expect(screen.getByRole('button', { name: 'Đang kiểm tra…' })).toBeDisabled();
  });

  it('renders in English', () => {
    renderWithProviders(
      <SystemStatusPanel
        state={{ kind: 'unreachable', code: 'service_unavailable' }}
        refreshing={false}
        onRefresh={() => {}}
      />,
      { locale: 'en' },
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the API');
  });
});
