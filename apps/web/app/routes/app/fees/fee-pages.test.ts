// @vitest-environment node
// G7: trang học phí. Ghi nhận thanh toán gửi số nguyên và ngày ISO; lỗi số tiền hiện đúng ô; xác nhận / hủy bảng gọi
// đúng API rồi về đúng tháng; trang đối chiếu của học sinh hoặc người ngoài là 404; tổng hợp tháng hỏi API theo vai
// trò chính và tháng trong URL.
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, payload, SESSION, signIn, thrownStatus } from '../../../../test/api-fixtures';
import { API, server } from '../../../../test/msw-server';
import { routeArgs, settle } from '../../../../test/route-args';
import { action as detailAction, loader as detailLoader } from './detail';
import { action as indexAction, loader as indexLoader } from './index';

const ENROLLMENT_ID = '0193a1b2-0000-7000-8000-0000000000f1';
const STATEMENT_ID = '0193a1b2-0000-7000-8000-0000000000f2';
const PAYMENT_ID = '0193a1b2-0000-7000-8000-0000000000f3';

const detailPost = (form: Record<string, string>, month = '2026-10') =>
  routeArgs(`/app/fees/${ENROLLMENT_ID}?month=${month}`, {
    cookie: SESSION,
    form,
    params: { enrollmentId: ENROLLMENT_ID },
  }).args;

const redirectTo = (result: unknown) => (result as Response).headers.get('Location');

const overview = (month: string) => ({
  month,
  rows: [],
  totals: { totalVnd: 0, paidVnd: 0, outstandingVnd: 0, provisionalVnd: 0, disputedSessions: 0 },
  unpaidOtherMonths: { count: 0, balanceVnd: 0 },
  awaitingMe: [],
});

describe('fee detail page', () => {
  it('records a payment with an integer amount and an ISO date', async () => {
    signIn(['parent']);
    let body: unknown;
    server.use(
      http.post(`${API}/api/v1/fees/statements/${STATEMENT_ID}/payments`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const result = await detailAction(
      detailPost({
        intent: 'pay',
        statementId: STATEMENT_ID,
        month: '2026-10',
        amountVnd: '1.440.000',
        paidOn: '11/11/2026',
        method: 'bank_transfer',
        reference: 'CK 123',
      }),
    );
    expect(body).toEqual({
      amountVnd: 1_440_000,
      method: 'bank_transfer',
      paidOn: '2026-11-11',
      reference: 'CK 123',
    });
    expect(redirectTo(result)).toBe(`/app/fees/${ENROLLMENT_ID}?month=2026-10`);
  });

  it('shows the amount error next to the field', async () => {
    signIn(['parent']);
    server.use(
      http.post(`${API}/api/v1/fees/statements/${STATEMENT_ID}/payments`, () =>
        apiError(422, {
          code: 'validation_failed',
          message: 'bad',
          requestId: 'r',
          details: [{ path: 'amountVnd', code: 'payment_exceeds_balance', message: 'x' }],
        }),
      ),
    );
    const result = payload(
      await detailAction(
        detailPost({
          intent: 'pay',
          statementId: STATEMENT_ID,
          amountVnd: '9.000.000',
          paidOn: '11/11/2026',
          method: 'cash',
          reference: '',
        }),
      ),
    );
    expect(result).toMatchObject({
      ok: false,
      intent: 'pay',
      fieldErrors: { amountVnd: { key: 'validation.payment_exceeds_balance' } },
      values: { amountVnd: '9.000.000' },
    });
  });

  it('acknowledges a payment and voids a statement through the right endpoints', async () => {
    signIn(['tutor']);
    const calls: string[] = [];
    server.use(
      http.post(`${API}/api/v1/fees/statements/:sid/payments/:pid/acknowledge`, ({ params }) => {
        calls.push(`ack:${String(params.pid)}`);
        return HttpResponse.json({});
      }),
      http.post(`${API}/api/v1/fees/statements/:sid/void`, async ({ request }) => {
        calls.push(`void:${JSON.stringify(await request.json())}`);
        return HttpResponse.json({});
      }),
    );
    await detailAction(
      detailPost({ intent: 'acknowledge', statementId: STATEMENT_ID, paymentId: PAYMENT_ID }),
    );
    const voided = await detailAction(
      detailPost({ intent: 'statement-void', statementId: STATEMENT_ID, reason: 'Lập lại' }),
    );
    expect(calls).toEqual([`ack:${PAYMENT_ID}`, 'void:{"reason":"Lập lại"}']);
    expect(redirectTo(voided)).toBe(`/app/fees/${ENROLLMENT_ID}?month=2026-10`);
  });

  it('is not found for a student', async () => {
    signIn(['parent']);
    server.use(
      http.get(`${API}/api/v1/fees/enrollments/${ENROLLMENT_ID}`, () =>
        apiError(403, { code: 'forbidden', message: 'no', requestId: 'r' }),
      ),
    );
    const { args } = routeArgs(`/app/fees/${ENROLLMENT_ID}?month=2026-10`, {
      cookie: SESSION,
      params: { enrollmentId: ENROLLMENT_ID },
    });
    expect(thrownStatus(await settle(detailLoader(args)))).toBe(404);
  });
});

describe('fee overview page', () => {
  it('asks for the month in the URL as the tutor', async () => {
    signIn(['tutor', 'parent']);
    let query = '';
    server.use(
      http.get(`${API}/api/v1/fees/overview`, ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json(overview('2026-09'));
      }),
    );
    const { args } = routeArgs('/app/fees?month=2026-09', { cookie: SESSION });
    const result = payload(await indexLoader(args));
    expect(query).toBe('?month=2026-09&as=tutor');
    expect(result).toMatchObject({ role: 'tutor', overview: { month: '2026-09' } });
  });

  it('declines a payment and reloads the same month', async () => {
    signIn(['tutor']);
    let declined = false;
    server.use(
      http.post(
        `${API}/api/v1/fees/statements/${STATEMENT_ID}/payments/${PAYMENT_ID}/decline`,
        () => {
          declined = true;
          return HttpResponse.json({});
        },
      ),
    );
    const { args } = routeArgs('/app/fees?month=2026-10', {
      cookie: SESSION,
      form: { intent: 'decline', statementId: STATEMENT_ID, paymentId: PAYMENT_ID },
    });
    const result = await indexAction(args);
    expect(declined).toBe(true);
    expect(redirectTo(result)).toBe('/app/fees?month=2026-10');
  });
});
