// /app/profile/edit: gia sư sửa hồ sơ (canvas TutorProfileEdit). Một nút Lưu cho cả trang:
//   - họ tên thật lưu qua PATCH /me (khóa khi đã xác minh danh tính, D34);
//   - phần còn lại thay toàn bộ hồ sơ bằng PUT /me/tutor-profile (sửa không đổi trạng thái hồ sơ, B.4.1).
// Các ô bắt buộc trước khi nộp xác minh (D34: họ tên, môn – khối, hình thức dạy, học phí) có nhãn "Cần để
// xác minh" khi còn thiếu. Lưu xong quay về /app/profile.
import {
  AccountProfile,
  OwnTutorProfile,
  RateUnit,
  TeachingMode,
  TutorOccupation,
} from '@tps/shared';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { AvatarField } from '~/components/account/avatar-field';
import { PageContainer } from '~/components/layout/page';
import { ServiceAreasEditor } from '~/components/tutor/service-areas-editor';
import { pillClassName, TeachingSubjectsEditor } from '~/components/tutor/teaching-subjects-editor';
import { AvailabilityEditor } from '~/components/tutor/availability-editor';
import { TutorProfilePreview } from '~/components/tutor/tutor-profile-preview';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { CheckboxField, SelectField, TextAreaField, TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import type { AreaRef } from '~/lib/catalog';
import { loadAreaRefs, loadGradeLevels, loadProvinces, loadSubjects } from '~/lib/catalog.server';
import { formErrorFrom, type Message } from '~/lib/form';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import {
  parseAvailability,
  parseServiceAreaIds,
  parseTeachingSubjects,
  tutorBody,
  tutorFieldErrors,
  type TutorFormField,
  tutorFormValues,
  type TutorFormValues,
  tutorValuesFrom,
} from '~/lib/tutor-profile';
import { useMessage } from '~/lib/use-message';
import { cn } from '~/lib/utils';
import type { Route } from './+types/edit';

interface ActionFailure {
  ok: false;
  fieldErrors: Partial<Record<TutorFormField, Message>>;
  formError?: Message;
  values: TutorFormValues;
  /** Khu vực đã chọn (kèm tên) để dựng lại ô khu vực. */
  areas: AreaRef[];
}

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.tutorProfile.editTitle} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  const api = getServerApi(context);
  const { locale } = await readPreferences(request);
  const [profile, account, subjects, grades, provinces] = await Promise.all([
    api.call('/api/v1/me/tutor-profile', { schema: OwnTutorProfile }),
    api.call('/api/v1/me', { schema: AccountProfile }),
    loadSubjects(context, locale),
    loadGradeLevels(context, locale),
    loadProvinces(context, locale),
  ]);
  const areas = await loadAreaRefs(context, locale, profile.serviceAreaIds);
  return { profile, account, subjects, grades, provinces, areas, locale };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  const form = await request.formData();
  const values = tutorValuesFrom(form);
  const api = getServerApi(context);

  const fail = async (error: unknown) => {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    const { locale } = await readPreferences(request);
    const areas = await loadAreaRefs(
      context,
      locale,
      parseServiceAreaIds(values.serviceAreaIds).filter((id) => Number.isInteger(id) && id > 0),
    ).catch(() => []);
    return data<ActionFailure>({
      ok: false,
      fieldErrors: tutorFieldErrors(error),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      values,
      areas,
    });
  };

  // Họ tên trước: ô bị khóa (đã xác minh) không có trong form; để trống thì giữ nguyên.
  if (form.has('fullName') && values.fullName.trim()) {
    try {
      await api.call('/api/v1/me', {
        method: 'PATCH',
        body: { fullName: values.fullName },
        schema: AccountProfile,
      });
    } catch (error) {
      return fail(error);
    }
  }
  try {
    await api.call('/api/v1/me/tutor-profile', {
      method: 'PUT',
      body: tutorBody(values),
      schema: OwnTutorProfile,
    });
  } catch (error) {
    return fail(error);
  }
  return redirect(`${PATHS.tutorProfile}?saved=1`);
}

const OCCUPATIONS = TutorOccupation.options;
const MODES = TeachingMode.options;

