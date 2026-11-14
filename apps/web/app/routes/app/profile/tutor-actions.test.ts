// @vitest-environment node
// Loader/action của các trang gia sư (G2 đợt 3): sửa hồ sơ (PATCH /me cho họ tên, PUT hồ sơ cho phần còn
// lại), lỗi API thành lỗi theo ô, bằng cấp (thêm, sửa, xóa), công tắc "Đang nhận học sinh" ở trang chủ,
// và người không phải gia sư bị chặn.
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  accountProfile,
  apiError,
  credential,
  identityVerification,
  payload,
  SESSION,
  signIn,
  thrownStatus,
  tutorProfile,
} from '../../../../test/api-fixtures';
import { API, server } from '../../../../test/msw-server';
import { routeArgs, settle } from '../../../../test/route-args';
import { action as homeAction } from '../home';
import { action as editAction, loader as editLoader } from './edit';
import { action as profileAction, loader as profileLoader } from './index';

const CREDENTIAL_ID = '0193a1b2-0000-7000-8000-0000000000d1';

function mockTutor(profile = tutorProfile()) {
  signIn(['tutor']);
  server.use(
    http.get(`${API}/api/v1/me/tutor-profile`, () => HttpResponse.json(profile)),
    http.get(`${API}/api/v1/me/tutor-profile/verification`, () =>
      HttpResponse.json(identityVerification()),
    ),
    http.get(`${API}/api/v1/me`, () => HttpResponse.json(accountProfile({ roles: ['tutor'] }))),
  );
}

const editForm = {
  fullName: 'Nguyễn Văn A',
  headline: 'Giáo viên Toán',
  bio: '',
  institution: '',
  major: '',
  highestEducation: '',
  teachingMethod: '',
  achievements: '',
  introVideoUrl: '',
  occupation: 'teacher',
  experienceYears: '6',
  teachingMode: 'hybrid',
  rateAmount: '180.000',
  rateUnit: 'session',
  acceptingStudents: 'on',
  teachingSubjects: JSON.stringify([{ subjectId: 1, gradeLevelId: 8 }]),
  serviceAreaIds: JSON.stringify([10]),
  availability: JSON.stringify([{ weekday: 1, startTime: '18:00', endTime: '20:00' }]),
};

const editArgs = (form: Record<string, string>) =>
  routeArgs('/app/profile/edit', { cookie: SESSION, form }).args;

