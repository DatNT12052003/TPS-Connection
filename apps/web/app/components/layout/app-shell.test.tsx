import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  it('shows the parent navigation from the approved canvas', () => {
    renderWithProviders(<AppShell role="parent">content</AppShell>, { path: '/app' });

    const [desktop, mobile] = screen.getAllByRole('navigation', { name: 'Điều hướng chính' });
    expect(
      within(desktop!)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Trang chủ', 'Tìm gia sư', 'Yêu cầu kết nối', 'Lớp học', 'Học phí']);
    expect(
      within(mobile!)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Trang chủ', 'Tìm gia sư', 'Kết nối', 'Lớp học', 'Tài khoản']);
  });

  it('marks the current page for assistive technology', () => {
    renderWithProviders(<AppShell role="tutor">content</AppShell>, { path: '/app' });
    const current = screen
      .getAllByRole('link', { name: 'Tổng quan' })
      .map((link) => link.getAttribute('aria-current'));
    expect(current).toEqual(['page', 'page']);
  });

  it('gives students no notifications link (view-only in v1)', () => {
    renderWithProviders(<AppShell role="student">content</AppShell>, { path: '/app' });
    expect(screen.queryByRole('link', { name: 'Thông báo' })).not.toBeInTheDocument();
  });

  it('provides a skip link to the main content', () => {
    renderWithProviders(<AppShell role="tutor">content</AppShell>, { path: '/app' });
    expect(screen.getByRole('link', { name: 'Bỏ qua, đến nội dung chính' })).toHaveAttribute(
      'href',
      '#main',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });
});
