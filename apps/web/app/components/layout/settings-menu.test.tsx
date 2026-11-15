import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { SettingsMenu } from './settings-menu';

const details = () => {
  const element = document.querySelector('details');
  if (!element) throw new Error('settings menu not rendered');
  return element;
};

describe('SettingsMenu', () => {
  it('opens a labelled panel with language and appearance choices', async () => {
    renderWithProviders(
      <>
        <SettingsMenu />
        <p>Nội dung trang</p>
      </>,
    );
    const toggle = screen.getByLabelText('Ngôn ngữ và giao diện');
    expect(details().open).toBe(false);

    await userEvent.click(toggle);
    expect(details().open).toBe(true);
    expect(screen.getByRole('group', { name: 'Ngôn ngữ' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tiếng Việt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Trong bảng, nút chế độ màu có cả chữ (không chỉ biểu tượng).
    expect(screen.getByRole('button', { name: 'Theo thiết bị' })).toHaveTextContent(
      'Theo thiết bị',
    );
  });

  it('closes with Escape and when clicking outside', async () => {
    renderWithProviders(
      <>
        <SettingsMenu />
        <p>Nội dung trang</p>
      </>,
    );
    const toggle = screen.getByLabelText('Ngôn ngữ và giao diện');

    await userEvent.click(toggle);
    await userEvent.keyboard('{Escape}');
    expect(details().open).toBe(false);
    expect(toggle).toHaveFocus();

    await userEvent.click(toggle);
    await userEvent.click(screen.getByText('Nội dung trang'));
    expect(details().open).toBe(false);
  });
});