describe('edit tutor profile', () => {
  it('loads the profile with the names of its service areas', async () => {
    mockTutor();
    const result = payload(
      await editLoader(routeArgs('/app/profile/edit', { cookie: SESSION }).args),
    );
    expect(result.areas).toEqual([
      { id: 10, label: 'Phường Ba Đình', level: 'commune', provinceId: 1 },
    ]);
    expect(result.subjects).toEqual([{ id: 1, label: 'Toán' }]);
  });

  it('saves the full name, then replaces the profile, then opens the profile page', async () => {
    mockTutor();
    const calls: string[] = [];
    let profileBody: unknown;
    let accountBody: unknown;
    server.use(
      http.patch(`${API}/api/v1/me`, async ({ request }) => {
        calls.push('me');
        accountBody = await request.json();
        return HttpResponse.json(accountProfile());
      }),
      http.put(`${API}/api/v1/me/tutor-profile`, async ({ request }) => {
        calls.push('profile');
        profileBody = await request.json();
        return HttpResponse.json(tutorProfile());
      }),
    );
    const response = (await editAction(editArgs(editForm))) as Response;
    expect(response.headers.get('Location')).toBe('/app/profile?saved=1');
    expect(calls).toEqual(['me', 'profile']);
    expect(accountBody).toEqual({ fullName: 'Nguyễn Văn A' });
    expect(profileBody).toMatchObject({
      headline: 'Giáo viên Toán',
      occupation: 'teacher',
      experienceYears: 6,
      teachingMode: 'hybrid',
      rate: { amountVnd: 180000, unit: 'session' },
      acceptingStudents: true,
      teachingSubjects: [{ subjectId: 1, gradeLevelId: 8 }],
      serviceAreaIds: [10],
      availability: [{ weekday: 1, startTime: '18:00', endTime: '20:00' }],
    });
  });

  it('drops service areas when teaching online and sends no fee when the amount is empty', async () => {
    mockTutor();
    let profileBody: Record<string, unknown> = {};
    server.use(
      http.patch(`${API}/api/v1/me`, () => HttpResponse.json(accountProfile())),
      http.put(`${API}/api/v1/me/tutor-profile`, async ({ request }) => {
        profileBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(tutorProfile());
      }),
    );
    const { acceptingStudents: _unticked, ...form } = editForm;
    await editAction(editArgs({ ...form, teachingMode: 'online', rateAmount: '' }));
    expect(profileBody.serviceAreaIds).toEqual([]);
    expect(profileBody.rate).toBeNull();
    expect(profileBody.acceptingStudents).toBe(false);
  });

  it('puts nested API errors on the right fields and keeps the area names', async () => {
    mockTutor();
    server.use(
      http.patch(`${API}/api/v1/me`, () => HttpResponse.json(accountProfile())),
      http.put(`${API}/api/v1/me/tutor-profile`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'Invalid',
          details: [
            { path: 'rate.amountVnd', code: 'invalid_amount', message: 'x' },
            { path: 'availability.0.endTime', code: 'end_before_start', message: 'x' },
            { path: 'serviceAreaIds', code: 'service_areas_need_in_person', message: 'x' },
          ],
        }),
      ),
    );
    const result = payload(await editAction(editArgs(editForm)));
    expect(result.fieldErrors).toEqual({
      rateAmount: { key: 'validation.invalid_amount' },
      availability: { key: 'validation.end_before_start' },
      serviceAreaIds: { key: 'validation.service_areas_need_in_person' },
    });
    expect(result.values).toMatchObject({ rateAmount: '180.000' });
    expect(result.areas).toEqual([
      { id: 10, label: 'Phường Ba Đình', level: 'commune', provinceId: 1 },
    ]);
  });

  it('stops before the profile when the full name is rejected', async () => {
    mockTutor();
    let profileCalled = false;
    server.use(
      http.patch(`${API}/api/v1/me`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'Locked',
          details: [{ path: 'fullName', code: 'full_name_locked', message: 'x' }],
        }),
      ),
      http.put(`${API}/api/v1/me/tutor-profile`, () => {
        profileCalled = true;
        return HttpResponse.json(tutorProfile());
      }),
    );
    const result = payload(await editAction(editArgs(editForm)));
    expect(result.fieldErrors).toEqual({ fullName: { key: 'validation.full_name_locked' } });
    expect(profileCalled).toBe(false);
  });

  it('is not available to parents', async () => {
    signIn(['parent']);
    const thrown = await settle(
      editLoader(routeArgs('/app/profile/edit', { cookie: SESSION }).args),
    );
    expect(thrownStatus(thrown)).toBe(404);
  });
});

