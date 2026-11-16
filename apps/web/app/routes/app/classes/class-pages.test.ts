// @vitest-environment node
// G6 đợt 3: action của trang lớp học, trang buổi học và màn quyết định tranh chấp của Manager. Mỗi intent gửi đúng API
// với đúng body (ngày giờ theo giờ Việt Nam, điểm danh từng học sinh); lỗi nghiệp vụ thành lỗi hiển thị, lưu xong
// thì chuyển hướng; trang buổi học của lớp khác trả 404.
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, payload, SESSION, signIn, thrownStatus } from '../../../../test/api-fixtures';
import { API, server } from '../../../../test/msw-server';
import { routeArgs, settle } from '../../../../test/route-args';
import { action as disputeAction } from '../../admin/disputes/detail';
import { action as classAction } from './detail';
import { action as lessonAction, loader as lessonLoader } from './lesson';

const CLASS_ID = '0193a1b2-0000-7000-8000-0000000000c1';
const LESSON_ID = '0193a1b2-0000-7000-8000-0000000000c2';
const ENROLLMENT_ID = '0193a1b2-0000-7000-8000-0000000000c3';
const ATTENDANCE_ID = '0193a1b2-0000-7000-8000-0000000000c4';
const RATE_ID = '0193a1b2-0000-7000-8000-0000000000c5';
const DISPUTE_ID = '0193a1b2-0000-7000-8000-0000000000c6';
const OTHER_CLASS_ID = '0193a1b2-0000-7000-8000-0000000000c7';

/** Ghi lại body JSON và phương thức của request cuối cùng tới một endpoint. */
function capture() {
  const seen: { body?: unknown; method?: string; calls: number } = { calls: 0 };
  const record = async (request: Request) => {
    seen.calls += 1;
    seen.method = request.method;
    const text = await request.text();
    seen.body = text ? (JSON.parse(text) as unknown) : undefined;
  };
  return { seen, record };
}

const lessonDetail = (overrides: Record<string, unknown> = {}) => ({
  id: LESSON_ID,
  classId: CLASS_ID,
  className: null,
  subjectId: 1,
  learnerNames: ['Bin'],
  tutorName: 'Thầy Bảo',
  myRole: 'tutor',
  status: 'scheduled',
  startsAt: '2026-11-20T12:00:00.000Z',
  endsAt: '2026-11-20T13:30:00.000Z',
  teachingMode: 'online',
  locationNote: null,
  onlineUrl: null,
  scheduleId: null,
  makeupForLessonId: null,
  rescheduled: false,
  cancelledBy: null,
  cancelKind: null,
  cancelReason: null,
  isLateCancellation: false,
  awaitingMe: false,
  attendanceStates: [],
  contentTaught: null,
  notes: null,
  actualMinutes: null,
  recordedAt: null,
  attendances: [],
  assessments: [],
  ...overrides,
});

const classPost = (form: Record<string, string>) =>
  routeArgs(`/app/classes/${CLASS_ID}`, {
    cookie: SESSION,
    form,
    params: { classId: CLASS_ID },
  }).args;

const lessonPost = (form: Record<string, string>) =>
  routeArgs(`/app/classes/${CLASS_ID}/lessons/${LESSON_ID}`, {
    cookie: SESSION,
    form,
    params: { classId: CLASS_ID, lessonId: LESSON_ID },
  }).args;

/** Form có nhiều giá trị cùng tên (các thứ trong tuần): dựng request bằng URLSearchParams. */
function classPostMany(entries: [string, string][]) {
  const { args } = routeArgs(`/app/classes/${CLASS_ID}`, {
    cookie: SESSION,
    params: { classId: CLASS_ID },
  });
  const request = new Request(`http://localhost:5173/app/classes/${CLASS_ID}`, {
    method: 'POST',
    headers: { Cookie: SESSION, Origin: 'http://localhost:5173' },
    body: new URLSearchParams(entries),
  });
  return { ...(args as object), request } as never;
}

const redirectTo = (result: unknown) => (result as Response).headers.get('Location');

