// Các form của trang lớp học và buổi học (G6, canvas TutorClass, FeeChange, MakeupLesson, EditSchedule). Mỗi form
// gửi một `intent` tới action của trang; lỗi trả về (`IntentFailure`) hiện lại giá trị đã nhập và lỗi theo ô.
import {
  type Assessment,
  AssessmentKind,
  type ClassSchedule,
  type LearningGoal,
  LearningGoalPeriod,
  LearningGoalStatus,
  LESSON_LIMITS,
  LessonMode,
} from '@tps/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Link } from 'react-router';
import { Alert } from '~/components/ui/alert';
import { Button, buttonVariants } from '~/components/ui/button';
import { DateField } from '~/components/ui/date-field';
import { SelectField, TextAreaField, TextField } from '~/components/ui/field';
import { addDays, LESSON_DURATIONS, LESSON_TIMES } from '~/lib/classes';
import type { IntentFailure } from '~/lib/classes.server';
import { isoToDisplay, todayIso } from '~/lib/dates';
import { useMessage } from '~/lib/use-message';

/** Khoảng ngày chọn được trên lịch: hai năm trước tới hai năm sau. API kiểm tra khoảng thật. */
const dateRange = () => ({ min: addDays(todayIso(), -730), max: addDays(todayIso(), 730) });

/** Giá trị và lỗi của một form theo kết quả action gần nhất (chỉ khi đúng intent). */
function useFormState(intent: string, failure: IntentFailure | undefined) {
  const tr = useMessage();
  const mine = failure?.intent === intent ? failure : undefined;
  return {
    value: (name: string, fallback: string) => mine?.values[name] ?? fallback,
    error: (name: string) => {
      const message = mine?.fieldErrors[name];
      return message ? tr(message) : undefined;
    },
    formError: mine?.formError ? tr(mine.formError) : undefined,
    failed: Boolean(mine),
  };
}

function FormFooter({
  cancelTo,
  submitLabel,
  busy,
}: {
  cancelTo: string;
  submitLabel: string;
  busy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
      <Link to={cancelTo} className={buttonVariants({ variant: 'secondary' })} replace>
        {t('common.cancel')}
      </Link>
      <Button type="submit" disabled={busy}>
        {submitLabel}
      </Button>
    </div>
  );
}

function FormShell({
  intent,
  title,
  lead,
  children,
  formError,
  hidden,
}: {
  intent: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  formError: string | undefined;
  hidden?: Record<string, string>;
}) {
  return (
    <Form method="post" className="flex flex-col gap-4" replace>
      <input type="hidden" name="intent" value={intent} />
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{title}</h2>
        {lead && <p className="text-small text-muted-foreground">{lead}</p>}
      </div>
      {formError && <Alert variant="danger">{formError}</Alert>}
      {children}
    </Form>
  );
}

function ModeFields({
  state,
  defaults,
}: {
  state: ReturnType<typeof useFormState>;
  defaults: { teachingMode: string; locationNote: string; onlineUrl: string };
}) {
  const { t } = useTranslation();
  return (
    <>
      <SelectField
        name="teachingMode"
        label={t('lessons.mode')}
        defaultValue={state.value('teachingMode', defaults.teachingMode)}
        error={state.error('teachingMode')}
      >
        {LessonMode.options.map((m) => (
          <option key={m} value={m}>
            {t(`lessonMode.${m}`)}
          </option>
        ))}
      </SelectField>
      <TextField
        name="locationNote"
        label={t('lessons.location')}
        hint={t('lessons.locationHint')}
        maxLength={LESSON_LIMITS.locationLength}
        defaultValue={state.value('locationNote', defaults.locationNote)}
        error={state.error('locationNote')}
      />
      <TextField
        name="onlineUrl"
        type="url"
        label={t('lessons.onlineUrl')}
        hint={t('lessons.onlineUrlHint')}
        maxLength={LESSON_LIMITS.urlLength}
        defaultValue={state.value('onlineUrl', defaults.onlineUrl)}
        error={state.error('onlineUrl')}
      />
    </>
  );
}

