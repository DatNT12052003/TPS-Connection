// Giao diện các trang phụ huynh và trang nhận lời mời: nội dung theo dữ liệu loader, lỗi đúng ô, ô chọn xã
// tải lại theo tỉnh, token lời mời đọc từ phần `#` của địa chỉ. Loader/action là bản giả trả kết quả cố định.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentType, StrictMode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { createI18n } from '~/lib/i18n';
import AccountPage from '../account';
import AppHomePage from '../home';
import StudentInvitationPage from '../../auth/student-invitation';
import NewChildPage from './new';

const LEARNER_ID = '0193a1b2-0000-7000-8000-0000000000aa';
const gradeLevels = [{ id: 8, label: 'Lớp 8' }];
const provinces = [{ id: 1, label: 'Hà Nội' }];

const learner = {
  id: LEARNER_ID,
  viewer: 'guardian',
  fullName: 'Nguyễn Đức Minh',
  nickname: 'Bé Minh',
  dateOfBirth: null,
  gradeLevelId: 8,
  schoolName: null,
  provinceId: 1,
  communeId: 10,
  addressLine: null,
  notes: null,
  relationship: 'mother',
  hasStudentAccount: false,
  pendingInvitation: null,
  createdAt: '2026-11-13T08:00:00.000Z',
  updatedAt: '2026-11-13T08:00:00.000Z',
};

function renderRoute(
  path: string,
  Component: ComponentType<never>,
  loaderData: unknown,
  action: (args: { request: Request }) => unknown = () => null,
) {
  const Stub = createRoutesStub([
    { path, Component: Component as ComponentType, loader: () => loaderData, action },
    // Route dữ liệu xã của tỉnh (ô chọn xã gọi bằng useFetcher).
    {
      path: '/catalog/provinces/:provinceId/communes',
      loader: () => ({ items: [{ id: 10, label: 'Phường Ba Đình' }] }),
    },
  ]);
  // StrictMode như bản dev (entry.client mặc định của React Router): effect chạy hai lần.
  return render(
    <StrictMode>
      <I18nextProvider i18n={createI18n('vi')}>
        <Stub initialEntries={[path]} />
      </I18nextProvider>
    </StrictMode>,
  );
}

