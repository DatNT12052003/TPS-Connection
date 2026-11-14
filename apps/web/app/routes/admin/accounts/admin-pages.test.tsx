// Giao diện khu Admin: chi tiết tài khoản (khóa / mở khóa / gỡ Manager theo quyền) và bảng danh mục.
import { render, screen } from '@testing-library/react';
import { type ComponentType, StrictMode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';
import { accountDetail } from '../../../../test/api-fixtures';
import { createI18n } from '~/lib/i18n';
import AdminCatalogPage from '../catalog/index';
import AdminAccountPage from './detail';

function renderAt(path: string, Component: ComponentType<never>, loaderData: unknown) {
  const Stub = createRoutesStub([
    { path, Component: Component as ComponentType, loader: () => loaderData },
  ]);
  return render(
    <StrictMode>
      <I18nextProvider i18n={createI18n('vi')}>
        <Stub initialEntries={[path]} />
      </I18nextProvider>
    </StrictMode>,
  );
}

const path = '/admin/accounts/0193a1b2-0000-7000-8000-000000000009';

describe('admin account page', () => {
  it('offers to lock an active account with a reason', async () => {
    renderAt(path, AdminAccountPage, { account: accountDetail(), notice: null });
    expect(await screen.findByRole('heading', { name: 'Hoàng Văn E' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Lý do khóa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khóa tài khoản' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gỡ vai trò Manager' })).not.toBeInTheDocument();
  });

  it('shows why a locked account is locked and offers to unlock it', async () => {
    renderAt(path, AdminAccountPage, {
      account: accountDetail({
        status: 'locked',
        roles: ['manager', 'tutor'],
        lock: {
          reason: 'Báo cáo #R-1042, vi phạm lần 2',
          lockedAt: '2026-11-12T03:05:00.000Z',
          lockedByName: 'Trần Hà',
        },
      }),
      notice: 'locked',
    });
    expect(await screen.findByText('Báo cáo #R-1042, vi phạm lần 2')).toBeInTheDocument();
    expect(screen.getByText(/^Trần Hà · .*12\/11\/2026/)).toBeInTheDocument();
    expect(
      screen.getByText('Đã khóa tài khoản và đăng xuất khỏi mọi thiết bị.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở khóa tài khoản' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gỡ vai trò Manager' })).toBeInTheDocument();
  });

  it('does not offer to lock an admin', async () => {
    renderAt(path, AdminAccountPage, {
      account: accountDetail({ roles: ['admin'], canLock: false }),
      notice: null,
    });
    expect(
      await screen.findByText('Vai trò Admin chỉ cấp hoặc gỡ bằng dòng lệnh của máy chủ.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Khóa tài khoản' })).not.toBeInTheDocument();
  });
});

describe('admin catalog page', () => {
  it('lists subjects with their tutor count, visibility and an edit form', async () => {
    renderAt('/admin/catalog', AdminCatalogPage, {
      tab: 'subjects',
      items: [
        {
          id: 1,
          code: 'math',
          nameVi: 'Toán',
          nameEn: 'Mathematics',
          sortOrder: 10,
          isActive: true,
          tutorCount: 412,
        },
        {
          id: 9,
          code: 'nang_khieu',
          nameVi: 'Năng khiếu',
          nameEn: 'Talent classes',
          sortOrder: 90,
          isActive: false,
          tutorCount: 0,
        },
      ],
      editing: '9',
      saved: false,
    });
    expect(await screen.findByText('412')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tắt Toán' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bật Năng khiếu' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sửa Năng khiếu' })).toBeInTheDocument();
    // Sửa không đổi được mã.
    expect(screen.queryByRole('textbox', { name: 'Mã' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Môn học' })).toHaveAttribute('aria-current', 'page');
  });
});
