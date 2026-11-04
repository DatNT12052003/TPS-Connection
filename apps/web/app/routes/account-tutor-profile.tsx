import { Form, Link } from 'react-router';
import type { Route } from './+types/account-tutor-profile';
import {
  AuthPage,
  CsrfField,
  FieldError,
  FormAlert,
  Notice,
  privatePageMeta,
  SubmitButton,
  TextField,
} from '~/components/auth-ui';
import { RegionPicker } from '~/components/region-picker';
import { formApi, publicApi, userApi } from '~/lib/api.server';
import { fetchCommunes, type CatalogName } from '~/lib/catalog.server';
import { toFormResult, type FormResult } from '~/lib/form-errors';
import { localeOf, translate, type Locale, type MessageKey } from '~/lib/i18n';
import { csrfTokenOf, redirectToRefresh, requireAccount } from '~/lib/session.server';
import { parseTutorForm, WEEKDAYS } from '~/lib/tutor-form';

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'tutor.title');

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': 'private, no-store' });

export async function loader({ request }: Route.LoaderArgs) {
  const own = await userApi(request).GET('/api/v1/me/tutor-profile');
  if (own.response.status === 401) throw redirectToRefresh(request);
  if (own.response.status === 403) {
    return {
      refused: own.error?.code === 'EMAIL_NOT_VERIFIED' ? ('email' as const) : ('role' as const),
    };
  }
  if (!own.data) throw new Response('Unavailable', { status: 503 });

  const [subjects, grades, provinces] = await Promise.all([
    publicApi().GET('/api/v1/catalog/subjects'),
    publicApi().GET('/api/v1/catalog/grades'),
    publicApi().GET('/api/v1/catalog/regions', { params: { query: { limit: 50 } } }),
  ]);
  if (!subjects.data || !grades.data || !provinces.data) {
    throw new Response('Unavailable', { status: 503 });
  }

  const heldIds = new Set(own.data.profile?.regionIds ?? []);
  const initialCommunes: Record<string, CatalogName[]> = {};
  await Promise.all(
    provinces.data.data
      .filter((province) => heldIds.has(province.id))
      .map(async (province) => {
        initialCommunes[province.id] = await fetchCommunes(province.id);
      }),
  );

  return {
    refused: null,
    accountId: (await requireAccount(request)).id,
    csrf: csrfTokenOf(request),
    status: own.data.verificationStatus,
    profile: own.data.profile,
    subjects: subjects.data.data,
    grades: grades.data.data,
    provinces: provinces.data.data,
    initialCommunes,
  };
}

export async function action({ request }: Route.ActionArgs): Promise<FormResult | { ok: true }> {
  const form = await request.formData();
  const { error, response } = await formApi(request, form).PUT('/api/v1/me/tutor-profile', {
    body: parseTutorForm(form),
  });
  if (response.status === 401) throw redirectToRefresh(request);
  if (response.ok) return { ok: true };
  return toFormResult(error);
}

function CatalogChoices({
  locale,
  name,
  legend,
  items,
  selectedIds,
  error,
}: {
  locale: Locale;
  name: string;
  legend: MessageKey;
  items: CatalogName[];
  selectedIds: string[];
  error?: MessageKey;
}) {
  const listed = new Set(items.map((item) => item.id));
  return (
    <fieldset className="mt-4">
      <legend className="font-medium">{translate(locale, legend)}</legend>
      {/* Entries switched off since they were chosen stay on the profile (AC-MOD-05.2). */}
      {selectedIds
        .filter((id) => !listed.has(id))
        .map((id) => (
          <input key={id} type="hidden" name={name} value={id} />
        ))}
      <div className="mt-1 grid grid-cols-2 gap-1">
        {items.map((item) => (
          <label key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              name={name}
              value={item.id}
              defaultChecked={selectedIds.includes(item.id)}
            />
            {locale === 'vi' ? item.nameVi : item.nameEn}
          </label>
        ))}
      </div>
      <FieldError id={`${name}-error`} locale={locale} message={error} />
    </fieldset>
  );
}

