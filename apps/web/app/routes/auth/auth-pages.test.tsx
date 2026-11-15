// Giao diện các trang tài khoản: hiển thị lỗi đúng ô (aria-invalid, aria-describedby), lỗi chung trong
// Alert role="alert", thông điệp theo ngôn ngữ. Action được thay bằng bản giả trả kết quả cố định.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createI18n } from '~/lib/i18n';
import LoginPage from './login';
import RegisterPage from './register';

import VerifyEmailPage from './verify-email';

function renderRoute(
  path: string,
  Component: ComponentType<never>,
  loaderData: unknown,
  actionData: unknown,
) {
  const Stub = createRoutesStub([
    {
      path,
      Component: Component as ComponentType,
      loader: () => loaderData,
      action: () => actionData,
    },
  ]);
  return render(
    <I18nextProvider i18n={createI18n('vi')}>
      <Stub initialEntries={[path]} />
    </I18nextProvider>,
  );
}

describe('LoginPage', () => {
  it('shows the API error and keeps the email after a failed sign-in', async () => {
    renderRoute(
      '/login',
      LoginPage,
      { redirectTo: '' },
      {
        ok: false,
        fieldErrors: {},
        values: { email: 'mai@example.com' },
        formError: { key: 'errors.invalid_credentials' },
      },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email hoặc mật khẩu chưa đúng. Kiểm tra lại, hoặc đặt lại mật khẩu.',
    );
    expect(screen.getByLabelText('Email')).toHaveValue('mai@example.com');
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Quên mật khẩu?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('offers to enter the code when the email is not verified', async () => {
    renderRoute(
      '/login',
      LoginPage,
      { redirectTo: '' },
      {
        ok: false,
        fieldErrors: {},
        formError: { key: 'errors.email_not_verified' },
        needsVerification: true,
      },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('link', { name: 'Nhập mã xác thực' })).toHaveAttribute(
      'href',
      '/verify-email',
    );
  });
});

describe('RegisterPage', () => {
  it('ties each field error to its input', async () => {
    renderRoute(
      '/register',
      RegisterPage,
      { role: 'parent' },
      {
        ok: false,
        fieldErrors: {
          password: { key: 'validation.password_too_short' },
          acceptTerms: { key: 'validation.must_accept_terms' },
        },
        values: { role: 'tutor', fullName: 'Trần Văn Bình', email: 'binh@example.com', phone: '' },
      },
    );
    expect(await screen.findByRole('radio', { name: /Phụ huynh/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /Gia sư/ }));
    await userEvent.type(screen.getByLabelText('Họ tên'), 'Trần Văn Bình');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    // Đợi kết quả action hiện ra (ô mật khẩu có sẵn từ trước nên không dùng để chờ được).
    await screen.findByText('Mật khẩu cần ít nhất 8 ký tự.');
    const password = screen.getByLabelText('Mật khẩu');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAccessibleDescription(
      'Mật khẩu cần ít nhất 8 ký tự. Ít nhất 8 ký tự, có cả chữ và số.',
    );
    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription(
      'Bạn cần đồng ý với điều khoản để tạo tài khoản.',
    );
    // Giữ lại lựa chọn và dữ liệu đã nhập.
    expect(screen.getByRole('radio', { name: /Gia sư/ })).toBeChecked();
    expect(screen.getByLabelText('Họ tên')).toHaveValue('Trần Văn Bình');
  });
});

describe('VerifyEmailPage', () => {
  it('shows the email the code was sent to and how many tries are left', async () => {
    renderRoute(
      '/verify-email',
      VerifyEmailPage,
      { email: 'mai@example.com', resendAfterSeconds: 30 },
      {
        status: 'failed',
        email: 'mai@example.com',
        fieldErrors: { code: { key: 'verifyEmail.wrongCode', values: { count: 3 } } },
      },
    );
    expect(await screen.findByText('mai@example.com')).toBeInTheDocument();
    // Trong thời gian chờ, nút gửi lại bị khóa và đếm ngược.
    expect(screen.getByRole('button', { name: /Gửi lại mã · sau \d+ giây/ })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Mã xác thực'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText('Mã chưa đúng. Bạn còn 3 lần thử.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mã xác thực')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the success screen after the code is accepted', async () => {
    renderRoute(
      '/verify-email',
      VerifyEmailPage,
      { email: 'mai@example.com', resendAfterSeconds: 0 },
      { status: 'verified', homePath: '/app', isTutor: false },
    );
    await userEvent.type(await screen.findByLabelText('Mã xác thực'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(
      await screen.findByRole('heading', { name: 'Email đã được xác thực' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vào trang của tôi' })).toHaveAttribute('href', '/app');
  });
});
