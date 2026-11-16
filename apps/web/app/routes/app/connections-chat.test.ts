// @vitest-environment node
// G5 đợt 3: action của trang yêu cầu kết nối, ứng tuyển ở Tìm học sinh, chat và trung tâm thông báo. Mỗi intent gửi
// đúng API với đúng body; lỗi nghiệp vụ thành lỗi hiển thị, lỗi hệ thống thì ném ra; mở thông báo chỉ chuyển
// hướng trong /app.
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, payload, SESSION, signIn, thrownStatus } from '../../../test/api-fixtures';
import { API, server } from '../../../test/msw-server';
import { routeArgs, settle } from '../../../test/route-args';
import { action as connectionAction } from './connections/detail';
import { action as findStudentsAction } from './find-students';
import { action as chatAction } from './messages/detail';
import { action as notificationsAction } from './notifications';

const REQUEST_ID = '0193a1b2-0000-7000-8000-0000000000e1';
const CONVERSATION_ID = '0193a1b2-0000-7000-8000-0000000000e2';
const MESSAGE_ID = '0193a1b2-0000-7000-8000-0000000000e3';
const POST_ID = '0193a1b2-0000-7000-8000-0000000000e4';
const TUTOR_ID = '0193a1b2-0000-7000-8000-0000000000e5';

/** Ghi lại body JSON của request cuối cùng tới một endpoint. */
function capture() {
  const seen: { body?: unknown; calls: number } = { calls: 0 };
  const record = async (request: Request) => {
    seen.calls += 1;
    const text = await request.text();
    seen.body = text ? (JSON.parse(text) as unknown) : undefined;
  };
  return { seen, record };
}

const connectionPost = (form: Record<string, string>) =>
  routeArgs(`/app/connections/${REQUEST_ID}`, {
    cookie: SESSION,
    form,
    params: { requestId: REQUEST_ID },
  }).args;

const chatPost = (form: Record<string, string>) =>
  routeArgs(`/app/messages/${CONVERSATION_ID}`, {
    cookie: SESSION,
    form,
    params: { conversationId: CONVERSATION_ID },
  }).args;

const message = {
  id: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  kind: 'text',
  senderRole: 'client',
  isMine: true,
  body: 'Chào thầy',
  attachments: [],
  createdAt: '2026-11-16T08:00:00.000Z',
  deletedAt: null,
};