function LongText({
  locale,
  name,
  label,
  hint,
  defaultValue,
  required = false,
  error,
}: {
  locale: Locale;
  name: string;
  label: MessageKey;
  hint?: MessageKey;
  defaultValue?: string | null;
  required?: boolean;
  error?: MessageKey;
}) {
  return (
    <div className="mt-4">
      <label className="block font-medium" htmlFor={name}>
        {translate(locale, label)}
      </label>
      {hint && <p className="text-sm text-slate-600">{translate(locale, hint)}</p>}
      <textarea
        id={name}
        name={name}
        rows={4}
        required={required}
        defaultValue={defaultValue ?? ''}
        aria-invalid={error ? true : undefined}
        className="mt-1 w-full rounded border border-slate-400 p-2"
      />
      <FieldError id={`${name}-error`} locale={locale} message={error} />
    </div>
  );
}

const STATUS_MESSAGE: Record<string, MessageKey> = {
  incomplete: 'tutor.statusIncomplete',
  pending_review: 'tutor.statusPending',
  verified: 'tutor.statusVerified',
  rejected: 'tutor.statusRejected',
  revoked: 'tutor.statusRevoked',
};

const WEEKDAY_LABEL: Record<number, MessageKey> = {
  0: 'tutor.day0',
  1: 'tutor.day1',
  2: 'tutor.day2',
  3: 'tutor.day3',
  4: 'tutor.day4',
  5: 'tutor.day5',
  6: 'tutor.day6',
};

