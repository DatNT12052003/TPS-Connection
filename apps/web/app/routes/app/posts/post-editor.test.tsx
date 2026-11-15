// Giao diện form soạn bài tuyển: các ô danh sách gửi đúng tên trường của API bài đăng (`subjects`, `areaIds`,
// `slots`, khác tên của form hồ sơ gia sư), khu vực ẩn khi dạy trực tuyến, gia sư chưa xác minh không bấm Đăng được.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentType, StrictMode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createI18n } from '~/lib/i18n';
import NewTutorPostPage from './new';

function renderEditor(verified: boolean, action: (args: { request: Request }) => unknown) {
  const Stub = createRoutesStub([
    {
      path: '/app/posts/new',
      Component: NewTutorPostPage as ComponentType,
      loader: () => ({
        subjects: [{ id: 1, label: 'Toán' }],
        grades: [8, 9].map((n) => ({ id: n, label: `Lớp ${n}` })),
        provinces: [{ id: 1, label: 'Hà Nội' }],
        verified,
        post: null,
        areas: [],
        locale: 'vi',
      }),
      action,
    },
    {
      path: '/catalog/provinces/:provinceId/communes',
      loader: () => ({ items: [{ id: 10, label: 'Phường Ba Đình' }] }),
    },
  ]);
  return render(
    <StrictMode>
      <I18nextProvider i18n={createI18n('vi')}>
        <Stub initialEntries={['/app/posts/new']} />
      </I18nextProvider>
    </StrictMode>,
  );
}

describe('tutor post editor page', () => {
  it('sends subjects, areas and slots under the post field names', async () => {
    let sent: FormData | undefined;
    renderEditor(true, async ({ request }) => {
      sent = await request.formData();
      return null;
    });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Tiêu đề'), 'Toán 9 luyện thi');
    await user.selectOptions(screen.getByLabelText('Môn'), 'Toán');
    await user.click(screen.getByRole('button', { name: 'Thêm môn' }));
    const grades = screen.getByRole('group', { name: 'Khối dạy môn Toán' });
    await user.click(within(grades).getByRole('button', { name: 'Lớp 9' }));

    await user.click(screen.getByRole('radio', { name: 'Trực tiếp' }));
    await user.selectOptions(screen.getByLabelText('Tỉnh/thành phố'), 'Hà Nội');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    await user.click(screen.getByRole('button', { name: 'Thêm khung giờ Thứ Ba' }));

    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await screen.findByRole('button', { name: 'Lưu nháp' });
    const json = (name: string): unknown => {
      const value = sent?.get(name);
      return typeof value === 'string' ? JSON.parse(value) : undefined;
    };
    expect(sent?.get('intent')).toBe('save');
    expect(json('subjects')).toEqual([{ subjectId: 1, gradeLevelId: 9 }]);
    expect(json('areaIds')).toEqual([1]);
    expect(json('slots')).toEqual([{ weekday: 2, startTime: '18:00', endTime: '20:00' }]);
    expect(sent?.has('teachingSubjects')).toBe(false);
  });

  it('hides areas for online teaching and blocks publishing until verified', async () => {
    renderEditor(false, () => null);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'Trực tuyến' }));
    expect(screen.queryByLabelText('Tỉnh/thành phố')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng bài' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu nháp' })).toBeEnabled();
    expect(screen.getByText(/Chưa xác minh danh tính/)).toBeInTheDocument();
  });
});
