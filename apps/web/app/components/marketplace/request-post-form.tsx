// Form bài tìm gia sư của phụ huynh (canvas NeedPost, NeedPostMobile), cho tạo mới và sửa. Một bài cho một con và
// một môn (D25); con không đổi được sau khi tạo. Chỉ tỉnh/xã, không địa chỉ (§16.7). Cột phải: ai thấy bài này và
// các nút (bài nháp: Đăng bài, Lưu nháp; bài đã đăng: Lưu thay đổi).
import {
  BudgetUnit,
  type Learner,
  POST_LIMITS,
  RequestPostGoal,
  type RequestPostStatus,
  TeachingMode,
} from '@tps/shared';
import { EyeOff, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Link, useNavigation } from 'react-router';
import { LocationFields } from '~/components/forms/location-fields';
import { AvailabilityEditor } from '~/components/tutor/availability-editor';
import { pillClassName } from '~/components/tutor/teaching-subjects-editor';
import { Alert } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { DateField } from '~/components/ui/date-field';
import { SelectField, TextAreaField, TextField } from '~/components/ui/field';
import type { CatalogOption } from '~/lib/catalog';
import { todayIso } from '~/lib/dates';
import type { Message } from '~/lib/form';
import { learnerName } from '~/lib/learners';
import { PATHS } from '~/lib/navigation';
import type { RequestPostField, RequestPostValues } from '~/lib/posts-form';
import { parseAvailability } from '~/lib/tutor-profile';
import { useMessage } from '~/lib/use-message';
import { cn } from '~/lib/utils';

export interface RequestPostFormProps {
  values: RequestPostValues;
  errors: Partial<Record<RequestPostField, Message>>;
  formError?: Message | undefined;
  status: RequestPostStatus | null;
  /** Con của phụ huynh; khi sửa thì chỉ hiện con của bài (không đổi được). */
  learners: readonly Learner[];
  subjects: readonly CatalogOption[];
  grades: readonly CatalogOption[];
  provinces: readonly CatalogOption[];
  /** Xã của tỉnh đang chọn. */
  communes: readonly CatalogOption[];
}

const radioPill = cn(
  pillClassName,
  'min-h-control-md px-4 text-body',
  'has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground',
  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
);

