// /app/classes/:classId/lessons/:lessonId: một buổi học (G6, canvas Attendance, Dispute, MakeupLesson; trang đích của
// các thông báo buổi học). Theo vai trò và trạng thái:
//   - Gia sư: điểm danh sau giờ bắt đầu, sửa khi phụ huynh chưa xác nhận (D37) hoặc khi đang khiếu nại; dời, hủy buổi
//     chưa diễn ra; tạo buổi bù cho buổi đã hủy / gia sư vắng; ghi điểm cho buổi đã dạy.
//   - Phụ huynh: hủy buổi chưa diễn ra (dưới 2 giờ là hủy muộn, C5); xác nhận hoặc khiếu nại điểm danh trong 48 giờ;
//     đồng ý / rút khiếu nại.
//   - Một trong hai bên chuyển khiếu nại cho Manager sớm (D38). Học sinh chỉ xem, không thấy học phí.
// Intent: attendance | reschedule | cancel | confirm | dispute | dispute-settle | dispute-withdraw | dispute-escalate.
import { AttendanceStatus, ClassDetail, type LessonAttendance, LessonDetail } from '@tps/shared';
import { ExternalLink } from 'lucide-react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { LessonForm } from '~/components/classes/class-forms';
import { PageContainer } from '~/components/layout/page';
import { Breadcrumbs } from '~/components/marketplace/breadcrumbs';
import { KeyValue, KeyValueList } from '~/components/marketplace/key-value';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { ChoiceCard, SelectField, TextAreaField, TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { loadSubjects } from '~/lib/catalog.server';
import {
  classTitle,
  CONFIRMATION_BADGE,
  lessonBadge,
  lessonWhen,
  vnd,
  vnDate,
  vnInstant,
  vnTime,
} from '~/lib/classes';
import { integerFrom, type IntentResult, runIntent, textOf } from '~/lib/classes.server';
import { displayToIso } from '~/lib/dates';
import { formatDateTime } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/lesson';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.lessons.title} – ${m.common.appName}` }];
}

const lessonPath = (id: string) => `/api/v1/lessons/${encodeURIComponent(id)}`;
const HELD_STATUSES = ['present', 'absent_notified', 'absent_no_show'] as const;