function DurationSelect({
  state,
  fallback,
  name = 'durationMinutes',
}: {
  state: ReturnType<typeof useFormState>;
  fallback: number;
  name?: string;
}) {
  const { t } = useTranslation();
  const options = LESSON_DURATIONS.includes(fallback as (typeof LESSON_DURATIONS)[number])
    ? LESSON_DURATIONS
    : [...LESSON_DURATIONS, fallback].sort((a, b) => a - b);
  return (
    <SelectField
      name={name}
      label={t('lessons.duration')}
      defaultValue={state.value(name, String(fallback))}
      error={state.error(name)}
    >
      {options.map((m) => (
        <option key={m} value={m}>
          {t('classes.minutes', { count: m })}
        </option>
      ))}
    </SelectField>
  );
}

function TimeSelect({
  state,
  fallback,
  name,
  label,
}: {
  state: ReturnType<typeof useFormState>;
  fallback: string;
  name: string;
  label: string;
}) {
  const options = LESSON_TIMES.includes(fallback)
    ? LESSON_TIMES
    : [...LESSON_TIMES, fallback].sort();
  return (
    <SelectField
      name={name}
      label={label}
      defaultValue={state.value(name, fallback)}
      error={state.error(name)}
    >
      {options.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </SelectField>
  );
}

// ---- Lịch lặp ---------------------------------------------------------------------------------

export function ScheduleForm({
  schedule,
  defaultMode,
  failure,
  cancelTo,
  busy,
}: {
  schedule: ClassSchedule | null;
  defaultMode: string;
  failure: IntentFailure | undefined;
  cancelTo: string;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const state = useFormState('schedule-save', failure);
  const chosen = new Set(
    state.failed
      ? (failure?.values.weekdays ?? '').split(',').filter(Boolean)
      : (schedule?.weekdays ?? []).map(String),
  );
  return (
    <FormShell
      intent="schedule-save"
      title={schedule ? t('classes.scheduleEdit') : t('classes.scheduleNew')}
      lead={t('classes.scheduleLead', { weeks: LESSON_LIMITS.generateWeeks })}
      formError={state.formError}
      hidden={schedule ? { scheduleId: schedule.id } : {}}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label">{t('classes.weekdays')}</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label
              key={d}
              className="flex min-h-control-md cursor-pointer items-center gap-2 rounded-md border border-border-strong px-3 has-checked:border-primary has-checked:bg-primary-subtle"
            >
              <input
                type="checkbox"
                name="weekday"
                value={d}
                defaultChecked={chosen.has(String(d))}
                className="size-4.5 accent-primary"
              />
              {t(`weekday.${d}` as 'weekday.1')}
            </label>
          ))}
        </div>
        {state.error('weekdays') && (
          <p className="text-small text-danger" role="alert">
            {state.error('weekdays')}
          </p>
        )}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <TimeSelect
          state={state}
          name="startTime"
          label={t('lessons.startTime')}
          fallback={schedule?.startTime ?? '18:00'}
        />
        <DurationSelect state={state} fallback={schedule?.durationMinutes ?? 90} />
        <DateField
          {...dateRange()}
          name="startDate"
          label={t('classes.scheduleFrom')}
          defaultValue={state.value('startDate', isoToDisplay(schedule?.startDate ?? todayIso()))}
          error={state.error('startDate')}
        />
        <DateField
          {...dateRange()}
          name="untilDate"
          label={t('classes.scheduleUntil')}
          hint={t('classes.scheduleUntilHint')}
          defaultValue={state.value(
            'untilDate',
            schedule?.untilDate ? isoToDisplay(schedule.untilDate) : '',
          )}
          error={state.error('untilDate')}
        />
      </div>
      <ModeFields
        state={state}
        defaults={{
          teachingMode: schedule?.teachingMode ?? defaultMode,
          locationNote: schedule?.locationNote ?? '',
          onlineUrl: schedule?.onlineUrl ?? '',
        }}
      />
      <FormFooter cancelTo={cancelTo} submitLabel={t('classes.scheduleSave')} busy={busy} />
    </FormShell>
  );
}

// ---- Buổi lẻ, buổi bù, dời buổi -----------------------------------------------------------------