describe('profile and verification', () => {
  it('reads the saved flag and the credential being edited from the address', async () => {
    mockTutor();
    const result = payload(
      await profileLoader(
        routeArgs('/app/profile?saved=1&credential=new', { cookie: SESSION }).args,
      ),
    );
    expect(result).toMatchObject({ saved: true, editingCredential: 'new' });
    expect(result).toMatchObject({ verification: { canSubmit: true, latest: null } });
  });

  it('submits the uploaded ID documents with the consent and shows a notice', async () => {
    mockTutor();
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/me/tutor-profile/verification`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(identityVerification({ canSubmit: false }), { status: 201 });
      }),
    );
    const documents = [
      { type: 'national_id_front', fileId: '0193a1b2-0000-7000-8000-0000000000f1' },
      { type: 'national_id_back', fileId: '0193a1b2-0000-7000-8000-0000000000f2' },
    ];
    const { args } = routeArgs('/app/profile', {
      cookie: SESSION,
      form: {
        intent: 'identity-submit',
        documents: JSON.stringify(documents),
        acceptDocumentProcessing: 'true',
      },
    });
    const response = (await profileAction(args)) as Response;
    expect(response.headers.get('Location')).toBe('/app/profile?notice=submitted');
    expect(body).toEqual({ documents, acceptDocumentProcessing: true });
  });

  it('explains a refused submission with the code of the first field', async () => {
    mockTutor();
    server.use(
      http.post(`${API}/api/v1/me/tutor-profile/verification`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'Invalid',
          details: [{ path: 'documents', code: 'documents_incomplete', message: 'x' }],
        }),
      ),
    );
    const { args } = routeArgs('/app/profile', {
      cookie: SESSION,
      // Không đánh dấu đồng ý, JSON hỏng: vẫn gửi để API báo lỗi.
      form: { intent: 'identity-submit', documents: '{oops' },
    });
    expect(payload(await profileAction(args))).toEqual({
      intent: 'identity-submit',
      ok: false,
      formError: { key: 'validation.documents_incomplete' },
    });
  });

  it('cancels the pending identity request', async () => {
    mockTutor();
    let called = false;
    server.use(
      http.delete(`${API}/api/v1/me/tutor-profile/verification`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { args } = routeArgs('/app/profile', {
      cookie: SESSION,
      form: { intent: 'identity-cancel' },
    });
    const response = (await profileAction(args)) as Response;
    expect(called).toBe(true);
    expect(response.headers.get('Location')).toBe('/app/profile?notice=cancelled');
  });

  it('sends the files of a credential for verification', async () => {
    mockTutor();
    let body: unknown;
    server.use(
      http.post(
        `${API}/api/v1/me/tutor-profile/credentials/:id/verification`,
        async ({ request, params }) => {
          expect(params.id).toBe(CREDENTIAL_ID);
          body = await request.json();
          return HttpResponse.json(
            credential({ id: CREDENTIAL_ID, verificationStatus: 'pending' }),
            { status: 201 },
          );
        },
      ),
    );
    const fileIds = ['0193a1b2-0000-7000-8000-0000000000f3'];
    const { args } = routeArgs(`/app/profile?verify=${CREDENTIAL_ID}`, {
      cookie: SESSION,
      form: {
        intent: 'credential-verify',
        credentialId: CREDENTIAL_ID,
        fileIds: JSON.stringify(fileIds),
      },
    });
    const response = (await profileAction(args)) as Response;
    expect(response.headers.get('Location')).toBe('/app/profile#credentials');
    expect(body).toEqual({ fileIds });
  });

  it('adds a credential and closes the form', async () => {
    mockTutor();
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/me/tutor-profile/credentials`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(credential({ id: CREDENTIAL_ID }), { status: 201 });
      }),
    );
    const { args } = routeArgs('/app/profile?credential=new', {
      cookie: SESSION,
      form: {
        intent: 'credential-save',
        kind: 'certificate',
        title: 'IELTS 7.5',
        issuer: 'British Council',
        issuedYear: '2025',
      },
    });
    const response = (await profileAction(args)) as Response;
    expect(response.headers.get('Location')).toBe('/app/profile#credentials');
    expect(body).toEqual({
      kind: 'certificate',
      title: 'IELTS 7.5',
      issuer: 'British Council',
      issuedYear: 2025,
    });
  });

  it('edits a credential with PATCH and shows field errors', async () => {
    mockTutor();
    let method = '';
    server.use(
      http.patch(`${API}/api/v1/me/tutor-profile/credentials/:id`, ({ request }) => {
        method = request.method;
        return apiError(422, {
          code: 'validation_failed',
          message: 'Invalid',
          details: [{ path: 'issuedYear', code: 'invalid_year', message: 'x' }],
        });
      }),
    );
    const { args } = routeArgs(`/app/profile?credential=${CREDENTIAL_ID}`, {
      cookie: SESSION,
      form: {
        intent: 'credential-save',
        credentialId: CREDENTIAL_ID,
        kind: 'degree',
        title: 'Cử nhân',
        issuer: '',
        issuedYear: 'năm ngoái',
      },
    });
    const result = payload(await profileAction(args));
    expect(method).toBe('PATCH');
    expect(result).toMatchObject({
      intent: 'credential-save',
      fieldErrors: { issuedYear: { key: 'validation.invalid_year' } },
      values: { issuedYear: 'năm ngoái' },
    });
  });

  it('explains why a credential under review cannot be deleted', async () => {
    mockTutor();
    server.use(
      http.delete(`${API}/api/v1/me/tutor-profile/credentials/:id`, () =>
        apiError(409, { code: 'invalid_state_transition', message: 'Locked' }),
      ),
    );
    const { args } = routeArgs('/app/profile', {
      cookie: SESSION,
      form: { intent: 'credential-delete', credentialId: CREDENTIAL_ID },
    });
    expect(payload(await profileAction(args))).toEqual({
      intent: 'credential-delete',
      ok: false,
      fieldErrors: {},
      formError: { key: 'errors.invalid_state_transition' },
    });
  });
});

describe('tutor overview', () => {
  it('turns accepting students off, keeping the rest of the profile', async () => {
    const saved = tutorProfile();
    mockTutor(saved);
    let body: Record<string, unknown> = {};
    server.use(
      http.put(`${API}/api/v1/me/tutor-profile`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(tutorProfile({ acceptingStudents: false }));
      }),
    );
    const { args } = routeArgs('/app', {
      cookie: SESSION,
      form: { intent: 'accepting', accepting: 'false' },
    });
    expect(await homeAction(args)).toEqual({ ok: true });
    expect(body).toMatchObject({
      acceptingStudents: false,
      rate: saved.rate,
      teachingSubjects: saved.teachingSubjects,
      serviceAreaIds: saved.serviceAreaIds,
      availability: saved.availability,
    });
  });
});