describe('class page actions', () => {
  it('saves a weekly schedule with ISO dates and redirects back to the class', async () => {
    signIn(['tutor']);
    const { seen, record } = capture();
    server.use(
      http.post(`${API}/api/v1/classes/${CLASS_ID}/schedules`, async ({ request }) => {
        await record(request);
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const result = await classAction(
      classPostMany([
        ['intent', 'schedule-save'],
        ['weekday', '1'],
        ['weekday', '3'],
        ['startTime', '18:00'],
        ['durationMinutes', '90'],
        ['startDate', '01/12/2026'],
        ['untilDate', ''],
        ['teachingMode', 'online'],
        ['locationNote', ''],
        ['onlineUrl', 'https://meet.example.com/abc'],
      ]),
    );
    expect(redirectTo(result)).toBe(`/app/classes/${CLASS_ID}`);
    expect(seen.body).toEqual({
      weekdays: [1, 3],
      startTime: '18:00',
      durationMinutes: 90,
      startDate: '2026-12-01',
      untilDate: null,
      teachingMode: 'online',
      locationNote: '',
      onlineUrl: 'https://meet.example.com/abc',
    });
  });

  it('keeps the chosen weekdays and shows field errors when the API rejects the schedule', async () => {
    signIn(['tutor']);
    server.use(
      http.post(`${API}/api/v1/classes/${CLASS_ID}/schedules`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'bad',
          requestId: 'r',
          details: [{ path: 'untilDate', code: 'period_end_before_start', message: 'x' }],
        }),
      ),
    );
    const result = payload(
      await classAction(
        classPostMany([
          ['intent', 'schedule-save'],
          ['weekday', '2'],
          ['weekday', '5'],
          ['startTime', '18:00'],
          ['durationMinutes', '90'],
          ['startDate', '01/12/2026'],
          ['untilDate', '01/11/2026'],
          ['teachingMode', 'online'],
        ]),
      ),
    );
    expect(result).toMatchObject({
      intent: 'schedule-save',
      ok: false,
      fieldErrors: { untilDate: { key: 'validation.period_end_before_start' } },
      values: { weekdays: '2,5', untilDate: '01/11/2026' },
    });
  });

  it('creates a lesson at the Vietnam local time and opens it', async () => {
    signIn(['tutor']);
    const { seen, record } = capture();
    server.use(
      http.post(`${API}/api/v1/classes/${CLASS_ID}/lessons`, async ({ request }) => {
        await record(request);
        return HttpResponse.json(lessonDetail(), { status: 201 });
      }),
    );
    const result = await classAction(
      classPost({
        intent: 'lesson-new',
        date: '20/11/2026',
        time: '19:00',
        durationMinutes: '90',
        teachingMode: 'online',
        locationNote: '',
        onlineUrl: '',
        makeupForLessonId: '',
      }),
    );
    expect(redirectTo(result)).toBe(`/app/classes/${CLASS_ID}/lessons/${LESSON_ID}`);
    expect(seen.body).toMatchObject({
      startsAt: '2026-11-20T19:00:00+07:00',
      durationMinutes: 90,
      makeupForLessonId: null,
    });
  });

  it('maps the API time error of a new lesson to the date field', async () => {
    signIn(['tutor']);
    server.use(
      http.post(`${API}/api/v1/classes/${CLASS_ID}/lessons`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'bad',
          requestId: 'r',
          details: [{ path: 'startsAt', code: 'lesson_time_out_of_range', message: 'x' }],
        }),
      ),
    );
    const result = payload(
      await classAction(
        classPost({
          intent: 'lesson-new',
          date: '20/11/2020',
          time: '19:00',
          durationMinutes: '90',
          teachingMode: 'online',
        }),
      ),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { date: { key: 'validation.lesson_time_out_of_range' } },
    });
  });

  it('sends the parent decision on a fee proposal to the right rate', async () => {
    signIn(['parent']);
    const { seen, record } = capture();
    server.use(
      http.post(
        `${API}/api/v1/classes/${CLASS_ID}/enrollments/${ENROLLMENT_ID}/fee-rates/${RATE_ID}/accept`,
        async ({ request }) => {
          await record(request);
          return HttpResponse.json({});
        },
      ),
    );
    const result = await classAction(
      classPost({ intent: 'fee-accept', enrollmentId: ENROLLMENT_ID, rateId: RATE_ID }),
    );
    expect(seen.calls).toBe(1);
    expect(redirectTo(result)).toBe(`/app/classes/${CLASS_ID}?tab=fees`);
  });

  it('shows fee_change_pending as a form error', async () => {
    signIn(['tutor']);
    server.use(
      http.post(`${API}/api/v1/classes/${CLASS_ID}/enrollments/${ENROLLMENT_ID}/fee-rates`, () =>
        apiError(409, { code: 'fee_change_pending', message: 'pending', requestId: 'r' }),
      ),
    );
    const result = payload(
      await classAction(
        classPost({
          intent: 'fee-propose',
          enrollmentId: ENROLLMENT_ID,
          sessionPriceVnd: '300.000',
          sessionMinutes: '90',
          note: '',
        }),
      ),
    );
    expect(result).toMatchObject({ ok: false, formError: { key: 'errors.fee_change_pending' } });
  });

  it('sends a score as a number and an empty score as null', async () => {
    signIn(['tutor']);
    const { seen, record } = capture();
    server.use(
      http.post(
        `${API}/api/v1/classes/${CLASS_ID}/enrollments/${ENROLLMENT_ID}/assessments`,
        async ({ request }) => {
          await record(request);
          return HttpResponse.json({}, { status: 201 });
        },
      ),
    );
    await classAction(
      classPost({
        intent: 'assessment-save',
        enrollmentId: ENROLLMENT_ID,
        kind: 'test',
        title: 'Kiểm tra 15 phút',
        score: '8,5',
        maxScore: '10',
        comment: 'Tốt',
        assessedOn: '15/11/2026',
        lessonId: '',
      }),
    );
    expect(seen.body).toEqual({
      kind: 'test',
      title: 'Kiểm tra 15 phút',
      score: 8.5,
      maxScore: 10,
      comment: 'Tốt',
      assessedOn: '2026-11-15',
      lessonId: null,
    });
  });
});