export default function TutorProfile({ params, loaderData, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  const back = (
    <p className="mt-2">
      <Link className="underline" to={`/${locale}/account`}>
        {translate(locale, 'nav.back')}
      </Link>
    </p>
  );
  if (loaderData.refused) {
    return (
      <AuthPage locale={locale} title="tutor.title">
        {back}
        <p role="alert" className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">
          {translate(
            locale,
            loaderData.refused === 'email' ? 'tutor.verifyFirst' : 'tutor.tutorsOnly',
          )}
        </p>
      </AuthPage>
    );
  }
  const { csrf, status, profile, subjects, grades, provinces, initialCommunes } = loaderData;
  const result =
    actionData && !('ok' in actionData && actionData.ok) ? (actionData as FormResult) : undefined;
  const errors = result?.fieldErrors ?? {};
  const slotOf = (weekday: number) =>
    profile?.availability.find((slot) => slot.weekday === weekday);
  const modes = profile?.teachingModes ?? [];

  return (
    <AuthPage locale={locale} title="tutor.title">
      {back}
      <p className="mt-4 rounded border border-slate-300 bg-slate-50 p-3">
        {translate(locale, STATUS_MESSAGE[status] as MessageKey)}
      </p>
      {actionData && 'ok' in actionData && actionData.ok && (
        <Notice>{translate(locale, 'form.saved')}</Notice>
      )}
      <FormAlert locale={locale} result={result} />
      <Form method="post">
        <CsrfField token={csrf as string} />
        <h2 className="mt-6 text-xl font-medium">{translate(locale, 'tutor.privateHeading')}</h2>
        <p className="text-sm text-slate-600">{translate(locale, 'tutor.privateHint')}</p>
        <TextField
          locale={locale}
          name="legalName"
          label="tutor.legalName"
          autoComplete="name"
          defaultValue={profile?.legalName}
          result={result}
        />
        <div className="mt-4">
          <label className="block font-medium" htmlFor="tutorType">
            {translate(locale, 'tutor.type')}
          </label>
          <select
            id="tutorType"
            name="tutorType"
            required
            defaultValue={profile?.tutorType ?? ''}
            className="mt-1 w-full rounded border border-slate-400 p-2"
          >
            <option value="" disabled>
              {translate(locale, 'tutor.typeChoose')}
            </option>
            <option value="student">{translate(locale, 'tutor.typeStudent')}</option>
            <option value="teacher">{translate(locale, 'tutor.typeTeacher')}</option>
            <option value="freelance">{translate(locale, 'tutor.typeFreelance')}</option>
          </select>
          <FieldError id="tutorType-error" locale={locale} message={errors.tutorType} />
        </div>
        <TextField
          locale={locale}
          name="organization"
          label="tutor.organization"
          required={false}
          defaultValue={profile?.organization ?? ''}
          result={result}
        />

        <h2 className="mt-8 text-xl font-medium">{translate(locale, 'tutor.publicHeading')}</h2>
        <p className="text-sm text-slate-600">{translate(locale, 'tutor.publicHint')}</p>
        <LongText
          locale={locale}
          name="introduction"
          label="tutor.introduction"
          required
          defaultValue={profile?.introduction}
          error={errors.introduction}
        />
        <LongText
          locale={locale}
          name="experience"
          label="tutor.experience"
          defaultValue={profile?.experience}
          error={errors.experience}
        />
        <LongText
          locale={locale}
          name="teachingMethod"
          label="tutor.method"
          defaultValue={profile?.teachingMethod}
          error={errors.teachingMethod}
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block font-medium" htmlFor="pricePerLessonVnd">
              {translate(locale, 'tutor.price')}
            </label>
            <input
              id="pricePerLessonVnd"
              name="pricePerLessonVnd"
              type="number"
              min="1"
              step="1"
              required
              defaultValue={profile?.pricePerLessonVnd}
              className="mt-1 w-full rounded border border-slate-400 p-2"
            />
            <FieldError
              id="pricePerLessonVnd-error"
              locale={locale}
              message={errors.pricePerLessonVnd}
            />
          </div>
          <div>
            <label className="block font-medium" htmlFor="lessonMinutes">
              {translate(locale, 'tutor.minutes')}
            </label>
            <input
              id="lessonMinutes"
              name="lessonMinutes"
              type="number"
              min="15"
              max="480"
              step="5"
              required
              defaultValue={profile?.lessonMinutes}
              className="mt-1 w-full rounded border border-slate-400 p-2"
            />
            <FieldError id="lessonMinutes-error" locale={locale} message={errors.lessonMinutes} />
          </div>
        </div>
        <fieldset className="mt-4">
          <legend className="font-medium">{translate(locale, 'tutor.modes')}</legend>
          <label className="mr-6 inline-flex items-center gap-2">
            <input
              type="checkbox"
              name="teachingModes"
              value="online"
              defaultChecked={modes.includes('online')}
            />
            {translate(locale, 'tutor.modeOnline')}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name="teachingModes"
              value="offline"
              defaultChecked={modes.includes('offline')}
            />
            {translate(locale, 'tutor.modeOffline')}
          </label>
          <FieldError id="teachingModes-error" locale={locale} message={errors.teachingModes} />
        </fieldset>
        <CatalogChoices
          locale={locale}
          name="subjectIds"
          legend="tutor.subjects"
          items={subjects as CatalogName[]}
          selectedIds={profile?.subjectIds ?? []}
          error={errors.subjectIds}
        />
        <CatalogChoices
          locale={locale}
          name="gradeIds"
          legend="tutor.grades"
          items={grades as CatalogName[]}
          selectedIds={profile?.gradeIds ?? []}
          error={errors.gradeIds}
        />
        <RegionPicker
          locale={locale}
          provinces={provinces as CatalogName[]}
          selectedIds={profile?.regionIds ?? []}
          initialCommunes={initialCommunes as Record<string, CatalogName[]>}
        />
        <FieldError id="regionIds-error" locale={locale} message={errors.regionIds} />

        <fieldset className="mt-4">
          <legend className="font-medium">{translate(locale, 'tutor.availability')}</legend>
          <p className="text-sm text-slate-600">{translate(locale, 'tutor.availabilityHint')}</p>
          {WEEKDAYS.map((weekday) => {
            const dayLabel = translate(locale, WEEKDAY_LABEL[weekday] as MessageKey);
            return (
              <div key={weekday} className="mt-1 grid grid-cols-3 items-center gap-2">
                <span>{dayLabel}</span>
                <input
                  type="time"
                  name={`start-${weekday}`}
                  aria-label={`${dayLabel}: ${translate(locale, 'tutor.from')}`}
                  defaultValue={slotOf(weekday)?.startTime}
                  className="rounded border border-slate-400 p-1"
                />
                <input
                  type="time"
                  name={`end-${weekday}`}
                  aria-label={`${dayLabel}: ${translate(locale, 'tutor.to')}`}
                  defaultValue={slotOf(weekday)?.endTime}
                  className="rounded border border-slate-400 p-1"
                />
              </div>
            );
          })}
          <FieldError id="availability-error" locale={locale} message={errors.availability} />
        </fieldset>

        <label className="mt-4 flex items-start gap-2">
          <input
            className="mt-1"
            type="checkbox"
            name="acceptingStudents"
            defaultChecked={profile?.acceptingStudents ?? true}
          />
          <span>{translate(locale, 'tutor.accepting')}</span>
        </label>
        <SubmitButton locale={locale} label="tutor.save" />
      </Form>
      {status === 'verified' && (
        <p className="mt-4">
          <Link className="underline" to={`/${locale}/tutors/${loaderData.accountId}`}>
            {translate(locale, 'tutor.viewPublic')}
          </Link>
        </p>
      )}
    </AuthPage>
  );
}