describe('parent overview', () => {
  it('invites a parent without child profiles to create one', async () => {
    renderRoute('/app', AppHomePage, {
      view: 'parent',
      displayName: 'Mai',
      learners: [],
      gradeLevels,
      deleted: false,
    });
    expect(await screen.findByRole('heading', { name: 'Chào Mai' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo hồ sơ con' })).toHaveAttribute(
      'href',
      '/app/children/new',
    );
  });

  it('lists children with their grade and student account status', async () => {
    renderRoute('/app', AppHomePage, {
      view: 'parent',
      displayName: 'Mai',
      learners: [
        learner,
        {
          ...learner,
          id: '0193a1b2-0000-7000-8000-0000000000bb',
          nickname: 'Bé An',
          hasStudentAccount: true,
        },
      ],
      gradeLevels,
      deleted: false,
    });
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Bé Minh · Lớp 8')).toBeInTheDocument();
    expect(within(items[0]!).getByRole('link', { name: 'Mời con tạo tài khoản' })).toHaveAttribute(
      'href',
      `/app/children/${LEARNER_ID}/invite`,
    );
    expect(within(items[0]!).getByRole('link', { name: 'Xem hồ sơ của Bé Minh' })).toHaveAttribute(
      'href',
      `/app/children/${LEARNER_ID}`,
    );
    expect(within(items[1]!).getByText('Có tài khoản học sinh')).toBeInTheDocument();
  });
});

describe('new child profile', () => {
  it('marks the fields the API rejected', async () => {
    renderRoute('/app/children/new', NewChildPage, { gradeLevels, provinces }, () => ({
      ok: false,
      fieldErrors: {
        gradeLevelId: { key: 'validation.required' },
        acceptChildDataProcessing: { key: 'validation.must_accept_child_data' },
      },
      values: {
        nickname: 'Bé Minh',
        gradeLevelId: '',
        provinceId: '',
        communeId: '',
        fullName: 'Nguyễn Đức Minh',
        relationship: 'mother',
        dateOfBirth: '',
        schoolName: '',
        addressLine: '',
        notes: '',
      },
      communes: [],
    }));
    await userEvent.click(await screen.findByRole('button', { name: 'Lưu hồ sơ' }));

    // Chờ kết quả action hiện ra (ô Khối lớp có sẵn từ đầu, tìm nó không chờ được action).
    expect(
      await screen.findByText(
        'Bạn cần đồng ý cho TPS-Connection xử lý dữ liệu của con để tạo hồ sơ.',
      ),
    ).toBeInTheDocument();
    const grade = screen.getByLabelText('Khối lớp');
    expect(grade).toHaveAttribute('aria-invalid', 'true');
    expect(grade).toHaveAccessibleDescription('Hãy nhập thông tin này.');
    expect(screen.getByLabelText('Tên gọi')).toHaveValue('Bé Minh');
  });
});

describe('date field', () => {
  it('accepts a typed date and lets the parent pick another one on the calendar', async () => {
    renderRoute('/app/children/new', NewChildPage, { gradeLevels, provinces });
    const date = await screen.findByLabelText('Ngày sinh');
    await userEvent.type(date, '5/9/2014');

    await userEvent.click(screen.getByRole('button', { name: 'Chọn ngày trên lịch' }));
    const calendar = await screen.findByRole('dialog', { name: 'Lịch chọn ngày' });
    // Lịch mở đúng tháng của ngày đã gõ, ngày đó đang được chọn.
    expect(within(calendar).getByRole('gridcell', { selected: true })).toHaveTextContent('5');

    // Lịch hiện cả ngày tháng sau (mờ): số "12" đầu tiên là 12/09.
    await userEvent.click(within(calendar).getAllByText('12')[0]!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(date).toHaveValue('12/09/2014');
  });

  it('puts each day under its weekday (01/01/2016 is a Friday)', async () => {
    renderRoute('/app/children/new', NewChildPage, { gradeLevels, provinces });
    await userEvent.type(await screen.findByLabelText('Ngày sinh'), '01/01/2016');
    await userEvent.click(screen.getByRole('button', { name: 'Chọn ngày trên lịch' }));
    const calendar = await screen.findByRole('dialog', { name: 'Lịch chọn ngày' });

    // Tuần đầu (Thứ Hai trước): 28–31/12/2015 (mờ) rồi 1–3/01/2016.
    const firstWeek = within(calendar)
      .getAllByRole('row')
      .find((row) => within(row).queryAllByRole('gridcell').length > 0);
    const days = within(firstWeek!)
      .getAllByRole('gridcell')
      .map((cell) => cell.textContent);
    expect(days).toEqual(['28', '29', '30', '31', '1', '2', '3']);
  });
});

describe('location fields', () => {
  it('loads the communes of the chosen province', async () => {
    renderRoute('/app/account', AccountPage, {
      account: {
        id: '0193a1b2-0000-7000-8000-000000000001',
        email: 'mai@example.com',
        displayName: 'Mai',
        fullName: null,
        fullNameLocked: false,
        phone: null,
        phoneVerified: false,
        locale: 'vi',
        avatarUrl: null,
        roles: ['parent'],
      },
      sessions: [],
      area: {
        profile: { provinceId: null, communeId: null, addressLine: null, updatedAt: null },
        provinces,
        communes: [],
      },
    });
    const commune = await screen.findByLabelText('Xã/phường');
    expect(commune).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('Tỉnh/thành phố'), 'Hà Nội');

    expect(await screen.findByRole('option', { name: 'Phường Ba Đình' })).toBeInTheDocument();
    expect(screen.getByLabelText('Xã/phường')).toBeEnabled();
  });
});

describe('student invitation page', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('reads the token from the link, removes it from the address bar and shows the invitation', async () => {
    const token = 'A'.repeat(43);
    window.history.replaceState(null, '', `/student-invitation#token=${token}`);
    let sent: FormData | undefined;
    renderRoute(
      '/student-invitation',
      StudentInvitationPage,
      { signedInAs: null },
      async ({ request }: { request: Request }) => {
        sent = await request.formData();
        return {
          intent: 'lookup',
          token,
          preview: {
            email: 'minh@example.com',
            inviterName: 'Mai',
            learnerName: 'Bé Minh',
            expiresAt: '2026-11-20T08:00:00.000Z',
          },
        };
      },
    );

    expect(await screen.findByLabelText('Email')).toHaveValue('minh@example.com');
    expect(sent?.get('token')).toBe(token);
    expect(window.location.hash).toBe('');
    expect(screen.getByText(/Mai mời Bé Minh tạo tài khoản học sinh/)).toBeInTheDocument();
    expect(screen.getByText('Lời mời hết hạn ngày 20/11/2026.')).toBeInTheDocument();
  });
});