describe('lesson page', () => {
  it('returns 404 when the lesson belongs to another class', async () => {
    signIn(['parent']);
    server.use(
      http.get(`${API}/api/v1/lessons/${LESSON_ID}`, () =>
        HttpResponse.json(lessonDetail({ classId: OTHER_CLASS_ID })),
      ),
    );
    const { args } = routeArgs(`/app/classes/${CLASS_ID}/lessons/${LESSON_ID}`, {
      cookie: SESSION,
      params: { classId: CLASS_ID, lessonId: LESSON_ID },
    });
    expect(thrownStatus(await settle(lessonLoader(args)))).toBe(404);
  });

  it('records attendance for each learner, or none when the tutor was absent', async () => {
    signIn(['tutor']);
    const { seen, record } = capture();
    server.use(
      http.put(`${API}/api/v1/lessons/${LESSON_ID}/attendance`, async ({ request }) => {
        await record(request);
        return HttpResponse.json(lessonDetail());
      }),
    );
    const held = await lessonAction(
      lessonPost({
        intent: 'attendance',
        outcome: 'held',
        enrollmentId: ENROLLMENT_ID,
        [`status:${ENROLLMENT_ID}`]: 'absent_notified',
        [`comment:${ENROLLMENT_ID}`]: 'Ốm',
        actualMinutes: '90',
        contentTaught: 'Phương trình',
        notes: '',
      }),
    );
    expect(redirectTo(held)).toBe(`/app/classes/${CLASS_ID}/lessons/${LESSON_ID}`);
    expect(seen.method).toBe('PUT');
    expect(seen.body).toEqual({
      outcome: 'held',
      contentTaught: 'Phương trình',
      notes: '',
      actualMinutes: 90,
      attendances: [{ enrollmentId: ENROLLMENT_ID, status: 'absent_notified', comment: 'Ốm' }],
    });

    await lessonAction(
      lessonPost({
        intent: 'attendance',
        outcome: 'tutor_absent',
        enrollmentId: ENROLLMENT_ID,
        [`status:${ENROLLMENT_ID}`]: 'present',
      }),
    );
    expect(seen.body).toMatchObject({ outcome: 'tutor_absent', attendances: [] });
  });

  it('opens a dispute with the claimed status, and shows state errors', async () => {
    signIn(['parent']);
    const { seen, record } = capture();
    server.use(
      http.post(
        `${API}/api/v1/lessons/${LESSON_ID}/attendances/${ATTENDANCE_ID}/dispute`,
        async ({ request }) => {
          await record(request);
          return apiError(409, {
            code: 'invalid_state_transition',
            message: 'ended',
            requestId: 'r',
          });
        },
      ),
    );
    const result = payload(
      await lessonAction(
        lessonPost({
          intent: 'dispute',
          attendanceId: ATTENDANCE_ID,
          reason: 'Con vắng có báo',
          claimedStatus: 'absent_notified',
        }),
      ),
    );
    expect(seen.body).toEqual({ reason: 'Con vắng có báo', claimedStatus: 'absent_notified' });
    expect(result).toMatchObject({
      intent: 'dispute',
      ok: false,
      formError: { key: 'errors.invalid_state_transition' },
    });
  });

  it('escalates a dispute through the attendance path', async () => {
    signIn(['tutor']);
    const { seen, record } = capture();
    server.use(
      http.post(
        `${API}/api/v1/lessons/${LESSON_ID}/attendances/${ATTENDANCE_ID}/dispute/escalate`,
        async ({ request }) => {
          await record(request);
          return HttpResponse.json(lessonDetail());
        },
      ),
    );
    await lessonAction(lessonPost({ intent: 'dispute-escalate', attendanceId: ATTENDANCE_ID }));
    expect(seen.calls).toBe(1);
  });
});

describe('manager dispute decision', () => {
  it('posts the decision and returns to the queue', async () => {
    signIn(['manager']);
    const { seen, record } = capture();
    server.use(
      http.post(
        `${API}/api/v1/admin/attendance-disputes/${DISPUTE_ID}/resolve`,
        async ({ request }) => {
          await record(request);
          return HttpResponse.json({});
        },
      ),
    );
    const { args } = routeArgs(`/admin/disputes/${DISPUTE_ID}`, {
      cookie: SESSION,
      form: {
        intent: 'resolve',
        lessonStatus: 'held',
        attendanceStatus: 'absent_notified',
        note: 'Phụ huynh đã báo vắng',
      },
      params: { disputeId: DISPUTE_ID },
    });
    const result = await disputeAction(args);
    expect(redirectTo(result)).toBe('/admin/disputes?done=1');
    expect(seen.body).toEqual({
      lessonStatus: 'held',
      attendanceStatus: 'absent_notified',
      note: 'Phụ huynh đã báo vắng',
    });
  });
});
