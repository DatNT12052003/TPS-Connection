// Form soạn bài tuyển học sinh (canvas PostEditor, PostEditorMobile), dùng cho tạo mới và sửa. Nội dung; hình thức,
// khu vực, lịch; học phí. Cột phải: điều kiện trước khi đăng và các nút. Bài nháp có hai nút: Đăng bài (lưu rồi
// đăng) và Lưu nháp; bài đã đăng chỉ có Lưu thay đổi (bài đã đăng phải giữ đủ điều kiện đăng, API kiểm tra).
import { POST_LIMITS, RateUnit, TeachingMode, type TutorPostStatus } from '@tps/shared';
import { Check, CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Link, useNavigation } from 'react-router';
import { AvailabilityEditor } from '~/components/tutor/availability-editor';
import { ServiceAreasEditor } from '~/components/tutor/service-areas-editor';
import { pillClassName, TeachingSubjectsEditor } from '~/components/tutor/teaching-subjects-editor';
import { Alert } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { DateField } from '~/components/ui/date-field';
import { SelectField, TextAreaField, TextField } from '~/components/ui/field';
import type { AreaRef, CatalogOption } from '~/lib/catalog';
import { todayIso } from '~/lib/dates';
import type { Message } from '~/lib/form';
import { PATHS } from '~/lib/navigation';
import type { TutorPostField, TutorPostValues } from '~/lib/posts-form';
import { parseAvailability, parseTeachingSubjects } from '~/lib/tutor-profile';
import { useMessage } from '~/lib/use-message';
import { cn } from '~/lib/utils';

export interface TutorPostFormProps {
  values: TutorPostValues;
  errors: Partial<Record<TutorPostField, Message>>;
  formError?: Message | undefined;
  /** Trạng thái bài; null khi tạo mới. */
  status: TutorPostStatus | null;
  /** Gia sư đã được duyệt danh tính (D5): chưa thì chỉ lưu nháp được. */
  verified: boolean;
  subjects: readonly CatalogOption[];
  grades: readonly CatalogOption[];
  provinces: readonly CatalogOption[];
  /** Khu vực đã chọn (kèm tên). */
  areas: readonly AreaRef[];
}

/** Ngày bắt đầu nhận chọn được: từ hôm nay tới 2 năm sau. */
const maxStartIso = () => `${new Date().getFullYear() + 2}-12-31`;

export function TutorPostForm({
  values,
  errors,
  formError,
  status,
  verified,
  subjects,
  grades,
  provinces,
  areas,
}: TutorPostFormProps) {
  const { t } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const pendingIntent = submitting ? navigation.formData?.get('intent') : undefined;
  const [mode, setMode] = useState(values.teachingMode);
  const draft = status === null || status === 'draft';

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
          <h2 className="text-h3">{t('postEditor.contentTitle')}</h2>
          <TextField
            name="title"
            maxLength={POST_LIMITS.titleLength}
            label={t('postEditor.titleLabel')}
            hint={t('postEditor.titleHint')}
            defaultValue={values.title}
            error={tr(errors.title)}
          />
          <TextAreaField
            name="description"
            rows={6}
            maxLength={POST_LIMITS.descriptionLength}
            label={t('postEditor.description')}
            hint={t('tutorProfile.noContactHint')}
            defaultValue={values.description}
            error={tr(errors.description)}
          />
          <div className="flex flex-col gap-2">
            <span className="text-label">{t('marketplace.subjectsGrades')}</span>
            <TeachingSubjectsEditor
              name="subjects"
              subjects={subjects}
              grades={grades}
              initial={parseTeachingSubjects(values.subjects)}
              error={tr(errors.subjects)}
            />
          </div>
        </Card>

        <Card className="gap-5 sm:p-6">
          <h2 className="text-h3">{t('postEditor.modeTitle')}</h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-label">{t('marketplace.mode')}</legend>
            <div className="flex flex-wrap gap-2">
              {TeachingMode.options.map((m) => (
                <label
                  key={m}
                  className={cn(
                    pillClassName,
                    'min-h-control-md px-4 text-body',
                    'has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground',
                    'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
                  )}
                >
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
          {mode && mode !== 'online' ? (
            <ServiceAreasEditor
              name="areaIds"
              max={POST_LIMITS.areas}
              provinces={provinces}
              initial={areas}
              error={tr(errors.areaIds)}
            />
          ) : (
            <p className="text-small text-muted-foreground">{t('tutorProfile.areasOnlineNote')}</p>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-label">{t('postEditor.schedule')}</span>
            <AvailabilityEditor
              name="slots"
              initial={parseAvailability(values.slots)}
              error={tr(errors.slots)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              name="availableFrom"
              min={todayIso()}
              max={maxStartIso()}
              label={t('postEditor.availableFrom')}
              hint={t('postEditor.availableFromHint')}
              defaultValue={values.availableFrom}
              error={tr(errors.availableFrom)}
            />
            <TextField
              name="capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={POST_LIMITS.maxCapacity}
              label={t('postEditor.capacity')}
              defaultValue={values.capacity}
              error={tr(errors.capacity)}
            />
          </div>
        </Card>

        <Card className="gap-4 sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3">{t('postEditor.rateTitle')}</h2>
            <p className="text-small text-muted-foreground">{t('postEditor.rateIntro')}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="rateAmount"
              inputMode="numeric"
              label={t('tutorProfile.rateAmount')}
              placeholder={t('tutorProfile.rateAmountPlaceholder')}
              defaultValue={values.rateAmount}
              error={tr(errors.rateAmount)}
            />
            <SelectField
              name="rateUnit"
              label={t('tutorProfile.rateUnit')}
              defaultValue={values.rateUnit}
              error={tr(errors.rateUnit)}
            >
              {RateUnit.options.map((unit) => (
                <option key={unit} value={unit}>
                  {t(`rateUnit.${unit}`)}
                </option>
              ))}
            </SelectField>
          </div>
        </Card>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
        <Card className="gap-3">
          <h2 className="text-h3">{t('postEditor.checklistTitle')}</h2>
          <ul className="flex flex-col gap-2 text-small">
            <li className="flex items-start gap-2">
              {verified ? (
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              )}
              {verified ? t('postEditor.checkVerified') : t('postEditor.checkNotVerified')}
            </li>
            <li className="flex items-start gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {t('postEditor.checkComplete')}
            </li>
          </ul>
          {!verified && (
            <Link
              to={PATHS.tutorProfile}
              className="text-small font-semibold text-primary hover:text-primary-hover"
            >
              {t('postEditor.goVerify')}
            </Link>
          )}
        </Card>
        {draft ? (
          <>
            <Button
              type="submit"
              name="intent"
              value="publish"
              size="lg"
              block
              disabled={submitting || !verified}
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
          to={PATHS.myPosts}
          className="self-center text-small font-semibold text-primary hover:text-primary-hover"
        >
          {t('common.cancel')}
        </Link>
      </aside>
    </Form>
  );
}