describe('connection request actions', () => {
  it('confirms the version on the page and shows terms_outdated when it is not the latest', async () => {
    signIn(['parent']);
    const { seen, record } = capture();
    server.use(
      http.post(`${API}/api/v1/connection-requests/${REQUEST_ID}/confirm`, async ({ request }) => {
        await record(request);
        return apiError(409, { code: 'terms_outdated', message: 'outdated', requestId: 'r' });
      }),
    );
    const result = payload(
      await connectionAction(connectionPost({ intent: 'confirm', version: '2' })),
    );
    expect(seen.body).toEqual({ version: 2 });
    expect(result).toMatchObject({
      intent: 'confirm',
      ok: false,
      formError: { key: expect.stringContaining('terms_outdated') as unknown },
    });
  });

  it('keeps the terms the user typed and maps field errors', async () => {
    signIn(['tutor']);
    server.use(
      http.post(`${API}/api/v1/connection-requests/${REQUEST_ID}/terms`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'invalid',
          requestId: 'r',
          details: [{ path: 'sessionPriceVnd', code: 'validation.too_small', message: 'small' }],
        }),
      ),
    );
    const result = payload(
      await connectionAction(
        connectionPost({
          intent: 'terms',
          teachingMode: 'online',
          sessionPriceVnd: '1',
          sessionMinutes: '90',
          sessionsPerWeek: '2',
          schedule: '[]',
          note: 'Học tối thứ 3',
        }),
      ),
    );
    expect(result).toMatchObject({
      intent: 'terms',
      ok: false,
      values: { sessionPriceVnd: '1', note: 'Học tối thứ 3' },
      fieldErrors: { sessionPriceVnd: { key: expect.stringMatching(/^validation\./) as unknown } },
    });
    expect(result).not.toHaveProperty('formError');
  });

  it('throws server errors instead of showing them as a form message', async () => {
    signIn(['parent']);
    server.use(
      http.post(`${API}/api/v1/connection-requests/${REQUEST_ID}/accept`, () =>
        apiError(500, { code: 'internal_error', message: 'boom', requestId: 'r' }),
      ),
    );
    await expect(connectionAction(connectionPost({ intent: 'accept' }))).rejects.toBeDefined();
  });

  it('rejects unknown intents with 400', async () => {
    signIn(['parent']);
    expect(thrownStatus(await settle(connectionAction(connectionPost({ intent: 'nope' }))))).toBe(
      400,
    );
  });

  it('blocks and reports using the hidden JSON target', async () => {
    signIn(['parent']);
    const blocks = capture();
    const reports = capture();
    server.use(
      http.post(`${API}/api/v1/me/blocks`, async ({ request }) => {
        await blocks.record(request);
        return HttpResponse.json({ items: [] }, { status: 201 });
      }),
      http.post(`${API}/api/v1/reports`, async ({ request }) => {
        await reports.record(request);
        return HttpResponse.json({ status: 'received' }, { status: 202 });
      }),
    );
    const blocked = payload(
      await connectionAction(
        connectionPost({ intent: 'block', blockTarget: JSON.stringify({ tutorId: TUTOR_ID }) }),
      ),
    );
    expect(blocked).toEqual({ intent: 'block', ok: true });
    expect(blocks.seen.body).toEqual({ tutorId: TUTOR_ID });

    const reported = payload(
      await connectionAction(
        connectionPost({
          intent: 'report',
          reportTarget: JSON.stringify({ targetType: 'tutor', tutorId: TUTOR_ID }),
          reasonCode: 'spam',
          description: 'Quảng cáo',
        }),
      ),
    );
    expect(reported).toEqual({ intent: 'report', ok: true });
    expect(reports.seen.body).toEqual({
      targetType: 'tutor',
      tutorId: TUTOR_ID,
      reasonCode: 'spam',
      description: 'Quảng cáo',
    });
  });

  it('turns a broken hidden target into an empty body for the API to reject', async () => {
    signIn(['parent']);
    const blocks = capture();
    server.use(
      http.post(`${API}/api/v1/me/blocks`, async ({ request }) => {
        await blocks.record(request);
        return apiError(422, { code: 'validation_failed', message: 'invalid', requestId: 'r' });
      }),
    );
    const result = payload(
      await connectionAction(connectionPost({ intent: 'block', blockTarget: '{oops' })),
    );
    expect(blocks.seen.body).toEqual({});
    expect(result).toMatchObject({ intent: 'block', ok: false });
  });
});

describe('apply from Find students', () => {
  const applyPost = (form: Record<string, string>) =>
    routeArgs(`/app/find-students?post=${POST_ID}&page=2`, { cookie: SESSION, form }).args;

  it('shows the API error next to the message and keeps what was typed', async () => {
    signIn(['tutor']);
    const { seen, record } = capture();
    server.use(
      http.post(`${API}/api/v1/connection-requests`, async ({ request }) => {
        await record(request);
        return apiError(403, { code: 'tutor_not_verified', message: 'no', requestId: 'r' });
      }),
    );
    const result = payload(
      await findStudentsAction(
        applyPost({ intent: 'apply', requestPostId: POST_ID, message: 'Em xin dạy' }),
      ),
    );
    expect(seen.body).toEqual({
      direction: 'tutor_to_client',
      requestPostId: POST_ID,
      message: 'Em xin dạy',
    });
    expect(result).toMatchObject({
      message: 'Em xin dạy',
      error: { key: expect.stringContaining('tutor_not_verified') as unknown },
    });
  });

  it('only accepts the apply intent', async () => {
    signIn(['tutor']);
    expect(thrownStatus(await settle(findStudentsAction(applyPost({ intent: 'other' }))))).toBe(
      400,
    );
  });
});

