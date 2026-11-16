// /app/fees: học phí theo tháng qua mọi lớp (G7; canvas Tuition cho phụ huynh, TuitionTutor cho gia sư). `?month=`
// (`YYYY-MM`, giờ Việt Nam; mặc định tháng này).
//   - Số liệu tháng: tổng các bảng, đã trả (bên kia đã xác nhận, D41), còn lại; gia sư thêm số buổi đang khiếu nại.
//   - Khoản thanh toán chờ người xem xác nhận (mọi tháng): xác nhận hoặc báo không đúng / chưa nhận được.
//   - Từng học sinh × lớp: bảng của tháng (hoặc tạm tính khi chưa lập), tình trạng, liên kết tới trang đối chiếu.
// Học sinh không xem học phí; người vừa dạy vừa là phụ huynh xem theo vai trò chính (gia sư).
import { type FeeEnrollmentRef, FeeOverview, type FeeOverviewRow } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { data, Link, redirect, useNavigation } from 'react-router';
import { MonthNav, PaymentDecision, PaymentSummary, Stat } from '~/components/fees/fee-parts';
import { PageContainer } from '~/components/layout/page';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { type CatalogOption } from '~/lib/catalog';
import { loadSubjects } from '~/lib/catalog.server';
import { classTitle, vnd } from '~/lib/classes';
import { runIntent, textOf } from '~/lib/classes.server';
import { monthFromUrl, shortMonth, statementBadge, statementBadgeText } from '~/lib/fees';
import { formatDate } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/index';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.fees.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const role = user.roles.includes('tutor') ? 'tutor' : 'client';
  const month = monthFromUrl(new URL(request.url), Date.now());
  const { locale } = await readPreferences(request);
  const [overview, subjects] = await Promise.all([
    getServerApi(context).call(`/api/v1/fees/overview?month=${month}&as=${role}`, {
      schema: FeeOverview,
    }),
    loadSubjects(context, locale),
  ]);
  return { overview, subjects, role } as const;
}

/** Trả lời một khoản đang chờ (xác nhận / báo không đúng), rồi tải lại đúng tháng đang xem. */
export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const form = await request.formData();
  const intent = textOf(form, 'intent');
  if (intent !== 'acknowledge' && intent !== 'decline') throw data(null, { status: 400 });
  const path = `/api/v1/fees/statements/${encodeURIComponent(textOf(form, 'statementId'))}/payments/${encodeURIComponent(textOf(form, 'paymentId'))}/${intent}`;
  const result = await runIntent(intent, form, [], () =>
    getServerApi(context).call(path, { method: 'POST', body: {} }),
  );
  const url = new URL(request.url);
  return result.ok ? redirect(`${url.pathname}${url.search}`) : data(result);
}

const rowTitle = (row: FeeEnrollmentRef, subjects: CatalogOption[]) =>
  classTitle(
    { name: row.className, subjectId: row.subjectId, learnerName: row.learner.name },
    subjects,
  );

