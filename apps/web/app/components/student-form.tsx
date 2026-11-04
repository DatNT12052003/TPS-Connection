import { Form } from 'react-router';
import { CsrfField, FieldError, FormAlert, SubmitButton, TextField } from './auth-ui';
import type { FormResult } from '~/lib/form-errors';
import { translate, type Locale } from '~/lib/i18n';

type Grade = { id: string; nameVi: string; nameEn: string };
type Student = { nickname: string; fullName: string | null; gradeId: string };

export function StudentForm({
  locale,
  csrf,
  grades,
  student,
  currentGradeName,
  result,
}: {
  locale: Locale;
  csrf: string;
  grades: Grade[];
  /** Absent when creating a profile. */
  student?: Student;
  /** Shows a grade switched off since it was chosen, which the catalog no longer lists. */
  currentGradeName?: string;
  result?: FormResult;
}) {
  const errors = result?.fieldErrors ?? {};
  const gradeListed = grades.some((grade) => grade.id === student?.gradeId);
  return (
    <>
      <FormAlert locale={locale} result={result} />
      <Form method="post">
        <CsrfField token={csrf} />
        <input type="hidden" name="intent" value="save" />
        <TextField
          locale={locale}
          name="nickname"
          label="students.nickname"
          defaultValue={student?.nickname}
          result={result}
        />
        <TextField
          locale={locale}
          name="fullName"
          label="students.fullName"
          required={false}
          defaultValue={student?.fullName ?? ''}
          result={result}
        />
        <div className="mt-4">
          <label className="block font-medium" htmlFor="gradeId">
            {translate(locale, 'students.grade')}
          </label>
          <select
            id="gradeId"
            name="gradeId"
            required
            defaultValue={student?.gradeId ?? ''}
            className="mt-1 w-full rounded border border-slate-400 p-2"
          >
            <option value="" disabled>
              {translate(locale, 'students.gradeChoose')}
            </option>
            {student && !gradeListed && <option value={student.gradeId}>{currentGradeName}</option>}
            {grades.map((grade) => (
              <option key={grade.id} value={grade.id}>
                {locale === 'vi' ? grade.nameVi : grade.nameEn}
              </option>
            ))}
          </select>
          <FieldError id="gradeId-error" locale={locale} message={errors.gradeId} />
        </div>
        {!student && (
          <>
            <label className="mt-4 flex items-start gap-2">
              <input className="mt-1" type="checkbox" name="acceptedOnBehalf" required />
              <span>{translate(locale, 'students.consent')}</span>
            </label>
            <FieldError id="consent-error" locale={locale} message={errors.acceptedOnBehalf} />
          </>
        )}
        <SubmitButton locale={locale} label="students.save" />
      </Form>
    </>
  );
}
