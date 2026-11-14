// Môn và khối dạy được (canvas TutorProfileEdit, "Môn và khối dạy"): mỗi môn một dòng, bấm các khối để chọn.
// Gửi trong ô ẩn `teachingSubjects` dạng JSON [{ subjectId, gradeLevelId }] (API lưu từng cặp môn × khối).
// Cần JavaScript (danh sách động).
import type { TeachingSubject } from '@tps/shared';
import { Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { SelectField } from '~/components/ui/field';
import type { CatalogOption } from '~/lib/catalog';
import { groupBySubject, summarizeGrades } from '~/lib/tutor-profile';
import { cn } from '~/lib/utils';

interface Entry {
  subjectId: number;
  gradeIds: number[];
}

export const pillClassName = cn(
  'inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-surface px-3.5 text-small font-semibold text-foreground',
  'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  'aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary-hover',
);

export function TeachingSubjectsEditor({
  subjects,
  grades,
  initial,
  error,
}: {
  subjects: readonly CatalogOption[];
  grades: readonly CatalogOption[];
  initial: readonly TeachingSubject[];
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  const errorId = useId();
  const [entries, setEntries] = useState<Entry[]>(() =>
    [...groupBySubject(initial)].map(([subjectId, gradeIds]) => ({ subjectId, gradeIds })),
  );
  const unused = subjects.filter((s) => !entries.some((e) => e.subjectId === s.id));
  const [toAdd, setToAdd] = useState('');

  const pairs: TeachingSubject[] = entries.flatMap((entry) =>
    entry.gradeIds.map((gradeLevelId) => ({ subjectId: entry.subjectId, gradeLevelId })),
  );
  const labelOfSubject = (id: number) => subjects.find((s) => s.id === id)?.label ?? `#${id}`;

  function toggleGrade(subjectId: number, gradeId: number) {
    setEntries((current) =>
      current.map((entry) =>
        entry.subjectId !== subjectId
          ? entry
          : {
              ...entry,
              gradeIds: entry.gradeIds.includes(gradeId)
                ? entry.gradeIds.filter((id) => id !== gradeId)
                : [...entry.gradeIds, gradeId],
            },
      ),
    );
  }

  function addSubject() {
    const id = Number(toAdd);
    if (!id) return;
    setEntries((current) => [...current, { subjectId: id, gradeIds: [] }]);
    setToAdd('');
  }

  return (
    <div
      className="flex flex-col gap-4"
      aria-describedby={error ? errorId : undefined}
      role="group"
      aria-label={t('tutorProfile.subjectsTitle')}
    >
      <input type="hidden" name="teachingSubjects" value={JSON.stringify(pairs)} />
      {error && (
        <span id={errorId} className="text-small font-medium text-danger">
          {error}
        </span>
      )}
      {entries.length === 0 && (
        <p className="text-small text-muted-foreground">{t('tutorProfile.subjectsEmpty')}</p>
      )}
      <ul className="flex flex-col divide-y divide-border">
        {entries.map((entry) => {
          const name = labelOfSubject(entry.subjectId);
          return (
            <li key={entry.subjectId} className="flex flex-col gap-3 py-4 first:pt-0">
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{name}</span>
                  <span className="text-small text-muted-foreground">
                    {entry.gradeIds.length > 0
                      ? summarizeGrades(entry.gradeIds, grades)
                      : t('tutorProfile.chooseGrades')}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('tutorProfile.removeSubject', { subject: name })}
                  onClick={() =>
                    setEntries((current) => current.filter((e) => e.subjectId !== entry.subjectId))
                  }
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
              <div
                role="group"
                aria-label={t('tutorProfile.gradesOf', { subject: name })}
                className="flex flex-wrap gap-2"
              >
                {grades.map((grade) => (
                  <button
                    key={grade.id}
                    type="button"
                    aria-pressed={entry.gradeIds.includes(grade.id)}
                    className={pillClassName}
                    onClick={() => toggleGrade(entry.subjectId, grade.id)}
                  >
                    {grade.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {unused.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            className="min-w-48 flex-1 sm:max-w-xs"
            label={t('tutorProfile.addSubjectLabel')}
            value={toAdd}
            onChange={(event) => setToAdd(event.target.value)}
          >
            <option value="">{t('location.choose')}</option>
            {unused.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </SelectField>
          <Button type="button" variant="secondary" disabled={!toAdd} onClick={addSubject}>
            <Plus aria-hidden="true" />
            {t('tutorProfile.addSubject')}
          </Button>
        </div>
      )}
    </div>
  );
}