export default function FeesPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const { overview, subjects, role } = loaderData;
  const { month, totals, rows } = overview;
  const money = (amount: number) => vnd(i18n.language, amount);
  const isTutor = role === 'tutor';
  const detailHref = (row: FeeOverviewRow) => `${PATHS.fees}/${row.enrollmentId}?month=${month}`;
  const failure = actionData && !actionData.ok ? actionData : undefined;

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{t('fees.title')}</h1>
          <p className="text-muted-foreground">
            {t(isTutor ? 'fees.leadTutor' : 'fees.leadClient')}
          </p>
        </div>
        <MonthNav month={month} hrefOf={(m) => `${PATHS.fees}?month=${m}`} />
      </div>

      {failure?.formError && <Alert variant="danger">{tr(failure.formError)}</Alert>}

      <div
        className={
          isTutor ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'grid gap-3 sm:grid-cols-3'
        }
      >
        <Stat
          label={t('fees.statTotal', { month: shortMonth(month) })}
          value={money(totals.totalVnd)}
        />
        <Stat
          label={t(isTutor ? 'fees.statReceived' : 'fees.statPaid')}
          value={money(totals.paidVnd)}
        />
        <Stat
          label={t(isTutor ? 'fees.statNotReceived' : 'fees.statOutstanding')}
          value={money(totals.outstandingVnd)}
          {...(!isTutor && totals.outstandingVnd > 0 && { tone: 'danger' as const })}
        />
        {isTutor && <Stat label={t('fees.statDisputed')} value={totals.disputedSessions} />}
      </div>

      {totals.provisionalVnd > 0 && (
        <p className="text-small text-muted-foreground">
          {t('fees.provisional', { amount: money(totals.provisionalVnd) })}
        </p>
      )}
      {overview.unpaidOtherMonths.count > 0 && (
        <Alert variant="warning">
          {t('fees.unpaidOther', {
            count: overview.unpaidOtherMonths.count,
            amount: money(overview.unpaidOtherMonths.balanceVnd),
          })}
        </Alert>
      )}

      {overview.awaitingMe.length > 0 && (
        <section aria-labelledby="fees-awaiting" className="flex flex-col gap-3">
          <h2 id="fees-awaiting" className="text-h3">
            {t('fees.awaitingTitle')}
          </h2>
          {overview.awaitingMe.map((item) => (
            <Card
              key={item.payment.id}
              className="flex-row flex-wrap items-center justify-between gap-4 border-primary ring-1 ring-primary"
            >
              <PaymentSummary
                payment={item.payment}
                className={rowTitle(item.enrollment, subjects)}
                month={item.month}
              />
              <PaymentDecision
                statementId={item.statementId}
                payment={item.payment}
                role={role}
                busy={busy}
              />
            </Card>
          ))}
        </section>
      )}

      {rows.length === 0 ? (
        <Card>
          <p className="text-muted-foreground">{t('fees.empty')}</p>
        </Card>
      ) : isTutor ? (
        <TutorTable rows={rows} subjects={subjects} detailHref={detailHref} />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => {
            const badge = statementBadge(row.statement);
            const amount = row.statement
              ? row.statement.balanceVnd || row.statement.totalAmountVnd
              : row.sessions.billableAmountVnd + row.sessions.pendingAmountVnd;
            return (
              <Card key={row.enrollmentId} className="gap-3 sm:p-6">
                <CardHeader>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h2 className="text-h3">{rowTitle(row, subjects)}</h2>
                    <span className="text-small text-muted-foreground">
                      {t('fees.withTutor', { name: row.tutor.displayName })}
                      {' · '}
                      {t('fees.billableCount', {
                        count: row.statement?.billableSessions ?? row.sessions.billable,
                      })}
                      {row.statement &&
                        ` · ${t('fees.dueOn', { date: formatDate(row.statement.dueDate, i18n.language) })}`}
                    </span>
                  </div>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-h3 tabular-nums">{money(amount)}</span>
                    <Badge variant={badge.variant}>{statementBadgeText(t, badge)}</Badge>
                  </span>
                </CardHeader>
                <Link
                  to={detailHref(row)}
                  className={buttonVariants({ variant: 'ghost', className: 'self-start' })}
                >
                  {t('fees.details')}
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      <Alert variant="info">{t(isTutor ? 'fees.infoTutor' : 'fees.infoClient')}</Alert>
    </PageContainer>
  );
}

function TutorTable({
  rows,
  subjects,
  detailHref,
}: {
  rows: FeeOverviewRow[];
  subjects: CatalogOption[];
  detailHref: (row: FeeOverviewRow) => string;
}) {
  const { t, i18n } = useTranslation();
  const money = (amount: number) => vnd(i18n.language, amount);
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] text-left text-small">
        <thead className="bg-surface-sunken text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">{t('fees.colClass')}</th>
            <th className="px-3 py-2 text-right font-semibold">{t('fees.colBillable')}</th>
            <th className="px-3 py-2 text-right font-semibold">{t('fees.colTotal')}</th>
            <th className="px-3 py-2 text-right font-semibold">{t('fees.colReceived')}</th>
            <th className="px-3 py-2 font-semibold">{t('fees.colStatus')}</th>
            <th className="px-3 py-2">
              <span className="sr-only">{t('fees.details')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const badge = statementBadge(row.statement);
            const total = row.statement
              ? row.statement.totalAmountVnd
              : row.sessions.billableAmountVnd + row.sessions.pendingAmountVnd;
            return (
              <tr key={row.enrollmentId}>
                <td className="px-3 py-2 font-semibold">{rowTitle(row, subjects)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.statement?.billableSessions ?? row.sessions.billable}
                  {row.sessions.disputed > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      {t('fees.disputedExtra', { count: row.sessions.disputed })}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(total)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {money(row.statement?.paidAmountVnd ?? 0)}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={badge.variant}>{statementBadgeText(t, badge)}</Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <Link to={detailHref(row)} className={buttonVariants({ variant: 'ghost' })}>
                    {t('fees.details')}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