export function LessonForm({
  intent,
  title,
  lead,
  defaults,
  makeupOptions,
  failure,
  cancelTo,
  submitLabel,
  busy,
}: {
  intent: 'lesson-new' | 'reschedule';
  title: string;
  lead?: string;
  defaults: {
    date: string;
    time: string;
    durationMinutes: number;
    teachingMode: string;
    locationNote: string;
    onlineUrl: string;
    makeupForLessonId?: string;
  };
  /** Buổi đã hủy / gia sư vắng để chọn học bù (chỉ khi tạo buổi). */
  makeupOptions?: { id: string; label: string }[];
  failure: IntentFailure | undefined;
  cancelTo: string;
  submitLabel: string;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const state = useFormState(intent, failure);
  return (
    <FormShell intent={intent} title={title} lead={lead} formError={state.formError}>
      {makeupOptions && (
        <SelectField
          name="makeupForLessonId"
          label={t('lessons.makeupFor')}
          defaultValue={state.value('makeupForLessonId', defaults.makeupForLessonId ?? '')}
          error={state.error('makeupForLessonId')}
        >
          <option value="">{t('lessons.noMakeup')}</option>
          {makeupOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </SelectField>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <DateField
          {...dateRange()}
          name="date"
          label={t('lessons.date')}
          defaultValue={state.value('date', isoToDisplay(defaults.date))}
          error={state.error('date')}
        />
        <TimeSelect
          state={state}
          name="time"
          label={t('lessons.startTime')}
          fallback={defaults.time}
        />
        <DurationSelect state={state} fallback={defaults.durationMinutes} />
      </div>
      <ModeFields state={state} defaults={defaults} />
      <FormFooter cancelTo={cancelTo} submitLabel={submitLabel} busy={busy} />
    </FormShell>
  );
}

// ---- Đổi học phí (D17) --------------------------------------------------------------------------

export function FeeProposalForm({
  enrollmentId,
  current,
  failure,
  cancelTo,
  busy,
}: {
  enrollmentId: string;
  current: { price: string; minutes: number } | null;
  failure: IntentFailure | undefined;
  cancelTo: string;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const state = useFormState('fee-propose', failure);
  return (
    <FormShell
      intent="fee-propose"
      title={t('classes.feeProposeTitle')}
      lead={t('classes.feeProposeLead')}
      formError={state.formError}
      hidden={{ enrollmentId }}
    >
      {current && (
        <p className="text-small">
          {t('classes.feeCurrent', { price: current.price, minutes: current.minutes })}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="sessionPriceVnd"
          label={t('classes.feeNewPrice')}
          inputMode="numeric"
          defaultValue={state.value('sessionPriceVnd', '')}
          error={state.error('sessionPriceVnd')}
          required
        />
        <DurationSelect state={state} name="sessionMinutes" fallback={current?.minutes ?? 90} />
      </div>
      <TextAreaField
        name="note"
        label={t('classes.feeNote')}
        rows={3}
        maxLength={500}
        defaultValue={state.value('note', '')}
        error={state.error('note')}
      />
      <FormFooter cancelTo={cancelTo} submitLabel={t('classes.feePropose')} busy={busy} />
    </FormShell>
  );
}

// ---- Mục tiêu học tập ----------------------------------------------------------------------------

export function GoalForm({
  enrollmentId,
  goal,
  failure,
  cancelTo,
  busy,
}: {
  enrollmentId: string;
  goal: LearningGoal | null;
  failure: IntentFailure | undefined;
  cancelTo: string;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const state = useFormState('goal-save', failure);
  return (
    <FormShell
      intent="goal-save"
      title={goal ? t('classes.goalEdit') : t('classes.goalNew')}
      formError={state.formError}
      hidden={{ enrollmentId, ...(goal && { goalId: goal.id }) }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          name="periodType"
          label={t('classes.goalPeriod')}
          defaultValue={state.value('periodType', goal?.periodType ?? 'month')}
          error={state.error('periodType')}
        >
          {LearningGoalPeriod.options.map((p) => (
            <option key={p} value={p}>
              {t(`learningGoalPeriod.${p}`)}
            </option>
          ))}
        </SelectField>
        <DateField
          {...dateRange()}
          name="periodStart"
          label={t('classes.goalStart')}
          defaultValue={state.value('periodStart', isoToDisplay(goal?.periodStart ?? todayIso()))}
          error={state.error('periodStart')}
        />
        <DateField
          {...dateRange()}
          name="periodEnd"
          label={t('classes.goalEnd')}
          defaultValue={state.value('periodEnd', goal ? isoToDisplay(goal.periodEnd) : '')}
          error={state.error('periodEnd')}
        />
      </div>
      <TextAreaField
        name="description"
        label={t('classes.goalDescription')}
        rows={3}
        maxLength={1000}
        defaultValue={state.value('description', goal?.description ?? '')}
        error={state.error('description')}
        required
      />
      {goal && (
        <>
          <SelectField
            name="status"
            label={t('classes.goalStatus')}
            defaultValue={state.value('status', goal.status)}
            error={state.error('status')}
          >
            {LearningGoalStatus.options.map((s) => (
              <option key={s} value={s}>
                {t(`learningGoalStatus.${s}`)}
              </option>
            ))}
          </SelectField>
          <TextAreaField
            name="progressNote"
            label={t('classes.goalProgress')}
            rows={3}
            maxLength={2000}
            defaultValue={state.value('progressNote', goal.progressNote ?? '')}
            error={state.error('progressNote')}
          />
        </>
      )}
      <FormFooter cancelTo={cancelTo} submitLabel={t('classes.goalSave')} busy={busy} />
    </FormShell>
  );
}

// ---- Điểm và nhận xét (§9) -----------------------------------------------------------------------

export function AssessmentForm({
  enrollmentId,
  assessment,
  lessonOptions,
  defaultLessonId,
  failure,
  cancelTo,
  busy,
}: {
  enrollmentId: string;
  assessment: Assessment | null;
  /** Buổi đã dạy để gắn điểm (chỉ khi ghi mới). */
  lessonOptions: { id: string; label: string }[];
  defaultLessonId: string;
  failure: IntentFailure | undefined;
  cancelTo: string;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const state = useFormState('assessment-save', failure);
  return (
    <FormShell
      intent="assessment-save"
      title={assessment ? t('classes.assessmentEdit') : t('classes.assessmentNew')}
      lead={t('classes.assessmentLead')}
      formError={state.formError}
      hidden={{ enrollmentId, ...(assessment && { assessmentId: assessment.id }) }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="title"
          label={t('classes.assessmentTitle')}
          maxLength={LESSON_LIMITS.assessmentTitleLength}
          defaultValue={state.value('title', assessment?.title ?? '')}
          error={state.error('title')}
          required
        />
        <SelectField
          name="kind"
          label={t('classes.assessmentKind')}
          defaultValue={state.value('kind', assessment?.kind ?? 'lesson')}
          error={state.error('kind')}
        >
          {AssessmentKind.options.map((k) => (
            <option key={k} value={k}>
              {t(`assessmentKind.${k}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          name="score"
          label={t('classes.assessmentScore')}
          hint={t('classes.assessmentScoreHint')}
          inputMode="decimal"
          defaultValue={state.value('score', assessment?.score?.toString() ?? '')}
          error={state.error('score')}
        />
        <TextField
          name="maxScore"
          label={t('classes.assessmentMax')}
          inputMode="decimal"
          defaultValue={state.value('maxScore', assessment?.maxScore.toString() ?? '10')}
          error={state.error('maxScore')}
        />
        <DateField
          {...dateRange()}
          name="assessedOn"
          label={t('classes.assessmentDate')}
          defaultValue={state.value(
            'assessedOn',
            isoToDisplay(assessment?.assessedOn ?? todayIso()),
          )}
          error={state.error('assessedOn')}
        />
        {!assessment && lessonOptions.length > 0 && (
          <SelectField
            name="lessonId"
            label={t('classes.assessmentLesson')}
            defaultValue={state.value('lessonId', defaultLessonId)}
            error={state.error('lessonId')}
          >
            <option value="">{t('classes.assessmentNoLesson')}</option>
            {lessonOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      <TextAreaField
        name="comment"
        label={t('classes.assessmentComment')}
        hint={t('classes.assessmentCommentHint')}
        rows={4}
        maxLength={LESSON_LIMITS.commentLength}
        defaultValue={state.value('comment', assessment?.comment ?? '')}
        error={state.error('comment')}
        required
      />
      <FormFooter cancelTo={cancelTo} submitLabel={t('classes.assessmentSave')} busy={busy} />
    </FormShell>
  );
}
