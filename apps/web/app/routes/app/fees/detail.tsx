// /app/fees/:enrollmentId: đối chiếu học phí một tháng của một học sinh trong một lớp (G7; canvas Tuition "Xem chi
// tiết", TuitionMobile; trang đích của thông báo học phí). `?month=` (`YYYY-MM`, giờ Việt Nam; mặc định tháng này).
//   - Bảng học phí của tháng (hoặc tạm tính khi chưa lập): tổng, đã trả, đang chờ xác nhận, còn lại, hạn trả.
//   - Mọi buổi trong tháng kèm điểm danh, xác nhận, trạng thái tính tiền và số tiền (giá lúc điểm danh, D17); buổi
//     tháng trước chốt muộn được tính vào bảng này cũng hiện.
//   - Thanh toán: ghi nhận đã trả / đã nhận (`?pay=1`), bên kia xác nhận hoặc báo không đúng, người ghi nhận hủy.
//   - Gia sư hủy bảng để lập lại (`?void=1`) khi chưa có khoản nào được xác nhận.
// Học sinh và người ngoài: 404.
import {
  type FeeMonthDetail as FeeMonthDetailType,
  FeeMonthDetail,
  ManualPaymentMethod,
} from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { FormFooter, FormShell, useFormState } from '~/components/classes/class-forms';
import { MonthNav, PaymentDecision, Stat } from '~/components/fees/fee-parts';
import { PageContainer } from '~/components/layout/page';
import { Breadcrumbs } from '~/components/marketplace/breadcrumbs';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { DateField } from '~/components/ui/date-field';
import { SelectField, TextAreaField, TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { loadSubjects } from '~/lib/catalog.server';
import { addDays, CONFIRMATION_BADGE, classTitle, lessonWhen, vnd, vnDate } from '~/lib/classes';
import {
  integerFrom,
  type IntentFailure,
  type IntentResult,
  runIntent,
  textOf,
} from '~/lib/classes.server';
import { displayToIso, isoToDisplay } from '~/lib/dates';
import {
  attendanceText,
  FEE_LINE_BADGE,
  monthFromUrl,
  shortMonth,
  statementBadge,
  statementBadgeText,
} from '~/lib/fees';
import { formatDate } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/detail';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.fees.detailTitle} – ${m.common.appName}` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const url = new URL(request.url);
  const now = Date.now();
  const month = monthFromUrl(url, now);
  const { locale } = await readPreferences(request);
  const [detail, subjects] = await Promise.all([
    getServerApi(context)
      .call(`/api/v1/fees/enrollments/${encodeURIComponent(params.enrollmentId)}?month=${month}`, {
        schema: FeeMonthDetail,
      })
      .catch((error: unknown) => {
        // Học sinh (403) cũng như người ngoài: không có trang này.
        if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
          throw data(null, { status: 404 });
        }
        throw error;
      }),
    loadSubjects(context, locale),
  ]);
  return {
    detail,
    subjects,
    today: vnDate(new Date(now)),
    open: {
      pay: url.searchParams.get('pay') === '1',
      void: url.searchParams.get('void') === '1',
    },
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const form = await request.formData();
  const api = getServerApi(context);
  const intent = textOf(form, 'intent');
  const statement = `/api/v1/fees/statements/${encodeURIComponent(textOf(form, 'statementId'))}`;
  const payment = `${statement}/payments/${encodeURIComponent(textOf(form, 'paymentId'))}`;
  const month = new URL(request.url).searchParams.get('month') ?? textOf(form, 'month');
  const back = () =>
    redirect(`${PATHS.fees}/${params.enrollmentId}${month ? `?month=${month}` : ''}`);
  const post = (path: string, body: unknown = {}) => api.call(path, { method: 'POST', body });
  let result: IntentResult;

  switch (intent) {
    case 'pay': {
      const paidOn = textOf(form, 'paidOn');
      result = await runIntent(intent, form, ['amountVnd', 'method', 'paidOn', 'reference'], () =>
        post(`${statement}/payments`, {
          amountVnd: integerFrom(textOf(form, 'amountVnd')),
          method: textOf(form, 'method'),
          paidOn: displayToIso(paidOn) ?? paidOn,
          reference: textOf(form, 'reference'),
        }),
      );
      break;
    }
    case 'acknowledge':
    case 'decline':
      result = await runIntent(intent, form, [], () => post(`${payment}/${intent}`));
      break;
    case 'payment-void':
      result = await runIntent(intent, form, [], () => post(`${payment}/void`));
      break;
    case 'statement-void':
      result = await runIntent(intent, form, ['reason'], () =>
        post(`${statement}/void`, { reason: textOf(form, 'reason') }),
      );
      break;
    default:
      throw data(null, { status: 400 });
  }
  return result.ok ? back() : data(result);
}

