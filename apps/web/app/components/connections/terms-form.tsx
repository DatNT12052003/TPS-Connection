// Form đề xuất điều kiện hợp tác (G5, C6, D18): học phí theo buổi kèm thời lượng, số buổi mỗi tuần, lịch dự kiến
// (thứ + giờ bắt đầu), ngày bắt đầu, khối, mục tiêu, hình thức, khu vực, ghi chú. Môn cố định theo yêu cầu (D21).
// Gửi intent `terms`; lịch đi trong ô ẩn `schedule` (JSON). Giá trị ban đầu: phiên bản mới nhất, hoặc nhu cầu.
import {
  CONNECTION_LIMITS,
  RequestPostGoal,
  TeachingMode,
  type TermsScheduleEntry,
} from '@tps/shared';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Form } from 'react-router';
import { LocationFields } from '~/components/forms/location-fields';
import { Button } from '~/components/ui/button';
import { DateField } from '~/components/ui/date-field';
import { SelectField, TextAreaField, TextField } from '~/components/ui/field';
import type { CatalogOption } from '~/lib/catalog';
import { todayIso } from '~/lib/dates';
import type { Message } from '~/lib/form';
import { useMessage } from '~/lib/use-message';

export const TERMS_FIELDS = [
  'gradeLevelId',
  'goal',
  'goalNote',
  'teachingMode',
  'provinceId',
  'communeId',
  'sessionPriceVnd',
  'sessionMinutes',
  'sessionsPerWeek',
  'schedule',
  'startDate',
  'note',
] as const;
export type TermsField = (typeof TERMS_FIELDS)[number];
export type TermsValues = Record<TermsField, string>;

/** Giờ bắt đầu chọn được: 06:00 đến 22:00, mỗi 30 phút. */
const START_TIMES = Array.from({ length: 33 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function ScheduleEditor({ initial, error }: { initial: string; error?: string | undefined }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<TermsScheduleEntry[]>(() => {
    try {
      return JSON.parse(initial || '[]') as TermsScheduleEntry[];
    } catch {
      return [];
    }
  });
  const update = (index: number, change: Partial<TermsScheduleEntry>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...change } : row)));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-label">{t('terms.schedule')}</legend>
      <input type="hidden" name="schedule" value={JSON.stringify(rows)} />
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2">
          <SelectField
            label={t('terms.weekday')}
            value={String(row.weekday)}
            onChange={(e) => update(index, { weekday: Number(e.target.value) })}
            className="min-w-36"
          >
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {t(`weekday.${d}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('terms.startTime')}
            value={row.startTime}
            onChange={(e) => update(index, { startTime: e.target.value })}
            className="min-w-28"
          >
            {START_TIMES.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </SelectField>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('terms.removeSlot')}
            onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ))}
      {rows.length < CONNECTION_LIMITS.scheduleEntries && (
        <div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setRows((current) => [...current, { weekday: 2, startTime: '18:00' }])}
          >
            <Plus aria-hidden="true" />
            {t('terms.addSlot')}
          </Button>
        </div>
      )}
      {error && (
        <span role="alert" className="text-small font-medium text-danger">
          {error}
        </span>
      )}
    </fieldset>
  );
}

export function TermsForm({
  values,
  fieldErrors = {},
  formError,
  grades,
  provinces,
  communes,
  submitting,
}: {
  values: TermsValues;
  fieldErrors?: Partial<Record<TermsField, Message>>;
  formError?: Message | undefined;
  grades: readonly CatalogOption[];
  provinces: readonly CatalogOption[];
  communes: readonly CatalogOption[];
  submitting: boolean;
}) {
  const { t } = useTranslation();
  const tr = useMessage();
  const err = (field: TermsField) => (fieldErrors[field] ? tr(fieldErrors[field]) : undefined);
  const [mode, setMode] = useState(values.teachingMode);

  return (
    <Form method="post" className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="intent" value="terms" />
      {formError && (
        <p role="alert" className="text-small font-medium text-danger">
          {tr(formError)}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="sessionPriceVnd"
          label={t('terms.sessionPrice')}
          hint={t('terms.sessionPriceHint')}
          inputMode="numeric"
          defaultValue={values.sessionPriceVnd}
          error={err('sessionPriceVnd')}
          required
        />
        <TextField
          name="sessionMinutes"
          label={t('terms.sessionMinutes')}
          inputMode="numeric"
          defaultValue={values.sessionMinutes}
          error={err('sessionMinutes')}
          required
        />
        <TextField
          name="sessionsPerWeek"
          label={t('terms.sessionsPerWeek')}
          inputMode="numeric"
          defaultValue={values.sessionsPerWeek}
          error={err('sessionsPerWeek')}
        />
        <DateField
          name="startDate"
          label={t('terms.startDate')}
          defaultValue={values.startDate}
          min={todayIso()}
          max={`${new Date().getFullYear() + 1}-12-31`}
          initialMonth={todayIso()}
          error={err('startDate')}
        />
      </div>
      <ScheduleEditor initial={values.schedule} error={err('schedule')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="gradeLevelId"
          label={t('terms.grade')}
          defaultValue={values.gradeLevelId}
          error={err('gradeLevelId')}
        >
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="goal"
          label={t('terms.goal')}
          defaultValue={values.goal}
          error={err('goal')}
        >
          {RequestPostGoal.options.map((g) => (
            <option key={g} value={g}>
              {t(`requestPostGoal.${g}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="teachingMode"
          label={t('terms.mode')}
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          error={err('teachingMode')}
        >
          {TeachingMode.options.map((m) => (
            <option key={m} value={m}>
              {t(`teachingMode.${m}`)}
            </option>
          ))}
        </SelectField>
      </div>
      {mode !== 'online' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <LocationFields
            provinces={provinces}
            communes={communes}
            provinceId={values.provinceId}
            communeId={values.communeId}
            provinceError={err('provinceId')}
            communeError={err('communeId')}
          />
        </div>
      )}
      <TextField
        name="goalNote"
        label={t('terms.goalNote')}
        defaultValue={values.goalNote}
        maxLength={CONNECTION_LIMITS.goalNoteLength}
        error={err('goalNote')}
      />
      <TextAreaField
        name="note"
        label={t('terms.note')}
        hint={t('terms.noteHint')}
        defaultValue={values.note}
        maxLength={CONNECTION_LIMITS.termsNoteLength}
        rows={3}
        error={err('note')}
      />
      <div>
        <Button type="submit" disabled={submitting}>
          {t('terms.propose')}
        </Button>
      </div>
    </Form>
  );
}