describe('chat actions', () => {
  it('sends the text and the uploaded file ids', async () => {
    signIn(['parent']);
    const { seen, record } = capture();
    server.use(
      http.post(`${API}/api/v1/conversations/${CONVERSATION_ID}/messages`, async ({ request }) => {
        await record(request);
        return HttpResponse.json(message, { status: 201 });
      }),
    );
    const fileId = '0193a1b2-0000-7000-8000-0000000000f1';
    const result = payload(
      await chatAction(
        chatPost({ intent: 'send', body: 'Chào thầy', fileIds: JSON.stringify([fileId]) }),
      ),
    );
    expect(result).toEqual({ intent: 'send', ok: true });
    expect(seen.body).toEqual({ body: 'Chào thầy', fileIds: [fileId] });
  });

  it('shows conversation_closed when the request was cancelled', async () => {
    signIn(['tutor']);
    server.use(
      http.post(`${API}/api/v1/conversations/${CONVERSATION_ID}/messages`, () =>
        apiError(409, { code: 'conversation_closed', message: 'closed', requestId: 'r' }),
      ),
    );
    const result = payload(
      await chatAction(chatPost({ intent: 'send', body: 'Còn đó không?', fileIds: 'bad json' })),
    );
    expect(result).toMatchObject({
      intent: 'send',
      ok: false,
      formError: { key: expect.stringContaining('conversation_closed') as unknown },
    });
  });

  it('reports one message of the conversation', async () => {
    signIn(['parent']);
    const { seen, record } = capture();
    server.use(
      http.post(`${API}/api/v1/reports`, async ({ request }) => {
        await record(request);
        return HttpResponse.json({ status: 'received' }, { status: 202 });
      }),
    );
    const result = payload(
      await chatAction(
        chatPost({
          intent: 'report-message',
          messageId: MESSAGE_ID,
          reasonCode: 'harassment',
          description: '',
        }),
      ),
    );
    expect(result).toEqual({ intent: 'report-message', ok: true, messageId: MESSAGE_ID });
    expect(seen.body).toEqual({
      targetType: 'message',
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      reasonCode: 'harassment',
      description: '',
    });
  });

  it('deletes a message and returns which one failed', async () => {
    signIn(['parent']);
    server.use(
      http.delete(`${API}/api/v1/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}`, () =>
        apiError(404, { code: 'not_found', message: 'gone', requestId: 'r' }),
      ),
    );
    const result = payload(await chatAction(chatPost({ intent: 'delete', messageId: MESSAGE_ID })));
    expect(result).toMatchObject({ intent: 'delete', ok: false, messageId: MESSAGE_ID });
  });
});

describe('notification center actions', () => {
  const notificationPost = (form: Record<string, string>) =>
    routeArgs('/app/notifications', { cookie: SESSION, form }).args;
  const NOTIFICATION_ID = '0193a1b2-0000-7000-8000-0000000000f2';

  it('marks the notification read and opens its page inside /app', async () => {
    signIn(['tutor']);
    const { seen, record } = capture();
    server.use(
      http.post(`${API}/api/v1/notifications/${NOTIFICATION_ID}/read`, async ({ request }) => {
        await record(request);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const response = (await settle(
      notificationsAction(
        notificationPost({
          intent: 'open',
          notificationId: NOTIFICATION_ID,
          to: `/app/connections/${REQUEST_ID}`,
        }),
      ),
    )) as Response;
    expect(seen.calls).toBe(1);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`/app/connections/${REQUEST_ID}`);
  });

  it.each(['https://evil.example', '//evil.example/app/', '/admin/accounts'])(
    'never redirects outside /app (%s)',
    async (to) => {
      signIn(['parent']);
      server.use(
        http.post(
          `${API}/api/v1/notifications/${NOTIFICATION_ID}/read`,
          () => new HttpResponse(null, { status: 204 }),
        ),
      );
      const response = (await settle(
        notificationsAction(
          notificationPost({ intent: 'open', notificationId: NOTIFICATION_ID, to }),
        ),
      )) as Response;
      expect(response.headers.get('Location')).toBe('/app/notifications');
    },
  );

  it('still opens the page when marking it read fails', async () => {
    signIn(['parent']);
    server.use(
      http.post(`${API}/api/v1/notifications/${NOTIFICATION_ID}/read`, () =>
        apiError(404, { code: 'not_found', message: 'gone', requestId: 'r' }),
      ),
    );
    const response = (await settle(
      notificationsAction(
        notificationPost({ intent: 'open', notificationId: NOTIFICATION_ID, to: '/app/profile' }),
      ),
    )) as Response;
    expect(response.headers.get('Location')).toBe('/app/profile');
  });

  it('marks everything read', async () => {
    signIn(['parent']);
    const { seen, record } = capture();
    server.use(
      http.post(`${API}/api/v1/notifications/read-all`, async ({ request }) => {
        await record(request);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    expect(payload(await notificationsAction(notificationPost({ intent: 'read-all' })))).toEqual({
      ok: true,
    });
    expect(seen.calls).toBe(1);
  });
});
