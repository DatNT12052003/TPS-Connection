// Dữ liệu API mẫu và tiện ích cho test loader/action (msw): người đang đăng nhập, danh mục, hồ sơ gia sư,
// thông tin tài khoản, đọc kết quả `data(...)`.
import { http, HttpResponse } from 'msw';
import { API, server } from './msw-server';

export const SESSION = 'tps_at=access';
export const USER_ID = '0193a1b2-0000-7000-8000-000000000001';

export const authMe = (roles: string[]) => ({
  id: USER_ID,
  email: 'mai@example.com',
  displayName: 'Mai',
  fullName: 'Nguyễn Thị Mai',
  phone: null,
  locale: 'vi',
  status: 'active',
  emailVerified: true,
  roles,
});

export const accountProfile = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  email: 'mai@example.com',
  displayName: 'Mai',
  fullName: 'Nguyễn Thị Mai',
  fullNameLocked: false,
  phone: '0912345678',
  phoneVerified: false,
  locale: 'vi',
  avatarUrl: null,
  roles: ['parent'],
  ...overrides,
});

export const area = (id: number, name: string, unitType = 'ward') => ({
  id,
  code: String(id),
  unitType,
  name,
  fullName: unitType === 'ward' ? `Phường ${name}` : name,
  nameEn: null,
});

export const tutorProfile = (overrides: Record<string, unknown> = {}) => ({
  userId: USER_ID,
  headline: null,
  bio: null,
  occupation: 'teacher',
  institution: null,
  major: null,
  highestEducation: null,
  experienceYears: 6,
  teachingMethod: null,
  achievements: null,
  introVideoUrl: null,
  teachingMode: 'hybrid',
  rate: { amountVnd: 180000, unit: 'session' },
  acceptingStudents: true,
  hasVerifiedDegree: false,
  teachingSubjects: [{ subjectId: 1, gradeLevelId: 8 }],
  serviceAreaIds: [10],
  availability: [{ weekday: 1, startTime: '18:00', endTime: '20:00' }],
  profileStatus: 'incomplete',
  identityVerifiedAt: null,
  credentials: [],
  missingForVerification: [],
  updatedAt: '2026-11-14T08:00:00.000Z',
  ...overrides,
});

export const apiError = (status: number, error: object) => HttpResponse.json({ error }, { status });

/** Đăng nhập với các vai trò và danh mục mà các trang đọc (môn, khối, tỉnh, xã, tra khu vực). */
export function signIn(roles: string[]) {
  server.use(
    http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(authMe(roles))),
    http.get(`${API}/api/v1/catalog/subjects`, () =>
      HttpResponse.json({ items: [{ id: 1, code: 'math', nameVi: 'Toán', nameEn: 'Maths' }] }),
    ),
    http.get(`${API}/api/v1/catalog/grade-levels`, () =>
      HttpResponse.json({
        items: [
          { id: 8, code: 'grade_8', stage: 'lower_secondary', nameVi: 'Lớp 8', nameEn: 'Grade 8' },
        ],
      }),
    ),
    http.get(`${API}/api/v1/catalog/provinces`, () =>
      HttpResponse.json({ items: [area(1, 'Hà Nội', 'municipality')] }),
    ),
    http.get(`${API}/api/v1/catalog/provinces/:id/communes`, () =>
      HttpResponse.json({ items: [area(10, 'Ba Đình')] }),
    ),
    http.get(`${API}/api/v1/catalog/areas`, ({ request }) => {
      const ids = new URL(request.url).searchParams.get('ids')?.split(',').map(Number) ?? [];
      const known = [
        { ...area(1, 'Hà Nội', 'municipality'), level: 'province', parentId: null },
        { ...area(10, 'Ba Đình'), level: 'commune', parentId: 1 },
      ];
      return HttpResponse.json({ items: known.filter((a) => ids.includes(a.id)) });
    }),
  );
}

/** Dữ liệu của `data(...)` trả về từ loader/action. */
export const payload = (result: unknown) =>
  (result as { data: Record<string, unknown> }).data ?? (result as Record<string, unknown>);

/** Mã HTTP của `data(null, { status })` bị ném ra. */
export const thrownStatus = (thrown: unknown) =>
  (thrown as { init: { status: number } }).init.status;
