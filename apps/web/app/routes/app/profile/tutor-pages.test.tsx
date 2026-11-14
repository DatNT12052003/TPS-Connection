// Giao diện các trang gia sư: các ô danh sách của form sửa hồ sơ gửi đúng JSON, khu vực ẩn khi dạy trực
// tuyến, trang hồ sơ hiện việc còn thiếu và bằng cấp, trang chủ hiện trạng thái và công tắc nhận học sinh.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentType, StrictMode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';
import { accountProfile, tutorProfile } from '../../../../test/api-fixtures';
import { createI18n } from '~/lib/i18n';
import AppHomePage from '../home';
import TutorProfileEditPage from './edit';
import TutorProfilePage from './index';

function renderRoute(
  path: string,
  Component: ComponentType<never>,
  loaderData: unknown,
  action: (args: { request: Request }) => unknown = () => null,
) {
  const Stub = createRoutesStub([
    { path, Component: Component as ComponentType, loader: () => loaderData, action },
    {
      path: '/catalog/provinces/:provinceId/communes',
      loader: () => ({ items: [{ id: 10, label: 'Phường Ba Đình' }] }),
    },
  ]);
  return render(
    <StrictMode>
      <I18nextProvider i18n={createI18n('vi')}>
        <Stub initialEntries={[path]} />
      </I18nextProvider>
    </StrictMode>,
  );
}

const editData = (
  profile = tutorProfile(),
  areas = [{ id: 10, label: 'Phường Ba Đình', level: 'commune', provinceId: 1 }],
) => ({
  profile,
  account: accountProfile({ roles: ['tutor'] }),
  subjects: [
    { id: 1, label: 'Toán' },
    { id: 2, label: 'Vật lý' },
  ],
  grades: [6, 7, 8, 9].map((n) => ({ id: n, label: `Lớp ${n}` })),
  provinces: [{ id: 1, label: 'Hà Nội' }],
  areas,
  locale: 'vi',
});

describe('edit tutor profile page', () => {
  it('sends subjects, grades, areas and time slots chosen on the page', async () => {
    let sent: FormData | undefined;
    renderRoute(
      '/app/profile/edit',
      TutorProfileEditPage,
      editData(tutorProfile({ teachingSubjects: [], availability: [], serviceAreaIds: [] }), []),
      async ({ request }) => {
        sent = await request.formData();
        return null;
      },
    );
    const user = userEvent.setup();

    // Thêm môn Vật lý, chọn Lớp 8 và Lớp 9.
    await user.selectOptions(await screen.findByLabelText('Môn'), 'Vật lý');
    await user.click(screen.getByRole('button', { name: 'Thêm môn' }));
    const grades = screen.getByRole('group', { name: 'Khối dạy môn Vật lý' });
    await user.click(within(grades).getByRole('button', { name: 'Lớp 8' }));
    await user.click(within(grades).getByRole('button', { name: 'Lớp 9' }));
    expect(within(grades).getByRole('button', { name: 'Lớp 9' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Thêm cả tỉnh Hà Nội vào khu vực dạy trực tiếp.
    await user.selectOptions(screen.getByLabelText('Tỉnh/thành phố'), 'Hà Nội');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(screen.getByText('Hà Nội (toàn tỉnh)')).toBeInTheDocument();

    // Thêm khung giờ thứ Ba (mặc định 18:00–20:00).
    await user.click(screen.getByRole('button', { name: 'Thêm khung giờ Thứ Ba' }));

    await user.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    await screen.findByRole('button', { name: 'Lưu hồ sơ' });
    expect(JSON.parse(sent?.get('teachingSubjects') as string)).toEqual([
      { subjectId: 2, gradeLevelId: 8 },
      { subjectId: 2, gradeLevelId: 9 },
    ]);
    expect(JSON.parse(sent?.get('serviceAreaIds') as string)).toEqual([1]);
    expect(JSON.parse(sent?.get('availability') as string)).toEqual([
      { weekday: 2, startTime: '18:00', endTime: '20:00' },
    ]);
  });

  it('hides the service areas when the tutor teaches online only', async () => {
    renderRoute('/app/profile/edit', TutorProfileEditPage, editData());
    expect(await screen.findByText(/Phường Ba Đình, Hà Nội/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Trực tuyến' }));
    expect(screen.queryByText(/Phường Ba Đình, Hà Nội/)).not.toBeInTheDocument();
    expect(screen.getByText('Dạy trực tuyến không cần khu vực.')).toBeInTheDocument();
  });

  it('marks the fields still needed for verification', async () => {
    renderRoute(
      '/app/profile/edit',
      TutorProfileEditPage,
      editData(tutorProfile({ missingForVerification: ['rate', 'fullName'] })),
    );
    expect(await screen.findAllByText('Cần để xác minh')).toHaveLength(2);
  });
});

describe('profile and verification page', () => {
  it('lists what is missing and the credentials', async () => {
    renderRoute('/app/profile', TutorProfilePage, {
      profile: tutorProfile({
        missingForVerification: ['teachingSubjects', 'rate'],
        credentials: [
          {
            id: '0193a1b2-0000-7000-8000-0000000000d1',
            kind: 'certificate',
            title: 'IELTS 7.5',
            issuer: 'British Council',
            issuedYear: 2025,
            verificationStatus: 'self_declared',
          },
          {
            id: '0193a1b2-0000-7000-8000-0000000000d2',
            kind: 'degree',
            title: 'Cử nhân Sư phạm Toán',
            issuer: null,
            issuedYear: null,
            verificationStatus: 'verified',
          },
        ],
      }),
      saved: false,
      editingCredential: null,
    });
    expect(await screen.findByText('Còn thiếu 2 mục')).toBeInTheDocument();
    expect(screen.getByText('Môn và khối dạy được')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hoàn thiện hồ sơ' })).toHaveAttribute(
      'href',
      '/app/profile/edit',
    );
    // Bằng tự khai sửa/xóa được; bằng đã xác minh thì khóa.
    expect(screen.getByRole('link', { name: 'Sửa IELTS 7.5' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Sửa Cử nhân Sư phạm Toán' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Đã xác minh')).toBeInTheDocument();
  });
});

describe('tutor overview', () => {
  it('shows the profile status and the accepting switch', async () => {
    renderRoute('/app', AppHomePage, {
      view: 'tutor',
      displayName: 'Thầy A',
      profile: tutorProfile({ missingForVerification: ['rate'] }),
    });
    expect(await screen.findByRole('heading', { name: 'Chào Thầy A' })).toBeInTheDocument();
    expect(screen.getByText('Hồ sơ chưa hiển thị công khai')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạm ngừng nhận học sinh' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hoàn thiện hồ sơ' })).toHaveAttribute(
      'href',
      '/app/profile/edit',
    );
  });
});
