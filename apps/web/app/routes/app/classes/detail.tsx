// /app/classes/:classId: một lớp học (G6, canvas TutorClass cho gia sư, ClassDetail cho phụ huynh). Người xem có một
// vai trò trong lớp (gia sư, phụ huynh, học sinh); lớp khác: 404 từ API.
//   - Thẻ đầu: tên lớp, trạng thái, liên hệ bên kia (sau xác nhận hợp tác, D16), học phí đang áp dụng.
//   - Tab (`?tab=`): buổi học (31 ngày trước tới 31 ngày sau), điểm và nhận xét, mục tiêu, học phí (không cho học sinh).
//   - Cột bên: lịch lặp, trạng thái lớp (chỉ gia sư tạm nghỉ, học lại, kết thúc; D35), ghi chú của gia sư.
// Form mở bằng tham số URL (`?schedule=new|<id>`, `?lesson=new`, `?fee=new`, `?goal=new|<id>`,
// `?assessment=new|<id>`, `?end=1`, `?rename=1`); lưu xong chuyển về trang không có tham số form.
import { ClassDetail, type FeeRate, LessonDetail, LessonList } from '@tps/shared';
import { MessageSquare, Plus } from 'lucide-react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import {
  AssessmentForm,
  FeeProposalForm,
  GoalForm,
  LessonForm,
  ScheduleForm,
} from '~/components/classes/class-forms';
import { PageContainer } from '~/components/layout/page';
import { Breadcrumbs } from '~/components/marketplace/breadcrumbs';
import { KeyValue, KeyValueList } from '~/components/marketplace/key-value';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { TextAreaField, TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { labelOf } from '~/lib/catalog';
import { loadCatalogs } from '~/lib/catalog.server';
import {
  CLASS_STATUS_BADGE,
  classTitle,
  CONFIRMATION_BADGE,
  lessonBadge,
  lessonWhen,
  scheduleSummary,
  vnd,
  vnDate,
  vnInstant,
} from '~/lib/classes';
import {
  decimalFrom,
  integerFrom,
  type IntentResult,
  runIntent,
  textOf,
} from '~/lib/classes.server';
import { displayToIso } from '~/lib/dates';
import { formatDate } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import { cn } from '~/lib/utils';
import type { Route } from './+types/detail';

const TABS = ['lessons', 'results', 'goals', 'fees'] as const;
type Tab = (typeof TABS)[number];
const DAY_MS = 24 * 60 * 60 * 1000;
/** Khoảng buổi học hiện trên trang lớp; lịch đầy đủ ở /app/schedule. */
const LESSON_WINDOW_DAYS = 31;

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.classes.detailTitle} – ${m.common.appName}` }];
}

const classPath = (id: string) => `/api/v1/classes/${encodeURIComponent(id)}`;

export async function loader({ request, params, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent', 'student'] });
  const api = getServerApi(context);
  const notFound = (error: unknown) => {
    if (error instanceof ApiError && error.status === 404) throw data(null, { status: 404 });
    throw error;
  };
  const cls = await api.call(classPath(params.classId), { schema: ClassDetail }).catch(notFound);
  const now = Date.now();
  const query = new URLSearchParams({
    classId: cls.id,
    from: new Date(now - LESSON_WINDOW_DAYS * DAY_MS).toISOString(),
    to: new Date(now + LESSON_WINDOW_DAYS * DAY_MS).toISOString(),
  });
  const { locale } = await readPreferences(request);
  const [lessons, catalogs] = await Promise.all([
    api.call(`/api/v1/lessons?${query.toString()}`, { schema: LessonList }),
    loadCatalogs(context, locale),
  ]);
  const url = new URL(request.url);
  const tab = (TABS as readonly string[]).includes(url.searchParams.get('tab') ?? '')
    ? (url.searchParams.get('tab') as Tab)
    : 'lessons';
  return {
    cls,
    lessons: lessons.items,
    catalogs,
    tab: tab === 'fees' && cls.myRole === 'student' ? 'lessons' : tab,
    open: {
      schedule: url.searchParams.get('schedule'),
      lesson: url.searchParams.get('lesson'),
      fee: url.searchParams.get('fee'),
      goal: url.searchParams.get('goal'),
      assessment: url.searchParams.get('assessment'),
      forLesson: url.searchParams.get('for') ?? '',
      end: url.searchParams.get('end') === '1',
      rename: url.searchParams.get('rename') === '1',
    },
    now,
  };
}

/** Body gửi API cho các form có ngày, giờ; ngày gõ sai thì gửi nguyên chữ để API trả lỗi đúng ô. */
const isoOrText = (text: string) => (text.trim() ? (displayToIso(text) ?? text.trim()) : null);

export async function action({ request, params, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent', 'student'] });
  const form = await request.formData();
  const api = getServerApi(context);
  const intent = textOf(form, 'intent');
  const base = classPath(params.classId);
  const enrollment = `${base}/enrollments/${encodeURIComponent(textOf(form, 'enrollmentId'))}`;
  const here = `${PATHS.classes}/${params.classId}`;
  const back = (tab?: Tab) => redirect(tab ? `${here}?tab=${tab}` : here);
  const post = (path: string, body?: unknown, method: 'POST' | 'PUT' | 'PATCH' = 'POST') =>
    api.call(path, { method, body });
  let result: IntentResult;

  switch (intent) {
    case 'pause':
    case 'resume':
      result = await runIntent(intent, form, [], () => post(`${base}/${intent}`));
      return result.ok ? back() : data(result);
    case 'end':
      result = await runIntent(intent, form, ['reason'], () =>
        post(`${base}/end`, { reason: textOf(form, 'reason') }),
      );
      return result.ok ? back() : data(result);
    case 'rename':
      result = await runIntent(intent, form, ['name'], () =>
        post(base, { name: textOf(form, 'name') }, 'PATCH'),
      );
      return result.ok ? back() : data(result);
    case 'schedule-save': {
      const weekdays = form.getAll('weekday').map(Number);
      const scheduleId = textOf(form, 'scheduleId');
      const body = {
        weekdays,
        startTime: textOf(form, 'startTime'),
        durationMinutes: integerFrom(textOf(form, 'durationMinutes')),
        startDate: isoOrText(textOf(form, 'startDate')),
        untilDate: isoOrText(textOf(form, 'untilDate')),
        teachingMode: textOf(form, 'teachingMode'),
        locationNote: textOf(form, 'locationNote'),
        onlineUrl: textOf(form, 'onlineUrl'),
      };
      result = await runIntent(
        intent,
        form,
        ['weekdays', 'startTime', 'durationMinutes', 'startDate', 'untilDate', 'teachingMode'],
        () =>
          scheduleId
            ? post(`${base}/schedules/${encodeURIComponent(scheduleId)}`, body, 'PUT')
            : post(`${base}/schedules`, body),
        { locationNote: 'teachingMode', onlineUrl: 'teachingMode' },
      );
      if (result.ok) return back();
      return data({ ...result, values: { ...result.values, weekdays: weekdays.join(',') } });
    }
    case 'schedule-end':
      result = await runIntent(intent, form, [], () =>
        post(`${base}/schedules/${encodeURIComponent(textOf(form, 'scheduleId'))}/end`),
      );
      return result.ok ? back() : data(result);
    case 'lesson-new': {
      const date = isoOrText(textOf(form, 'date'));
      let createdId = '';
      result = await runIntent(
        intent,
        form,
        ['date', 'time', 'durationMinutes', 'teachingMode', 'makeupForLessonId'],
        async () => {
          const created = await api.call(`${base}/lessons`, {
            method: 'POST',
            schema: LessonDetail,
            body: {
              startsAt: date ? vnInstant(date, textOf(form, 'time')) : '',
              durationMinutes: integerFrom(textOf(form, 'durationMinutes')),
              teachingMode: textOf(form, 'teachingMode'),
              locationNote: textOf(form, 'locationNote'),
              onlineUrl: textOf(form, 'onlineUrl'),
              makeupForLessonId: textOf(form, 'makeupForLessonId') || null,
            },
          });
          createdId = created.id;
        },
        { startsAt: 'date', locationNote: 'teachingMode', onlineUrl: 'teachingMode' },
      );
      return result.ok ? redirect(`${here}/lessons/${createdId}`) : data(result);
    }
    case 'fee-propose':
      result = await runIntent(intent, form, ['sessionPriceVnd', 'sessionMinutes', 'note'], () =>
        post(`${enrollment}/fee-rates`, {
          sessionPriceVnd: integerFrom(textOf(form, 'sessionPriceVnd')),
          sessionMinutes: integerFrom(textOf(form, 'sessionMinutes')),
          note: textOf(form, 'note'),
        }),
      );
      return result.ok ? back('fees') : data(result);
    case 'fee-accept':
    case 'fee-reject':
    case 'fee-withdraw': {
      const decision = intent.slice('fee-'.length);
      result = await runIntent(intent, form, [], () =>
        post(`${enrollment}/fee-rates/${encodeURIComponent(textOf(form, 'rateId'))}/${decision}`),
      );
      return result.ok ? back('fees') : data(result);
    }
    case 'notes':
      result = await runIntent(intent, form, ['initialAssessment', 'teachingNotes'], () =>
        post(
          enrollment,
          {
            initialAssessment: textOf(form, 'initialAssessment'),
            teachingNotes: textOf(form, 'teachingNotes'),
          },
          'PATCH',
        ),
      );
      return data(result);
    case 'goal-save': {
      const goalId = textOf(form, 'goalId');
      const body: Record<string, unknown> = {
        periodType: textOf(form, 'periodType'),
        periodStart: isoOrText(textOf(form, 'periodStart')),
        periodEnd: isoOrText(textOf(form, 'periodEnd')),
        description: textOf(form, 'description'),
      };
      if (goalId) {
        body.status = textOf(form, 'status');
        body.progressNote = textOf(form, 'progressNote');
      }
      result = await runIntent(
        intent,
        form,
        ['periodType', 'periodStart', 'periodEnd', 'description', 'status', 'progressNote'],
        () =>
          goalId
            ? post(`${enrollment}/goals/${encodeURIComponent(goalId)}`, body, 'PATCH')
            : post(`${enrollment}/goals`, body),
      );
      return result.ok ? back('goals') : data(result);
    }
    case 'assessment-save': {
      const assessmentId = textOf(form, 'assessmentId');
      const body: Record<string, unknown> = {
        kind: textOf(form, 'kind'),
        title: textOf(form, 'title'),
        score: decimalFrom(textOf(form, 'score')),
        maxScore: decimalFrom(textOf(form, 'maxScore')) ?? 10,
        comment: textOf(form, 'comment'),
        assessedOn: isoOrText(textOf(form, 'assessedOn')),
      };
      if (!assessmentId) body.lessonId = textOf(form, 'lessonId') || null;
      result = await runIntent(
        intent,
        form,
        ['kind', 'title', 'score', 'maxScore', 'comment', 'assessedOn', 'lessonId'],
        () =>
          assessmentId
            ? post(`${enrollment}/assessments/${encodeURIComponent(assessmentId)}`, body, 'PATCH')
            : post(`${enrollment}/assessments`, body),
      );
      return result.ok ? back('results') : data(result);
    }
    default:
      throw data(null, { status: 400 });
  }
}

export default function ClassDetailPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const { cls, lessons, catalogs, tab, open } = loaderData;
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const here = `${PATHS.classes}/${cls.id}`;
  const enrollment = cls.enrollments[0];
  const isTutor = cls.myRole === 'tutor';
  const isClient = cls.myRole === 'client';
  const ended = cls.status === 'ended';
  const title = classTitle({ ...cls, learnerName: cls.learner.name }, catalogs.subjects);
  const subject = labelOf(catalogs.subjects, cls.subjectId) ?? '';
  const generalFailure =
    failure && failure.formError && !open.schedule && !open.lesson && !open.fee && !open.goal
      ? failure
      : undefined;
  const confirmOn = (message: string) => (event: FormEvent) => {
    if (!window.confirm(message)) event.preventDefault();
  };
  const tabLink = (next: Tab) =>
    cn(
      'inline-flex min-h-control-md items-center border-b-2 px-3 font-semibold no-underline',
      next === tab
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    );
  const lessonLabel = (l: (typeof lessons)[number]) => lessonWhen(t, l);
  const missed = lessons.filter((l) => l.status === 'cancelled' || l.status === 'tutor_absent');
  const heldLessons = lessons.filter((l) => l.status === 'held');
  const schedule = open.schedule
    ? (cls.schedules.find((s) => s.id === open.schedule) ?? null)
    : null;
  const defaultMode = cls.teachingMode === 'online' ? 'online' : 'in_person';
  const sortedLessons = [...lessons].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const pendingRate = enrollment?.feeRates.find((r) => r.status === 'proposed');

  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: t('classes.title'), to: PATHS.classes }, { label: title }]} />

      <Card className="gap-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-h1">{title}</h1>
              <Badge variant={CLASS_STATUS_BADGE[cls.status]} dot>
                {t(`tutoringClassStatus.${cls.status}`)}
              </Badge>
            </div>
            <span className="text-muted-foreground">
              {[
                subject,
                labelOf(catalogs.grades, cls.gradeLevelId),
                t(`requestPostGoal.${cls.goal}`),
                t(`teachingMode.${cls.teachingMode}`),
                cls.endedOn
                  ? t('classes.endedOn', { date: formatDate(cls.endedOn, i18n.language) })
                  : t('classes.since', { date: formatDate(cls.startedOn, i18n.language) }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {cls.goalNote && <span className="text-small">{cls.goalNote}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {cls.conversationId && (
              <Link
                to={`${PATHS.messages}/${cls.conversationId}`}
                className={buttonVariants({ variant: 'secondary' })}
              >
                <MessageSquare aria-hidden="true" />
                {isTutor ? t('classes.messageParent') : t('classes.messageTutor')}
              </Link>
            )}
            {isTutor && !ended && cls.status === 'active' && (
              <Link to={`${here}?lesson=new`} className={buttonVariants()}>
                <Plus aria-hidden="true" />
                {t('classes.newLesson')}
              </Link>
            )}
          </div>
        </div>
        <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-3">
          <div className="flex flex-col">
            <span className="text-small text-muted-foreground">
              {isTutor ? t('classes.learner') : t('classes.tutor')}
            </span>
            <span className="font-semibold">
              {isTutor
                ? (cls.learnerIdentity?.fullName ?? cls.learner.name)
                : cls.tutor.displayName}
            </span>
            {isTutor && cls.learnerIdentity?.schoolName && (
              <span className="text-small">
                {[cls.learnerIdentity.schoolName, cls.learnerIdentity.addressLine]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </div>
          {cls.contact && (
            <div className="flex flex-col">
              <span className="text-small text-muted-foreground">
                {isTutor ? t('classes.parent') : t('classes.contact')}
              </span>
              <span className="font-semibold">
                {cls.contact.fullName ?? cls.client.displayName}
              </span>
              <span className="text-small">
                {cls.contact.phone && <a href={`tel:${cls.contact.phone}`}>{cls.contact.phone}</a>}
                {cls.contact.phone && cls.contact.email && ' · '}
                {cls.contact.email && (
                  <a href={`mailto:${cls.contact.email}`}>{cls.contact.email}</a>
                )}
              </span>
            </div>
          )}
          {cls.currentFee && (
            <div className="flex flex-col">
              <span className="text-small text-muted-foreground">{t('classes.currentFee')}</span>
              <span className="font-semibold">
                {t('classes.feeLine', {
                  price: vnd(i18n.language, cls.currentFee.sessionPriceVnd),
                  minutes: cls.currentFee.sessionMinutes,
                })}
              </span>
              {cls.feeChangePending ? (
                <Link to={`${here}?tab=fees`} className="text-small font-semibold">
                  {isClient ? t('classes.feeAwaitingYou') : t('classes.feeAwaitingParent')}
                </Link>
              ) : (
                isTutor &&
                !ended && (
                  <Link to={`${here}?tab=fees&fee=new`} className="text-small font-semibold">
                    {t('classes.feeProposeLink')}
                  </Link>
                )
              )}
            </div>
          )}
        </div>
        {ended && cls.endedReason && (
          <Alert variant="info">{t('classes.endedReason', { reason: cls.endedReason })}</Alert>
        )}
        {generalFailure?.formError && (
          <Alert variant="danger">{tr(generalFailure.formError)}</Alert>
        )}
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <nav
            aria-label={t('classes.tabs')}
            className="flex flex-wrap gap-1 border-b border-border"
          >
            {TABS.filter((x) => x !== 'fees' || cls.myRole !== 'student').map((x) => (
              <Link
                key={x}
                to={`${here}?tab=${x}`}
                aria-current={x === tab ? 'page' : undefined}
                className={tabLink(x)}
              >
                {t(`classes.tab_${x}`)}
              </Link>
            ))}
          </nav>

          {open.lesson === 'new' && isTutor && (
            <Card className="sm:p-6">
              <LessonForm
                intent="lesson-new"
                title={t('classes.newLesson')}
                lead={t('classes.newLessonLead')}
                defaults={{
                  date: vnDate(new Date(loaderData.now + 24 * 60 * 60 * 1000)),
                  time: cls.schedules.find((s) => s.status === 'active')?.startTime ?? '18:00',
                  durationMinutes: cls.currentFee?.sessionMinutes ?? 90,
                  teachingMode: defaultMode,
                  locationNote: '',
                  onlineUrl: '',
                  makeupForLessonId: open.forLesson,
                }}
                makeupOptions={missed.map((l) => ({ id: l.id, label: lessonLabel(l) }))}
                failure={failure}
                cancelTo={here}
                submitLabel={t('classes.createLesson')}
                busy={busy}
              />
            </Card>
          )}

          {tab === 'lessons' && (
            <LessonsTab
              lessons={sortedLessons}
              here={here}
              isClient={isClient}
              lessonLabel={lessonLabel}
            />
          )}

          {tab === 'results' && enrollment && (
            <Card className="gap-4 sm:p-6">
              <CardHeader>
                <h2 className="text-h3">{t('classes.tab_results')}</h2>
                {isTutor && !ended && !open.assessment && (
                  <Link
                    to={`${here}?tab=results&assessment=new`}
                    className={buttonVariants({ variant: 'secondary' })}
                  >
                    {t('classes.assessmentNew')}
                  </Link>
                )}
              </CardHeader>
              {isTutor && open.assessment && (
                <AssessmentForm
                  enrollmentId={enrollment.id}
                  assessment={enrollment.assessments.find((a) => a.id === open.assessment) ?? null}
                  lessonOptions={heldLessons.map((l) => ({ id: l.id, label: lessonLabel(l) }))}
                  defaultLessonId={open.forLesson}
                  failure={failure}
                  cancelTo={`${here}?tab=results`}
                  busy={busy}
                />
              )}
              {enrollment.assessments.length === 0 ? (
                <p className="text-muted-foreground">{t('classes.assessmentsEmpty')}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {enrollment.assessments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-start gap-3 py-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-semibold">
                          {a.title}
                          <span className="font-normal text-muted-foreground">
                            {' · '}
                            {t(`assessmentKind.${a.kind}`)}
                            {' · '}
                            {formatDate(a.assessedOn, i18n.language)}
                          </span>
                        </span>
                        <p className="whitespace-pre-line">{a.comment}</p>
                      </div>
                      {a.score !== null && (
                        <span className="text-h3">
                          {a.score}
                          <span className="text-small text-muted-foreground">/{a.maxScore}</span>
                        </span>
                      )}
                      {isTutor && !ended && (
                        <Link
                          to={`${here}?tab=results&assessment=${a.id}`}
                          className={buttonVariants({ variant: 'ghost' })}
                        >
                          {t('classes.edit')}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-small text-muted-foreground">{t('classes.noRanking')}</p>
            </Card>
          )}

          {tab === 'goals' && enrollment && (
            <Card className="gap-4 sm:p-6">
              <CardHeader>
                <h2 className="text-h3">{t('classes.tab_goals')}</h2>
                {isTutor && !ended && !open.goal && (
                  <Link
                    to={`${here}?tab=goals&goal=new`}
                    className={buttonVariants({ variant: 'secondary' })}
                  >
                    {t('classes.goalNew')}
                  </Link>
                )}
              </CardHeader>
              {isTutor && open.goal && (
                <GoalForm
                  enrollmentId={enrollment.id}
                  goal={enrollment.goals.find((g) => g.id === open.goal) ?? null}
                  failure={failure}
                  cancelTo={`${here}?tab=goals`}
                  busy={busy}
                />
              )}
              {enrollment.goals.length === 0 ? (
                <p className="text-muted-foreground">{t('classes.goalsEmpty')}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {enrollment.goals.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-start gap-3 py-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-small text-muted-foreground">
                          {t(`learningGoalPeriod.${g.periodType}`)} ·{' '}
                          {formatDate(g.periodStart, i18n.language)} –{' '}
                          {formatDate(g.periodEnd, i18n.language)}
                        </span>
                        <p className="whitespace-pre-line font-semibold">{g.description}</p>
                        {g.progressNote && (
                          <p className="whitespace-pre-line text-small">{g.progressNote}</p>
                        )}
                      </div>
                      <Badge variant={g.status === 'active' ? 'verified' : 'neutral'}>
                        {t(`learningGoalStatus.${g.status}`)}
                      </Badge>
                      {isTutor && !ended && (
                        <Link
                          to={`${here}?tab=goals&goal=${g.id}`}
                          className={buttonVariants({ variant: 'ghost' })}
                        >
                          {t('classes.edit')}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === 'fees' && enrollment && (
            <Card className="gap-4 sm:p-6">
              <CardHeader>
                <h2 className="text-h3">{t('classes.feeHistory')}</h2>
                {isTutor && !ended && !pendingRate && open.fee !== 'new' && (
                  <Link
                    to={`${here}?tab=fees&fee=new`}
                    className={buttonVariants({ variant: 'secondary' })}
                  >
                    {t('classes.feeProposeLink')}
                  </Link>
                )}
              </CardHeader>
              {failure?.formError && open.fee !== 'new' && (
                <Alert variant="danger">{tr(failure.formError)}</Alert>
              )}
              {isTutor && open.fee === 'new' && (
                <FeeProposalForm
                  enrollmentId={enrollment.id}
                  current={
                    cls.currentFee
                      ? {
                          price: vnd(i18n.language, cls.currentFee.sessionPriceVnd),
                          minutes: cls.currentFee.sessionMinutes,
                        }
                      : null
                  }
                  failure={failure}
                  cancelTo={`${here}?tab=fees`}
                  busy={busy}
                />
              )}
              {pendingRate && (
                <PendingFee
                  rate={pendingRate}
                  enrollmentId={enrollment.id}
                  isTutor={isTutor}
                  isClient={isClient}
                  busy={busy}
                  confirmOn={confirmOn}
                />
              )}
              <ul className="flex flex-col divide-y divide-border">
                {enrollment.feeRates
                  .filter((r) => r.status !== 'proposed')
                  .map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="min-w-0 flex-1">
                        {t('classes.feeLine', {
                          price: vnd(i18n.language, r.sessionPriceVnd),
                          minutes: r.sessionMinutes,
                        })}
                        {r.effectiveFrom && (
                          <span className="text-small text-muted-foreground">
                            {' · '}
                            {t('classes.feeFrom', {
                              date: formatDate(r.effectiveFrom, i18n.language),
                            })}
                          </span>
                        )}
                      </span>
                      <Badge variant={r.status === 'active' ? 'success' : 'neutral'}>
                        {t(`feeRateStatus.${r.status}`)}
                      </Badge>
                    </li>
                  ))}
              </ul>
              <p className="text-small text-muted-foreground">{t('classes.feeRule')}</p>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <Card className="gap-3">
            <CardHeader>
              <h2 className="text-h3">{t('classes.schedules')}</h2>
              {isTutor && !ended && !open.schedule && (
                <Link to={`${here}?schedule=new`} className={buttonVariants({ variant: 'ghost' })}>
                  {t('classes.scheduleAdd')}
                </Link>
              )}
            </CardHeader>
            {isTutor && open.schedule && (
              <ScheduleForm
                schedule={schedule}
                defaultMode={defaultMode}
                failure={failure}
                cancelTo={here}
                busy={busy}
              />
            )}
            {cls.schedules.filter((s) => s.status === 'active').length === 0 && (
              <p className="text-small text-muted-foreground">
                {isTutor ? t('classes.schedulesEmptyTutor') : t('classes.schedulesEmpty')}
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {cls.schedules
                .filter((s) => s.status === 'active')
                .map((s) => (
                  <li key={s.id} className="flex flex-col gap-1">
                    <span className="font-semibold">{scheduleSummary(t, s)}</span>
                    <span className="text-small text-muted-foreground">
                      {[
                        t(`lessonMode.${s.teachingMode}`),
                        s.locationNote,
                        s.untilDate &&
                          t('classes.scheduleUntilDate', {
                            date: formatDate(s.untilDate, i18n.language),
                          }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {isTutor && !ended && (
                      <div className="flex flex-wrap gap-2">
                        <Link
                          to={`${here}?schedule=${s.id}`}
                          className={buttonVariants({ variant: 'ghost' })}
                        >
                          {t('classes.edit')}
                        </Link>
                        <Form method="post" onSubmit={confirmOn(t('classes.scheduleEndPrompt'))}>
                          <input type="hidden" name="intent" value="schedule-end" />
                          <input type="hidden" name="scheduleId" value={s.id} />
                          <Button type="submit" variant="ghost" disabled={busy}>
                            {t('classes.scheduleEnd')}
                          </Button>
                        </Form>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
            <p className="text-small text-muted-foreground">{t('classes.scheduleHint')}</p>
          </Card>

          {isTutor && !ended && (
            <Card className="gap-3">
              <h2 className="text-h3">{t('classes.statusTitle')}</h2>
              <p className="text-small text-muted-foreground">{t('classes.statusLead')}</p>
              {cls.status === 'active' ? (
                <Form method="post" onSubmit={confirmOn(t('classes.pausePrompt'))}>
                  <input type="hidden" name="intent" value="pause" />
                  <Button type="submit" variant="secondary" block disabled={busy}>
                    {t('classes.pause')}
                  </Button>
                </Form>
              ) : (
                <Form method="post">
                  <input type="hidden" name="intent" value="resume" />
                  <Button type="submit" variant="secondary" block disabled={busy}>
                    {t('classes.resume')}
                  </Button>
                </Form>
              )}
              {open.end ? (
                <Form method="post" className="flex flex-col gap-3" replace>
                  <input type="hidden" name="intent" value="end" />
                  <Alert variant="warning">{t('classes.endWarning')}</Alert>
                  <TextAreaField
                    name="reason"
                    label={t('classes.endReason')}
                    rows={3}
                    maxLength={500}
                    required
                    error={
                      failure?.intent === 'end' && failure.fieldErrors.reason
                        ? tr(failure.fieldErrors.reason)
                        : undefined
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Link to={here} className={buttonVariants({ variant: 'secondary' })} replace>
                      {t('classes.keepClass')}
                    </Link>
                    <Button type="submit" variant="danger" disabled={busy}>
                      {t('classes.end')}
                    </Button>
                  </div>
                </Form>
              ) : (
                <Link to={`${here}?end=1`} className={buttonVariants({ variant: 'ghost' })}>
                  {t('classes.end')}
                </Link>
              )}
            </Card>
          )}

          {isClient && !ended && <Alert variant="info">{t('classes.parentStatusHint')}</Alert>}

          {isTutor && enrollment && (
            <Card className="gap-3">
              <h2 className="text-h3">{t('classes.notesTitle')}</h2>
              <Form method="post" className="flex flex-col gap-3">
                <input type="hidden" name="intent" value="notes" />
                <input type="hidden" name="enrollmentId" value={enrollment.id} />
                <TextAreaField
                  name="initialAssessment"
                  label={t('classes.initialAssessment')}
                  hint={t('classes.initialAssessmentHint')}
                  rows={3}
                  defaultValue={enrollment.initialAssessment ?? ''}
                  disabled={ended}
                />
                <TextAreaField
                  name="teachingNotes"
                  label={t('classes.teachingNotes')}
                  hint={t('classes.teachingNotesHint')}
                  rows={3}
                  defaultValue={enrollment.teachingNotes ?? ''}
                  disabled={ended}
                />
                {actionData?.intent === 'notes' && actionData.ok && (
                  <Alert variant="success">{t('classes.notesSaved')}</Alert>
                )}
                {!ended && (
                  <Button type="submit" variant="secondary" disabled={busy}>
                    {t('common.save')}
                  </Button>
                )}
              </Form>
              {isTutor && !ended && (
                <details open={open.rename}>
                  <summary className="cursor-pointer font-semibold text-primary">
                    {t('classes.rename')}
                  </summary>
                  <Form method="post" className="mt-3 flex flex-col gap-3">
                    <input type="hidden" name="intent" value="rename" />
                    <TextField
                      name="name"
                      label={t('classes.nameLabel')}
                      hint={t('classes.nameHint')}
                      maxLength={120}
                      defaultValue={cls.name ?? ''}
                    />
                    <Button type="submit" variant="secondary" disabled={busy}>
                      {t('common.save')}
                    </Button>
                  </Form>
                </details>
              )}
            </Card>
          )}

          {!isTutor && enrollment?.initialAssessment && (
            <Card className="gap-2">
              <h2 className="text-h3">{t('classes.initialAssessment')}</h2>
              <p className="whitespace-pre-line">{enrollment.initialAssessment}</p>
            </Card>
          )}

          {cls.connectionRequestId && (
            <Link
              to={`${PATHS.connections}/${cls.connectionRequestId}`}
              className={buttonVariants({ variant: 'ghost' })}
            >
              {t('classes.viewAgreement')}
            </Link>
          )}
        </aside>
      </div>
    </PageContainer>
  );
}

function LessonsTab({
  lessons,
  here,
  isClient,
  lessonLabel,
}: {
  lessons: LessonList['items'];
  here: string;
  isClient: boolean;
  lessonLabel: (l: LessonList['items'][number]) => string;
}) {
  const { t } = useTranslation();
  return (
    <Card className="gap-3 sm:p-6">
      <CardHeader>
        <h2 className="text-h3">{t('classes.lessonsTitle')}</h2>
        <Link to={PATHS.schedule} className={buttonVariants({ variant: 'ghost' })}>
          {t('classes.openSchedule')}
        </Link>
      </CardHeader>
      {lessons.length === 0 ? (
        <p className="text-muted-foreground">{t('classes.lessonsEmpty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {lessons.map((l) => {
            const badge = lessonBadge(l);
            const att = l.attendanceStates[0];
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    to={`${here}/lessons/${l.id}`}
                    className="font-semibold text-foreground hover:text-primary"
                  >
                    {lessonLabel(l)}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={badge.variant}>{t(badge.key)}</Badge>
                    {l.makeupForLessonId && <Badge variant="verified">{t('lessons.makeup')}</Badge>}
                    {l.isLateCancellation && (
                      <Badge variant="warning">{t('lessons.lateCancellation')}</Badge>
                    )}
                    {att && (
                      <span className="text-small text-muted-foreground">
                        {t(`attendanceStatus.${att.status}`)}
                      </span>
                    )}
                    {att && (
                      <Badge variant={CONFIRMATION_BADGE[att.confirmationStatus]}>
                        {t(`attendanceConfirmationStatus.${att.confirmationStatus}`)}
                      </Badge>
                    )}
                  </div>
                </div>
                <Link
                  to={`${here}/lessons/${l.id}`}
                  className={buttonVariants({ variant: l.awaitingMe ? 'primary' : 'ghost' })}
                >
                  {l.awaitingMe
                    ? isClient
                      ? t('lessons.confirmAction')
                      : t('lessons.recordAction')
                    : t('classes.open')}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-small text-muted-foreground">{t('classes.lessonsRule')}</p>
    </Card>
  );
}

function PendingFee({
  rate,
  enrollmentId,
  isTutor,
  isClient,
  busy,
  confirmOn,
}: {
  rate: FeeRate;
  enrollmentId: string;
  isTutor: boolean;
  isClient: boolean;
  busy: boolean;
  confirmOn: (message: string) => (event: FormEvent) => void;
}) {
  const { t, i18n } = useTranslation();
  const decide = (intent: string, label: string, variant: 'primary' | 'secondary' | 'ghost') => (
    <Form
      method="post"
      onSubmit={intent === 'fee-accept' ? confirmOn(t('classes.feeAcceptPrompt')) : undefined}
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <input type="hidden" name="rateId" value={rate.id} />
      <Button type="submit" variant={variant} disabled={busy}>
        {label}
      </Button>
    </Form>
  );
  return (
    <Alert variant="warning" title={t('classes.feePendingTitle')}>
      <div className="flex flex-col gap-3">
        <KeyValueList>
          <KeyValue label={t('classes.feeProposed')}>
            {t('classes.feeLine', {
              price: vnd(i18n.language, rate.sessionPriceVnd),
              minutes: rate.sessionMinutes,
            })}
          </KeyValue>
          {rate.note && <KeyValue label={t('classes.feeNote')}>{rate.note}</KeyValue>}
        </KeyValueList>
        <div className="flex flex-wrap gap-2">
          {isClient && decide('fee-accept', t('classes.feeAccept'), 'primary')}
          {isClient && decide('fee-reject', t('classes.feeReject'), 'secondary')}
          {isTutor && decide('fee-withdraw', t('classes.feeWithdraw'), 'secondary')}
        </div>
        {isClient && <span className="text-small">{t('classes.feeRule')}</span>}
      </div>
    </Alert>
  );
}