export function RequestPostForm({
  values,
  errors,
  formError,
  status,
  learners,
  subjects,
  grades,
  provinces,
  communes,
}: RequestPostFormProps) {
  const { t } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const pendingIntent = submitting ? navigation.formData?.get('intent') : undefined;
  const [mode, setMode] = useState(values.teachingMode);
  const creating = status === null;
  const draft = creating || status === 'draft';

  return (
    <Form
      key={JSON.stringify(values)}
      method="post"
      noValidate
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="flex min-w-0 flex-col gap-6">
        {formError && (
          <Alert variant="danger" role="alert">
            {tr(formError)}
          </Alert>
        )}
        <Card className="gap-5 sm:p-6">
          <h2 className="text-h3">{t('requestEditor.childTitle')}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {creating ? (
              <SelectField
                name="learnerId"
                label={t('requestEditor.child')}
                defaultValue={values.learnerId}
                error={tr(errors.learnerId)}
              >
                <option value="">{t('location.choose')}</option>
                {learners.map((l) => (
                  <option key={l.id} value={l.id}>
                    {learnerName(l)}
                  </option>
                ))}
              </SelectField>
            ) : (
              <TextField
                label={t('requestEditor.child')}
                value={learners.map(learnerName).join(', ')}
                readOnly
                disabled
              />
            )}
            <SelectField
              name="subjectId"
              label={t('marketplace.subject')}
              defaultValue={values.subjectId}
              error={tr(errors.subjectId)}
            >
              <option value="">{t('location.choose')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </SelectField>
            <SelectField
              name="gradeLevelId"
              label={t('marketplace.grade')}
              defaultValue={values.gradeLevelId}
              error={tr(errors.gradeLevelId)}
            >
              <option value="">{t('location.choose')}</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </SelectField>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-label">{t('requestEditor.goal')}</legend>
            <div className="flex flex-wrap gap-2">
              {RequestPostGoal.options.map((g) => (
                <label key={g} className={radioPill}>
                  <input
                    type="radio"
                    name="goal"
                    value={g}
                    className="sr-only"
                    defaultChecked={values.goal === g}
                  />
                  {t(`requestPostGoal.${g}`)}
                </label>
              ))}
            </div>
            {errors.goal && (
              <span className="text-small font-medium text-danger">{tr(errors.goal)}</span>
            )}
          </fieldset>
          <TextField
            name="goalNote"
            maxLength={POST_LIMITS.goalNoteLength}
            label={t('requestEditor.goalNote')}
            placeholder={t('requestEditor.goalNotePlaceholder')}
            defaultValue={values.goalNote}
            error={tr(errors.goalNote)}
          />
          <TextAreaField
            name="description"
            maxLength={POST_LIMITS.requestDescriptionLength}
            label={t('requestEditor.description')}
            hint={t('requestEditor.noIdentityHint')}
            defaultValue={values.description}
            error={tr(errors.description)}
          />
        </Card>

        <Card className="gap-5 sm:p-6">
          <h2 className="text-h3">{t('requestEditor.modeTitle')}</h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-label">{t('marketplace.mode')}</legend>
            <div className="flex flex-wrap gap-2">
              {TeachingMode.options.map((m) => (
                <label key={m} className={radioPill}>
                  <input
                    type="radio"
                    name="teachingMode"
                    value={m}
                    className="sr-only"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  {t(`teachingMode.${m}`)}
                </label>
              ))}
            </div>
            {errors.teachingMode && (
              <span className="text-small font-medium text-danger">{tr(errors.teachingMode)}</span>
            )}
          </fieldset>
          <div className="grid gap-4 md:grid-cols-2">
            <LocationFields
              provinces={provinces}
              communes={communes}
              provinceId={values.provinceId}
              communeId={values.communeId}
              provinceError={tr(errors.provinceId)}
              communeError={tr(errors.communeId)}
              hint={
                mode === 'online' ? t('requestEditor.areaOptional') : t('requestEditor.areaHint')
              }
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              name="budgetMin"
              inputMode="numeric"
              label={t('requestEditor.budgetMin')}
              placeholder="150.000"
              defaultValue={values.budgetMin}
              error={tr(errors.budgetMin)}
            />
            <TextField
              name="budgetMax"
              inputMode="numeric"
              label={t('requestEditor.budgetMax')}
              placeholder="200.000"
              defaultValue={values.budgetMax}
              error={tr(errors.budgetMax)}
            />
            <SelectField
              name="budgetUnit"
              label={t('requestEditor.budgetUnit')}
              defaultValue={values.budgetUnit}
              error={tr(errors.budgetUnit)}
            >
              {BudgetUnit.options.map((u) => (
                <option key={u} value={u}>
                  {t(`budgetUnit.${u}`)}
                </option>
              ))}
            </SelectField>
          </div>
          <DateField
            name="desiredStartDate"
            min={todayIso()}
            max={`${new Date().getFullYear() + 2}-12-31`}
            label={t('requestEditor.startDate')}
            defaultValue={values.desiredStartDate}
            error={tr(errors.desiredStartDate)}
            className="md:max-w-xs"
          />
          <div className="flex flex-col gap-2">
            <span className="text-label">{t('requestEditor.schedule')}</span>
            <AvailabilityEditor
              name="slots"
              initial={parseAvailability(values.slots)}
              error={tr(errors.slots)}
            />
          </div>
        </Card>

        <Card className="gap-4 sm:p-6">
          <h2 className="text-h3">{t('requestEditor.requirementsTitle')}</h2>
          <TextAreaField
            name="tutorRequirements"
            rows={3}
            maxLength={POST_LIMITS.tutorRequirementsLength}
            label={t('requestEditor.requirements')}
            placeholder={t('requestEditor.requirementsPlaceholder')}
            defaultValue={values.tutorRequirements}
            error={tr(errors.tutorRequirements)}
          />
        </Card>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
        <Card className="gap-3">
          <h2 className="text-h3">{t('requestEditor.whoSees')}</h2>
          <p className="flex items-start gap-2 text-small">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            {t('requestEditor.whoSeesTutors')}
          </p>
          <p className="flex items-start gap-2 text-small">
            <EyeOff aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            {t('requestEditor.whoSeesNoIdentity')}
          </p>
        </Card>
        {draft ? (
          <>
            <Button
              type="submit"
              name="intent"
              value="publish"
              size="lg"
              block
              disabled={submitting}
              aria-busy={pendingIntent === 'publish' || undefined}
            >
              {t('postEditor.publish')}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="save"
              variant="secondary"
              block
              disabled={submitting}
              aria-busy={pendingIntent === 'save' || undefined}
            >
              {t('postEditor.saveDraft')}
            </Button>
          </>
        ) : (
          <Button
            type="submit"
            name="intent"
            value="save"
            size="lg"
            block
            disabled={submitting}
            aria-busy={submitting || undefined}
          >
            {t('postEditor.saveChanges')}
          </Button>
        )}
        <Link
          to={PATHS.myRequests}
          className="self-center text-small font-semibold text-primary hover:text-primary-hover"
        >
          {t('common.cancel')}
        </Link>
      </aside>
    </Form>
  );
}