export default function FeeDetailPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const { detail, subjects, today, open } = loaderData;
  const { month, statement, sessions } = detail;
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const isTutor = detail.myRole === 'tutor';
  const money = (amount: number) => vnd(i18n.language, amount);
  const here = `${PATHS.fees}/${detail.enrollmentId}?month=${month}`;
  const title = classTitle(
    { name: detail.className, subjectId: detail.subjectId, learnerName: detail.learner.name },
    subjects,
  );
  const badge = statementBadge(statement);
  const canPay = statement !== null && statement.status !== 'void' && statement.status !== 'paid';
  const openForm = open.pay || open.void;
  const generalError =
    failure?.formError && failure.intent !== 'pay' && failure.intent !== 'statement-void'
      ? tr(failure.formError)
      : undefined;
  const billedTotal = detail.lines
    .filter((l) => l.state === 'billed' || l.state === 'billable')
    .reduce((sum, l) => sum + l.amountVnd, 0);

  return (
    <PageContainer>
      <Breadcrumbs
        items={[{ label: t('fees.title'), to: `${PATHS.fees}?month=${month}` }, { label: title }]}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h1">{title}</h1>
          <span className="text-muted-foreground">
            {isTutor
              ? detail.client.displayName
              : t('fees.withTutor', { name: detail.tutor.displayName })}
            {' · '}
            <Link to={`${PATHS.classes}/${detail.classId}?tab=fees`}>{t('fees.openClass')}</Link>
          </span>
        </div>
        <MonthNav month={month} hrefOf={(m) => `${PATHS.fees}/${detail.enrollmentId}?month=${m}`} />
      </div>

      {generalError && <Alert variant="danger">{generalError}</Alert>}

      <Card className="gap-4 sm:p-6">
        <CardHeader>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-h3">{t('fees.statementTitle', { month: shortMonth(month) })}</h2>
            {statement && (
              <span className="text-small text-muted-foreground">
                {t('fees.issuedOn', { date: formatDate(statement.issuedAt, i18n.language) })}
                {' · '}
                {t('fees.billableCount', { count: statement.billableSessions })}
              </span>
            )}
          </div>
          <Badge variant={badge.variant}>{statementBadgeText(t, badge)}</Badge>
        </CardHeader>
        {statement ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t('fees.total')} value={money(statement.totalAmountVnd)} />
            <Stat label={t('fees.paid')} value={money(statement.paidAmountVnd)} />
            <Stat label={t('fees.pending')} value={money(statement.pendingAmountVnd)} />
            <Stat
              label={`${t('fees.balance')} · ${t('fees.dueOn', { date: formatDate(statement.dueDate, i18n.language) })}`}
              value={money(statement.balanceVnd)}
              {...(statement.overdue && { tone: 'danger' as const })}
            />
          </div>
        ) : (
          <>
            <p className="text-small text-muted-foreground">{t('fees.noStatement')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat
                label={t('fees.billableCount', { count: sessions.billable })}
                value={money(sessions.billableAmountVnd)}
              />
              <Stat
                label={`${t('feeLineState.pending_confirmation')} (${sessions.pendingConfirmation})`}
                value={money(sessions.pendingAmountVnd)}
              />
            </div>
          </>
        )}
        {statement && !openForm && (
          <div className="flex flex-wrap gap-2">
            {canPay && (
              <Link to={`${here}&pay=1`} className={buttonVariants()}>
                {t(isTutor ? 'fees.payOpenTutor' : 'fees.payOpenClient')}
              </Link>
            )}
            {isTutor && statement.status === 'issued' && (
              <Link to={`${here}&void=1`} className={buttonVariants({ variant: 'secondary' })}>
                {t('fees.voidOpen')}
              </Link>
            )}
          </div>
        )}
        {statement && open.pay && canPay && (
          <PaymentForm
            statementId={statement.id}
            month={month}
            isTutor={isTutor}
            suggested={Math.max(statement.balanceVnd - statement.pendingAmountVnd, 0)}
            today={today}
            failure={failure}
            cancelTo={here}
            busy={busy}
          />
        )}
        {statement && open.void && isTutor && (
          <VoidForm
            statementId={statement.id}
            month={month}
            failure={failure}
            cancelTo={here}
            busy={busy}
          />
        )}
      </Card>

      <Payments detail={detail} busy={busy} />

      <Card className="gap-3 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3">{t('fees.sessionsTitle')}</h2>
          <p className="text-small text-muted-foreground">{t('fees.sessionsLead')}</p>
        </div>
        {detail.lines.length === 0 ? (
          <p className="text-muted-foreground">{t('fees.noSessions')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-left text-small">
              <thead className="bg-surface-sunken text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t('fees.colLesson')}</th>
                  <th className="px-3 py-2 font-semibold">{t('fees.colAttendance')}</th>
                  <th className="px-3 py-2 font-semibold">{t('fees.colConfirmation')}</th>
                  <th className="px-3 py-2 font-semibold">{t('fees.colFee')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('fees.colAmount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detail.lines.map((line) => (
                  <tr key={line.lessonId}>
                    <td className="px-3 py-2">
                      <Link to={`${PATHS.classes}/${detail.classId}/lessons/${line.lessonId}`}>
                        {lessonWhen(t, line)}
                      </Link>
                      {!line.inMonth && (
                        <span className="block text-muted-foreground">
                          {formatDate(line.startsAt, i18n.language)} · {t('fees.carriedOver')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{attendanceText(t, line)}</td>
                    <td className="px-3 py-2">
                      {line.confirmationStatus ? (
                        <Badge variant={CONFIRMATION_BADGE[line.confirmationStatus]}>
                          {t(`attendanceConfirmationStatus.${line.confirmationStatus}`)}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={FEE_LINE_BADGE[line.state]}>
                        {t(`feeLineState.${line.state}`)}
                      </Badge>
                      {line.billedIn && line.billedIn !== month && (
                        <span className="block text-muted-foreground">
                          {t('fees.billedIn', { month: shortMonth(line.billedIn) })}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span
                        className={
                          line.state === 'billed' || line.state === 'billable'
                            ? 'font-semibold'
                            : 'text-muted-foreground'
                        }
                      >
                        {money(line.amountVnd)}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-2 font-semibold" colSpan={4}>
                    {t('fees.totalRow')}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {money(statement ? statement.totalAmountVnd : billedTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detail.voidedStatements.length > 0 && (
        <Card className="gap-2">
          <h2 className="text-h3">{t('fees.voidedTitle')}</h2>
          <ul className="flex flex-col gap-1 text-small text-muted-foreground">
            {detail.voidedStatements.map((s) => (
              <li key={s.id}>
                {t('fees.voidedLine', {
                  date: s.voidedAt ? formatDate(s.voidedAt, i18n.language) : '',
                  amount: money(s.totalAmountVnd),
                  reason: s.voidReason ?? '',
                })}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Alert variant="info">{t(isTutor ? 'fees.infoTutor' : 'fees.infoClient')}</Alert>
    </PageContainer>
  );
}

function Payments({ detail, busy }: { detail: FeeMonthDetailType; busy: boolean }) {
  const { t, i18n } = useTranslation();
  const { statement } = detail;
  if (!statement) return null;
  const paymentBadge = {
    recorded: 'warning',
    acknowledged: 'success',
    declined: 'danger',
    voided: 'neutral',
  } as const;
  return (
    <Card className="gap-3 sm:p-6">
      <h2 className="text-h3">{t('fees.paymentsTitle')}</h2>
      {detail.payments.length === 0 ? (
        <p className="text-muted-foreground">{t('fees.noPayments')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {detail.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">
                  {t(p.recordedBy === 'tutor' ? 'fees.recordedByTutor' : 'fees.recordedByClient')}
                  {' · '}
                  {p.recordedByName}
                </span>
                <span className="text-small text-muted-foreground">
                  {t('fees.paymentLine', {
                    amount: vnd(i18n.language, p.amountVnd),
                    method: t(`paymentMethod.${p.method}`),
                    date: formatDate(p.paidOn, i18n.language),
                  })}
                  {p.reference && ` · ${p.reference}`}
                </span>
                {p.note && (
                  <span className="text-small">{t('fees.paymentNote', { note: p.note })}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={paymentBadge[p.status]}>{t(`paymentStatus.${p.status}`)}</Badge>
                {p.awaitingMe && (
                  <PaymentDecision
                    statementId={statement.id}
                    payment={p}
                    role={detail.myRole}
                    busy={busy}
                  />
                )}
                {p.mine && p.status === 'recorded' && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="payment-void" />
                    <input type="hidden" name="statementId" value={statement.id} />
                    <input type="hidden" name="paymentId" value={p.id} />
                    <Button type="submit" variant="ghost" disabled={busy}>
                      {t('fees.voidPayment')}
                    </Button>
                  </Form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PaymentForm({
  statementId,
  month,
  isTutor,
  suggested,
  today,
  failure,
  cancelTo,
  busy,
}: {
  statementId: string;
  month: string;
  isTutor: boolean;
  suggested: number;
  today: string;
  failure: IntentFailure | undefined;
  cancelTo: string;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const state = useFormState('pay', failure);
  return (
    <FormShell
      intent="pay"
      title={t(isTutor ? 'fees.payOpenTutor' : 'fees.payOpenClient')}
      lead={t(isTutor ? 'fees.payLeadTutor' : 'fees.payLeadClient')}
      formError={state.formError}
      hidden={{ statementId, month }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="amountVnd"
          label={t('fees.payAmount')}
          inputMode="numeric"
          defaultValue={state.value('amountVnd', suggested > 0 ? String(suggested) : '')}
          error={state.error('amountVnd')}
          required
        />
        <DateField
          name="paidOn"
          label={t('fees.payDate')}
          defaultValue={state.value('paidOn', isoToDisplay(today))}
          error={state.error('paidOn')}
          min={addDays(today, -730)}
          max={today}
          required
        />
      </div>
      <SelectField
        name="method"
        label={t('fees.payMethod')}
        defaultValue={state.value('method', 'bank_transfer')}
        error={state.error('method')}
      >
        {ManualPaymentMethod.options.map((m) => (
          <option key={m} value={m}>
            {t(`paymentMethod.${m}`)}
          </option>
        ))}
      </SelectField>
      <TextField
        name="reference"
        label={t('fees.payReference')}
        hint={t('fees.payReferenceHint')}
        maxLength={300}
        defaultValue={state.value('reference', '')}
        error={state.error('reference')}
      />
      <FormFooter
        cancelTo={cancelTo}
        submitLabel={t(isTutor ? 'fees.paySubmitTutor' : 'fees.paySubmitClient')}
        busy={busy}
      />
    </FormShell>
  );
}

function VoidForm({
  statementId,
  month,
  failure,
  cancelTo,
  busy,
}: {
  statementId: string;
  month: string;
  failure: IntentFailure | undefined;
  cancelTo: string;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const state = useFormState('statement-void', failure);
  return (
    <FormShell
      intent="statement-void"
      title={t('fees.voidTitle')}
      lead={t('fees.voidLead')}
      formError={state.formError}
      hidden={{ statementId, month }}
    >
      <TextAreaField
        name="reason"
        label={t('fees.voidReason')}
        rows={3}
        maxLength={500}
        defaultValue={state.value('reason', '')}
        error={state.error('reason')}
        required
      />
      <FormFooter cancelTo={cancelTo} submitLabel={t('fees.voidSubmit')} busy={busy} />
    </FormShell>
  );
}
