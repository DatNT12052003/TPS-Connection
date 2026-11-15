// Giao diện hàng chờ và màn duyệt: hạn xử lý theo `now` của loader, nút lọc, nút Duyệt/Từ chối chỉ khi được
// duyệt, hồ sơ của chính mình và hồ sơ đã xử lý chỉ xem.
import { render, screen } from '@testing-library/react';
import { type ComponentType, StrictMode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createI18n } from '~/lib/i18n';
import VerificationReviewPage from './detail';
import VerificationQueuePage from './queue';

const NOW = '2026-11-14T03:00:00.000Z';

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

const item = (overrides: Record<string, unknown>) => ({
  id: '0193a1b2-0000-7000-8000-0000000000e1',
  kind: 'identity',
  tutorId: '0193a1b2-0000-7000-8000-000000000002',
  tutorName: 'Hoàng Văn E',
  occupation: 'teacher',
  credentialTitle: null,
  credentialKind: null,
  submittedAt: '2026-11-07T02:12:00.000Z',
  reviewDueAt: '2026-11-11T16:59:59.999Z',
  attempt: 1,
  ...overrides,
});

const detail = (overrides: Record<string, unknown> = {}) => ({
  id: '0193a1b2-0000-7000-8000-0000000000e1',
  kind: 'identity',
  status: 'pending',
  submittedAt: '2026-11-13T13:40:00.000Z',
  reviewDueAt: '2026-11-17T16:59:59.999Z',
  reviewedAt: null,
  rejectionCode: null,
  rejectionNote: null,
  attempt: 2,
  tutor: {
    id: '0193a1b2-0000-7000-8000-000000000002',
    fullName: 'Trần Thị B',
    displayName: 'Cô B',
    occupation: 'university_student',
    institution: 'ĐH Sư phạm Hà Nội',
  },
  credential: null,
  documents: [
    {
      id: '0193a1b2-0000-7000-8000-0000000000f1',
      type: 'national_id_front',
      mimeType: 'image/jpeg',
      sizeBytes: 1887437,
    },
    {
      id: '0193a1b2-0000-7000-8000-0000000000f2',
      type: 'student_card',
      mimeType: 'application/pdf',
      sizeBytes: 524288,
    },
  ],
  history: [
    {
      id: '0193a1b2-0000-7000-8000-0000000000e0',
      status: 'rejected',
      submittedAt: '2026-11-10T08:00:00.000Z',
      reviewedAt: '2026-11-11T08:00:00.000Z',
      rejectionCode: 'unclear_image',
      rejectionNote: null,
    },
  ],
  isOwnRequest: false,
  ...overrides,
});

describe('verification queue page', () => {
  it('shows each request with its deadline and the filter counts', async () => {
    renderAt('/admin/verifications', VerificationQueuePage, {
      queue: {
        items: [
          item({}),
          item({
            id: '0193a1b2-0000-7000-8000-0000000000e2',
            tutorName: 'Trần Thị B',
            occupation: 'university_student',
            reviewDueAt: '2026-11-14T09:00:00.000Z',
          }),
          item({
            id: '0193a1b2-0000-7000-8000-0000000000e3',
            kind: 'credential',
            tutorName: 'Lê Văn C',
            credentialTitle: 'IELTS 7.5',
            reviewDueAt: '2026-11-18T16:59:59.999Z',
            attempt: 2,
          }),
        ],
        counts: { all: 3, identity: 2, credential: 1 },
        page: 1,
        pageSize: 20,
        total: 3,
      },
      kind: null,
      now: NOW,
      done: 'approved',
    });
    expect(await screen.findByText('Hoàng Văn E')).toBeInTheDocument();
    expect(screen.getByText('Quá hạn')).toBeInTheDocument();
    expect(screen.getByText('Còn 6 giờ')).toBeInTheDocument();
    expect(screen.getByText('Hạn 18/11/2026')).toBeInTheDocument();
    expect(screen.getByText(/Danh tính \(sinh viên\)/)).toBeInTheDocument();
    expect(screen.getByText(/Bằng cấp: IELTS 7.5 · .* · Lần nộp 2/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tất cả · 3' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Bằng cấp · 1' })).toHaveAttribute(
      'href',
      '/admin/verifications?kind=credential',
    );
    expect(
      screen.getByText('Đã duyệt hồ sơ. Gia sư sẽ nhận email báo kết quả.'),
    ).toBeInTheDocument();
  });
});

describe('verification review page', () => {
  const path = '/admin/verifications/0193a1b2-0000-7000-8000-0000000000e1';

  it('shows what to compare, the documents, the history and both decisions', async () => {
    renderAt(path, VerificationReviewPage, { detail: detail(), now: NOW });
    expect(
      await screen.findByRole('heading', { name: 'Trần Thị B · Danh tính (sinh viên)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ĐH Sư phạm Hà Nội')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem CCCD mặt trước' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem Thẻ sinh viên' })).toBeInTheDocument();
    expect(screen.getByText('Thẻ sinh viên còn hạn')).toBeInTheDocument();
    expect(
      screen.getByText('Nộp ngày 10/11/2026: Bị từ chối · Ảnh mờ, bị lóa hoặc thiếu góc'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lý do từ chối' })).toBeInTheDocument();
  });

  it('only shows a request of the reviewer themself, with no actions', async () => {
    renderAt(path, VerificationReviewPage, { detail: detail({ isOwnRequest: true }), now: NOW });
    expect(
      await screen.findByText(/Đây là hồ sơ của chính bạn nên bạn không duyệt được/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Xem / })).not.toBeInTheDocument();
  });

  it('shows the outcome of a handled request and that its images are gone', async () => {
    renderAt(path, VerificationReviewPage, {
      detail: detail({
        status: 'rejected',
        reviewedAt: '2026-11-14T03:00:00.000Z',
        rejectionCode: 'name_mismatch',
        documents: [],
      }),
      now: NOW,
    });
    expect(
      await screen.findByText(
        /Hồ sơ đã được xử lý: Bị từ chối ngày 14\/11\/2026\. Lý do: Họ tên không khớp với giấy tờ/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Ảnh giấy tờ đã được xóa theo hạn lưu giữ.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument();
  });
});