export default function TutorProfileEditPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const { profile, account, subjects, grades, provinces } = loaderData;
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const values = failure?.values ?? tutorFormValues(profile, account.fullName, i18n.language);
  const errors = failure?.fieldErrors ?? {};
  const areas = failure?.areas ?? loaderData.areas;
  const [mode, setMode] = useState(values.teachingMode);
  const missing = new Set(profile.missingForVerification);
  const required = (field: (typeof profile.missingForVerification)[number]) =>
    missing.has(field) ? (
      <Badge variant="warning">{t('tutorProfile.neededForVerification')}</Badge>
    ) : null;
  const withBadge = (label: string, badge: ReactNode) =>
    badge ? (
      <span className="inline-flex flex-wrap items-center gap-2">
        {label}
        {badge}
      </span>
    ) : (
      label
    );

  return (
    <PageContainer>
      <div className="flex flex-col gap-1.5">
        <nav aria-label={t('layout.breadcrumb')} className="text-small text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link to={PATHS.tutorProfile} className="font-semibold text-primary hover:underline">
                {t('tutorProfile.title')}
              </Link>
            </li>
            <li aria-hidden="true">›</li>
            <li aria-current="page">{t('tutorProfile.editShort')}</li>
          </ol>
        </nav>
        <h1 className="text-h1">{t('tutorProfile.editTitle')}</h1>
      </div>

      {failure && (
        <Alert variant="danger" role="alert">
          {tr(failure.formError ?? { key: 'errors.validation_failed' })}
        </Alert>
      )}

      {/* Dựng lại form sau mỗi lần lưu lỗi để các ô danh sách nhận giá trị vừa gửi. */}
      <Form
        key={failure ? JSON.stringify(failure.values) : profile.updatedAt}
        method="post"
        noValidate
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="gap-5 sm:p-6">
            <h2 className="text-h3">{t('tutorProfile.introTitle')}</h2>
            <AvatarField
              avatarUrl={account.avatarUrl}
              displayName={account.displayName}
              canRemove={false}
            />
            <div className="grid gap-4 md:grid-cols-2">
              {account.fullNameLocked ? (
                <TextField
                  label={t('account.fullName')}
                  hint={t('account.fullNameLocked')}
                  value={account.fullName ?? ''}
                  readOnly
                  disabled
                />
              ) : (
                <TextField
                  name="fullName"
                  maxLength={100}
                  autoComplete="name"
                  label={withBadge(t('tutorProfile.fullName'), required('fullName'))}
                  hint={t('tutorProfile.fullNameHint')}
                  defaultValue={values.fullName}
                  error={tr(errors.fullName)}
                />
              )}
              <TextField
                name="headline"
                maxLength={120}
                label={t('tutorProfile.headline')}
                placeholder={t('tutorProfile.headlinePlaceholder')}
                defaultValue={values.headline}
                error={tr(errors.headline)}
              />
              <SelectField
                name="occupation"
                label={t('tutorProfile.occupation')}
                defaultValue={values.occupation}
                error={tr(errors.occupation)}
              >
                <option value="">{t('location.choose')}</option>
                {OCCUPATIONS.map((o) => (
                  <option key={o} value={o}>
                    {t(`tutorOccupation.${o}`)}
                  </option>
                ))}
              </SelectField>
              <TextField
                name="experienceYears"
                type="number"
                inputMode="numeric"
                min={0}
                max={80}
                label={t('tutorProfile.experienceYears')}
                defaultValue={values.experienceYears}
                error={tr(errors.experienceYears)}
              />
              <TextField
                name="institution"
                maxLength={200}
                label={t('tutorProfile.institution')}
                placeholder={t('tutorProfile.institutionPlaceholder')}
                defaultValue={values.institution}
                error={tr(errors.institution)}
              />
              <TextField
                name="major"
                maxLength={200}
                label={t('tutorProfile.major')}
                defaultValue={values.major}
                error={tr(errors.major)}
              />
              <TextField
                name="highestEducation"
                maxLength={200}
                className="md:col-span-2"
                label={t('tutorProfile.highestEducation')}
                placeholder={t('tutorProfile.highestEducationPlaceholder')}
                defaultValue={values.highestEducation}
                error={tr(errors.highestEducation)}
              />
            </div>
            <TextAreaField
              name="bio"
              rows={6}
              maxLength={3000}
              label={withBadge(
                t('tutorProfile.bio'),
                <Badge variant="self">{t('account.selfDeclared')}</Badge>,
              )}
              hint={t('tutorProfile.noContactHint')}
              defaultValue={values.bio}
              error={tr(errors.bio)}
            />
            <TextAreaField
              name="teachingMethod"
              maxLength={3000}
              label={t('tutorProfile.teachingMethod')}
              defaultValue={values.teachingMethod}
              error={tr(errors.teachingMethod)}
            />
            <TextAreaField
              name="achievements"
              maxLength={3000}
              label={t('tutorProfile.achievements')}
              defaultValue={values.achievements}
              error={tr(errors.achievements)}
            />
            <TextField
              name="introVideoUrl"
              type="url"
              inputMode="url"
              maxLength={500}
              label={t('tutorProfile.introVideo')}
              placeholder="https://youtu.be/…"
              hint={t('tutorProfile.introVideoHint')}
              defaultValue={values.introVideoUrl}
              error={tr(errors.introVideoUrl)}
            />
          </Card>

          <Card className="gap-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-h3">{t('tutorProfile.subjectsTitle')}</h2>
              {required('teachingSubjects')}
            </div>
            <TeachingSubjectsEditor
              subjects={subjects}
              grades={grades}
              initial={parseTeachingSubjects(values.teachingSubjects)}
              error={tr(errors.teachingSubjects)}
            />
          </Card>

          <Card className="gap-4 sm:p-6">
            <h2 className="text-h3">{t('tutorProfile.modeTitle')}</h2>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 flex flex-wrap items-center gap-2 text-label">
                {t('tutorProfile.mode')}
                {required('teachingMode')}
              </legend>
              <div className="flex flex-wrap gap-2">
                {MODES.map((m) => (
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
                <span className="text-small font-medium text-danger">
                  {tr(errors.teachingMode)}
                </span>
              )}
            </fieldset>
            {mode && mode !== 'online' ? (
              <ServiceAreasEditor
                provinces={provinces}
                initial={areas}
                error={tr(errors.serviceAreaIds)}
              />
            ) : (
              <p className="text-small text-muted-foreground">
                {t('tutorProfile.areasOnlineNote')}
              </p>
            )}
          </Card>

          <Card className="gap-3 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3">{t('tutorProfile.availabilityTitle')}</h2>
              <p className="text-small text-muted-foreground">
                {t('tutorProfile.availabilityIntro')}
              </p>
            </div>
            <AvailabilityEditor
              initial={parseAvailability(values.availability)}
              error={tr(errors.availability)}
            />
          </Card>

          <Card className="gap-4 sm:p-6">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-h3">{t('tutorProfile.rateTitle')}</h2>
                {required('rate')}
              </div>
              <p className="text-small text-muted-foreground">{t('tutorProfile.rateIntro')}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="rateAmount"
                inputMode="numeric"
                label={t('tutorProfile.rateAmount')}
                placeholder={t('tutorProfile.rateAmountPlaceholder')}
                hint={t('tutorProfile.rateAmountHint')}
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
          <TutorProfilePreview
            profile={profile}
            displayName={account.displayName}
            avatarUrl={account.avatarUrl}
            subjects={subjects}
            grades={grades}
          />
          <Card className="gap-2 p-4">
            <CheckboxField
              name="acceptingStudents"
              defaultChecked={values.acceptingStudents === 'on'}
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{t('tutorProfile.accepting')}</span>
                <span className="text-muted-foreground">{t('tutorProfile.acceptingHint')}</span>
              </span>
            </CheckboxField>
          </Card>
          <Button type="submit" size="lg" block disabled={submitting} aria-busy={submitting}>
            {t('tutorProfile.save')}
          </Button>
          <Link
            to={PATHS.tutorProfile}
            className="self-center text-small font-semibold text-primary hover:text-primary-hover"
          >
            {t('common.cancel')}
          </Link>
        </aside>
      </Form>
    </PageContainer>
  );
}