export async function loader({ request, params, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent', 'student'] });
  const api = getServerApi(context);
  const notFound = (error: unknown) => {
    if (error instanceof ApiError && error.status === 404) throw data(null, { status: 404 });
    throw error;
  };
  const lesson = await api
    .call(lessonPath(params.lessonId), { schema: LessonDetail })
    .catch(notFound);
  if (lesson.classId !== params.classId) throw data(null, { status: 404 });
  const { locale } = await readPreferences(request);
  const [cls, subjects] = await Promise.all([
    api
      .call(`/api/v1/classes/${encodeURIComponent(lesson.classId)}`, { schema: ClassDetail })
      .catch(notFound),
    loadSubjects(context, locale),
  ]);
  const url = new URL(request.url);
  return { lesson, cls, subjects, edit: url.searchParams.get('edit'), now: Date.now() };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent', 'student'] });
  const form = await request.formData();
  const api = getServerApi(context);
  const intent = textOf(form, 'intent');
  const path = lessonPath(params.lessonId);
  const attendance = `${path}/attendances/${encodeURIComponent(textOf(form, 'attendanceId'))}`;
  const here = `${PATHS.classes}/${params.classId}/lessons/${params.lessonId}`;
  const send = (suffix: string, body?: unknown, method: 'POST' | 'PUT' | 'PATCH' = 'POST') =>
    api.call(suffix, { method, body });
  let result: IntentResult;

  switch (intent) {
    case 'attendance': {
      const outcome = textOf(form, 'outcome');
      const enrollmentIds = form.getAll('enrollmentId').map(String);
      result = await runIntent(
        intent,
        form,
        ['outcome', 'attendances', 'contentTaught', 'notes', 'actualMinutes'],
        () =>
          send(
            `${path}/attendance`,
            {
              outcome,
              contentTaught: textOf(form, 'contentTaught'),
              notes: textOf(form, 'notes'),
              actualMinutes: integerFrom(textOf(form, 'actualMinutes')),
              attendances:
                outcome === 'held'
                  ? enrollmentIds.map((id) => ({
                      enrollmentId: id,
                      status: textOf(form, `status:${id}`),
                      comment: textOf(form, `comment:${id}`),
                    }))
                  : [],
            },
            'PUT',
          ),
      );
      break;
    }
    case 'reschedule': {
      const date = displayToIso(textOf(form, 'date'));
      result = await runIntent(
        intent,
        form,
        ['date', 'time', 'durationMinutes', 'teachingMode'],
        () =>
          send(
            path,
            {
              startsAt: date ? vnInstant(date, textOf(form, 'time')) : textOf(form, 'date'),
              durationMinutes: integerFrom(textOf(form, 'durationMinutes')),
              teachingMode: textOf(form, 'teachingMode'),
              locationNote: textOf(form, 'locationNote'),
              onlineUrl: textOf(form, 'onlineUrl'),
            },
            'PATCH',
          ),
        { startsAt: 'date', locationNote: 'teachingMode', onlineUrl: 'teachingMode' },
      );
      break;
    }
    case 'cancel':
      result = await runIntent(intent, form, ['reason'], () =>
        send(`${path}/cancel`, { reason: textOf(form, 'reason') }),
      );
      break;
    case 'confirm':
      result = await runIntent(intent, form, [], () => send(`${attendance}/confirm`));
      break;
    case 'dispute':
      result = await runIntent(intent, form, ['reason', 'claimedStatus'], () =>
        send(`${attendance}/dispute`, {
          reason: textOf(form, 'reason'),
          claimedStatus: textOf(form, 'claimedStatus') || null,
        }),
      );
      break;
    case 'dispute-settle':
    case 'dispute-withdraw':
    case 'dispute-escalate':
      result = await runIntent(intent, form, [], () =>
        send(`${attendance}/dispute/${intent.slice('dispute-'.length)}`),
      );
      break;
    default:
      throw data(null, { status: 400 });
  }
  return result.ok ? redirect(here) : data(result);
}

export default function LessonPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const { lesson, cls, subjects, edit, now } = loaderData;
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const classHref = `${PATHS.classes}/${cls.id}`;
  const here = `${classHref}/lessons/${lesson.id}`;
  const title = classTitle({ ...cls, learnerName: cls.learner.name }, subjects);
  const isTutor = lesson.myRole === 'tutor';
  const isClient = lesson.myRole === 'client';
  const started = Date.parse(lesson.startsAt) <= now;
  const upcoming = lesson.status === 'scheduled' && !started;
  const recorded = lesson.status === 'held' || lesson.status === 'tutor_absent';
  const allPending =
    lesson.attendances.length > 0 &&
    lesson.attendances.every((a) => a.confirmationStatus === 'pending');
  const disputeOpen =
    lesson.attendances.length > 0 && lesson.attendances.every((a) => a.dispute?.status === 'open');
  const canRecord =
    isTutor &&
    ((lesson.status === 'scheduled' && started) || (recorded && (allPending || disputeOpen)));
  const showAttendanceForm = canRecord && (lesson.status === 'scheduled' || edit === 'attendance');
  const badge = lessonBadge(lesson);
  const confirmOn = (message: string) => (event: FormEvent) => {
    if (!window.confirm(message)) event.preventDefault();
  };
  const errorFor = (intent: string, field: string) => {
    if (failure?.intent !== intent) return undefined;
    const message = failure.fieldErrors[field];
    return message ? tr(message) : undefined;
  };
  const formError = failure?.formError ? tr(failure.formError) : undefined;
  const enrollments = cls.enrollments.filter(
    (e) =>
      lesson.attendances.some((a) => a.enrollmentId === e.id) ||
      (e.joinedOn <= vnDate(lesson.startsAt) && (!e.leftOn || e.leftOn >= vnDate(lesson.startsAt))),
  );

  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { label: t('classes.title'), to: PATHS.classes },
          { label: title, to: classHref },
          { label: lessonWhen(t, lesson) },
        ]}
      />

      <Card className="gap-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1">{lessonWhen(t, lesson)}</h1>
            <Badge variant={badge.variant}>{t(badge.key)}</Badge>
            {lesson.makeupForLessonId && <Badge variant="verified">{t('lessons.makeup')}</Badge>}
            {lesson.rescheduled && <Badge variant="neutral">{t('lessons.rescheduled')}</Badge>}
          </div>
          <span className="text-muted-foreground">
            {[title, t(`lessonMode.${lesson.teachingMode}`), lesson.locationNote]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {lesson.onlineUrl && lesson.status === 'scheduled' && (
            <a
              href={lesson.onlineUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 font-semibold"
            >
              {t('lessons.joinOnline')}
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          )}
        </div>
        {lesson.status === 'cancelled' && (
          <Alert variant="warning">
            {lesson.cancelKind === 'party'
              ? t('lessons.cancelledBy', {
                  who: t(`lessons.party_${lesson.cancelledBy ?? 'system'}`),
                })
              : t(`lessonCancelKind.${lesson.cancelKind ?? 'party'}`)}
            {lesson.cancelReason && ` · ${lesson.cancelReason}`}
            {lesson.isLateCancellation && ` · ${t('lessons.lateCancellation')}`}
          </Alert>
        )}
        {formError && <Alert variant="danger">{formError}</Alert>}
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {showAttendanceForm && (
            <Card className="sm:p-6">
              <Form method="post" className="flex flex-col gap-6" replace>
                <input type="hidden" name="intent" value="attendance" />
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-2 text-h3">{t('lessons.happened')}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ChoiceCard
                      name="outcome"
                      value="held"
                      defaultChecked={lesson.status !== 'tutor_absent'}
                      title={t('lessons.outcomeHeld')}
                      description={t('lessons.outcomeHeldHint')}
                    />
                    <ChoiceCard
                      name="outcome"
                      value="tutor_absent"
                      defaultChecked={lesson.status === 'tutor_absent'}
                      title={t('lessons.outcomeAbsent')}
                      description={t('lessons.outcomeAbsentHint')}
                    />
                  </div>
                </fieldset>
                {enrollments.map((e) => {
                  const current = lesson.attendances.find((a) => a.enrollmentId === e.id);
                  return (
                    <fieldset key={e.id} className="flex flex-col gap-3">
                      <legend className="mb-2 text-h3">{e.learner.name}</legend>
                      <input type="hidden" name="enrollmentId" value={e.id} />
                      <div className="grid gap-3 sm:grid-cols-3">
                        {HELD_STATUSES.map((s) => (
                          <ChoiceCard
                            key={s}
                            name={`status:${e.id}`}
                            value={s}
                            defaultChecked={(current?.status ?? 'present') === s}
                            title={t(`attendanceStatus.${s}`)}
                          />
                        ))}
                      </div>
                      <TextAreaField
                        name={`comment:${e.id}`}
                        label={t('lessons.comment')}
                        hint={t('lessons.commentHint')}
                        rows={2}
                        maxLength={2000}
                        defaultValue={current?.comment ?? ''}
                      />
                    </fieldset>
                  );
                })}
                {errorFor('attendance', 'attendances') && (
                  <p className="text-small text-danger" role="alert">
                    {errorFor('attendance', 'attendances')}
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    name="actualMinutes"
                    label={t('lessons.actualMinutes')}
                    inputMode="numeric"
                    defaultValue={String(
                      lesson.actualMinutes ??
                        Math.round(
                          (Date.parse(lesson.endsAt) - Date.parse(lesson.startsAt)) / 60_000,
                        ),
                    )}
                    error={errorFor('attendance', 'actualMinutes')}
                  />
                </div>
                <TextAreaField
                  name="contentTaught"
                  label={t('lessons.contentTaught')}
                  rows={3}
                  maxLength={4000}
                  defaultValue={lesson.contentTaught ?? ''}
                />
                <TextAreaField
                  name="notes"
                  label={t('lessons.notes')}
                  hint={t('lessons.notesHint')}
                  rows={3}
                  maxLength={4000}
                  defaultValue={lesson.notes ?? ''}
                />
                <Alert variant="info">{t('lessons.billingRule')}</Alert>
                <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                  {edit === 'attendance' && (
                    <Link to={here} className={buttonVariants({ variant: 'secondary' })} replace>
                      {t('common.cancel')}
                    </Link>
                  )}
                  <Button type="submit" disabled={busy}>
                    {t('lessons.saveAttendance')}
                  </Button>
                </div>
              </Form>
            </Card>
          )}

          {recorded && !showAttendanceForm && (
            <Card className="gap-4 sm:p-6">
              <CardHeader>
                <h2 className="text-h3">{t('lessons.recordTitle')}</h2>
                {canRecord && (
                  <Link
                    to={`${here}?edit=attendance`}
                    className={buttonVariants({ variant: 'secondary' })}
                  >
                    {t('lessons.editAttendance')}
                  </Link>
                )}
              </CardHeader>
              <KeyValueList>
                <KeyValue label={t('lessons.happened')}>
                  {t(`lessonStatus.${lesson.status}`)}
                </KeyValue>
                {lesson.actualMinutes !== null && (
                  <KeyValue label={t('lessons.actualMinutes')}>
                    {t('classes.minutes', { count: lesson.actualMinutes })}
                  </KeyValue>
                )}
                {lesson.contentTaught && (
                  <KeyValue label={t('lessons.contentTaught')}>{lesson.contentTaught}</KeyValue>
                )}
                {lesson.notes && <KeyValue label={t('lessons.notes')}>{lesson.notes}</KeyValue>}
              </KeyValueList>
              {lesson.attendances.map((a) => (
                <AttendanceBlock
                  key={a.id}
                  attendance={a}
                  isTutor={isTutor}
                  isClient={isClient}
                  now={now}
                  busy={busy}
                  errorFor={errorFor}
                  confirmOn={confirmOn}
                />
              ))}
            </Card>
          )}

          {isTutor && lesson.status === 'scheduled' && !started && (
            <Card className="gap-3 sm:p-6">
              {edit === 'time' ? (
                <LessonForm
                  intent="reschedule"
                  title={t('lessons.reschedule')}
                  lead={t('lessons.rescheduleLead')}
                  defaults={{
                    date: vnDate(lesson.startsAt),
                    time: vnTime(lesson.startsAt),
                    durationMinutes: Math.round(
                      (Date.parse(lesson.endsAt) - Date.parse(lesson.startsAt)) / 60_000,
                    ),
                    teachingMode: lesson.teachingMode,
                    locationNote: lesson.locationNote ?? '',
                    onlineUrl: lesson.onlineUrl ?? '',
                  }}
                  failure={failure}
                  cancelTo={here}
                  submitLabel={t('lessons.rescheduleSave')}
                  busy={busy}
                />
              ) : (
                <>
                  <h2 className="text-h3">{t('lessons.upcomingTitle')}</h2>
                  <p className="text-small text-muted-foreground">{t('lessons.upcomingTutor')}</p>
                  <Link
                    to={`${here}?edit=time`}
                    className={buttonVariants({ variant: 'secondary' })}
                  >
                    {t('lessons.reschedule')}
                  </Link>
                </>
              )}
            </Card>
          )}

          {lesson.assessments.length > 0 && (
            <Card className="gap-3 sm:p-6">
              <h2 className="text-h3">{t('classes.tab_results')}</h2>
              <ul className="flex flex-col divide-y divide-border">
                {lesson.assessments.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start gap-3 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-semibold">{s.title}</span>
                      <p className="whitespace-pre-line">{s.comment}</p>
                    </div>
                    {s.score !== null && (
                      <span className="text-h3">
                        {s.score}
                        <span className="text-small text-muted-foreground">/{s.maxScore}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          {upcoming && (isTutor || isClient) && (
            <Card className="gap-3">
              <h2 className="text-h3">{t('lessons.cancelTitle')}</h2>
              <p className="text-small text-muted-foreground">{t('lessons.cancelRule')}</p>
              <details open={failure?.intent === 'cancel'}>
                <summary className="cursor-pointer font-semibold text-primary">
                  {t('lessons.cancel')}
                </summary>
                <Form
                  method="post"
                  className="mt-3 flex flex-col gap-3"
                  onSubmit={confirmOn(t('lessons.cancelPrompt'))}
                >
                  <input type="hidden" name="intent" value="cancel" />
                  <TextAreaField
                    name="reason"
                    label={t('lessons.cancelReason')}
                    rows={3}
                    maxLength={500}
                    required
                    error={errorFor('cancel', 'reason')}
                  />
                  <Button type="submit" variant="danger" disabled={busy}>
                    {t('lessons.cancelConfirm')}
                  </Button>
                </Form>
              </details>
            </Card>
          )}
          {isTutor && lesson.status === 'held' && cls.status !== 'ended' && (
            <Card className="gap-3">
              <h2 className="text-h3">{t('classes.tab_results')}</h2>
              <Link
                to={`${classHref}?tab=results&assessment=new&for=${lesson.id}`}
                className={buttonVariants({ variant: 'secondary' })}
              >
                {t('lessons.addAssessment')}
              </Link>
            </Card>
          )}
          {isTutor &&
            (lesson.status === 'cancelled' || lesson.status === 'tutor_absent') &&
            cls.status === 'active' && (
              <Card className="gap-3">
                <h2 className="text-h3">{t('lessons.makeupTitle')}</h2>
                <p className="text-small text-muted-foreground">{t('lessons.makeupLead')}</p>
                <Link
                  to={`${classHref}?lesson=new&for=${lesson.id}`}
                  className={buttonVariants({ variant: 'secondary' })}
                >
                  {t('lessons.createMakeup')}
                </Link>
              </Card>
            )}
          <Alert variant="info" title={t('lessons.confirmRuleTitle')}>
            {t('lessons.confirmRule')}
          </Alert>
          <Link to={classHref} className={buttonVariants({ variant: 'ghost' })}>
            {t('lessons.backToClass')}
          </Link>
        </aside>
      </div>
    </PageContainer>
  );
}

function AttendanceBlock({
  attendance: a,
  isTutor,
  isClient,
  now,
  busy,
  errorFor,
  confirmOn,
}: {
  attendance: LessonAttendance;
  isTutor: boolean;
  isClient: boolean;
  now: number;
  busy: boolean;
  errorFor: (intent: string, field: string) => string | undefined;
  confirmOn: (message: string) => (event: FormEvent) => void;
}) {
  const { t, i18n } = useTranslation();
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="attendanceId" value={a.id} />
    </>
  );
  const dueOpen = a.confirmationStatus === 'pending' && Date.parse(a.confirmDueAt) > now;
  const hoursLeft = Math.max(1, Math.ceil((Date.parse(a.confirmDueAt) - now) / 3_600_000));
  const dispute = a.dispute;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{a.learner.name}</span>
        <span>{t(`attendanceStatus.${a.status}`)}</span>
        <Badge variant={CONFIRMATION_BADGE[a.confirmationStatus]}>
          {t(`attendanceConfirmationStatus.${a.confirmationStatus}`)}
        </Badge>
        {dueOpen && (
          <span className="text-small text-muted-foreground">
            {t('lessons.hoursLeft', { count: hoursLeft })}
          </span>
        )}
      </div>
      {a.comment && <p className="whitespace-pre-line">{a.comment}</p>}
      {a.sessionPriceVnd !== null && (
        <span className="text-small text-muted-foreground">
          {a.isBillable
            ? t('lessons.billed', { price: vnd(i18n.language, a.billableAmountVnd ?? 0) })
            : t('lessons.notBilled')}
          {' · '}
          {t('lessons.snapshot', {
            price: vnd(i18n.language, a.sessionPriceVnd),
            minutes: a.sessionMinutes,
          })}
        </span>
      )}

      {isClient && dueOpen && (
        <div className="flex flex-col gap-3">
          <Form method="post" onSubmit={confirmOn(t('lessons.confirmPrompt'))}>
            {hidden('confirm')}
            <Button type="submit" disabled={busy}>
              {t('lessons.confirmAction')}
            </Button>
          </Form>
          <details open={Boolean(errorFor('dispute', 'reason'))}>
            <summary className="cursor-pointer font-semibold text-primary">
              {t('lessons.dispute')}
            </summary>
            <Form method="post" className="mt-3 flex flex-col gap-3">
              {hidden('dispute')}
              <SelectField name="claimedStatus" label={t('lessons.claimedStatus')} defaultValue="">
                <option value="">{t('lessons.claimedNone')}</option>
                {AttendanceStatus.options.map((s) => (
                  <option key={s} value={s}>
                    {t(`attendanceStatus.${s}`)}
                  </option>
                ))}
              </SelectField>
              <TextAreaField
                name="reason"
                label={t('lessons.disputeReason')}
                rows={3}
                maxLength={500}
                required
                error={errorFor('dispute', 'reason')}
              />
              <Alert variant="info">{t('lessons.disputeRule')}</Alert>
              <Button type="submit" variant="secondary" disabled={busy}>
                {t('lessons.disputeSend')}
              </Button>
            </Form>
          </details>
        </div>
      )}

      {dispute && (
        <div className="flex flex-col gap-2 rounded-md bg-surface-sunken p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t('lessons.disputeTitle')}</span>
            <Badge
              variant={
                dispute.status === 'open' || dispute.status === 'escalated' ? 'danger' : 'neutral'
              }
            >
              {t(`attendanceDisputeStatus.${dispute.status}`)}
            </Badge>
          </div>
          <p className="whitespace-pre-line text-small">
            {dispute.claimedStatus &&
              `${t('lessons.claimedStatus')}: ${t(`attendanceStatus.${dispute.claimedStatus}`)} · `}
            {dispute.reason}
          </p>
          {dispute.status === 'open' && (
            <span className="text-small text-muted-foreground">
              {t('lessons.negotiateUntil', {
                date: formatDateTime(dispute.negotiateUntil, i18n.language),
              })}
            </span>
          )}
          {dispute.resolutionNote && (
            <span className="text-small">
              {t('lessons.resolution', { note: dispute.resolutionNote })}
            </span>
          )}
          {dispute.status === 'open' && (
            <div className="flex flex-wrap gap-2">
              {isClient && (
                <Form method="post">
                  {hidden('dispute-settle')}
                  <Button type="submit" disabled={busy}>
                    {t('lessons.disputeSettle')}
                  </Button>
                </Form>
              )}
              {isClient && (
                <Form method="post" onSubmit={confirmOn(t('lessons.disputeWithdrawPrompt'))}>
                  {hidden('dispute-withdraw')}
                  <Button type="submit" variant="secondary" disabled={busy}>
                    {t('lessons.disputeWithdraw')}
                  </Button>
                </Form>
              )}
              {(isClient || isTutor) && (
                <Form method="post" onSubmit={confirmOn(t('lessons.disputeEscalatePrompt'))}>
                  {hidden('dispute-escalate')}
                  <Button type="submit" variant="ghost" disabled={busy}>
                    {t('lessons.disputeEscalate')}
                  </Button>
                </Form>
              )}
            </div>
          )}
          {isTutor && dispute.status === 'open' && (
            <span className="text-small text-muted-foreground">
              {t('lessons.disputeTutorHint')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
