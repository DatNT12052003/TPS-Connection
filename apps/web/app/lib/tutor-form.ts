export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const optional = (form: FormData, name: string) => text(form, name) || null;
const list = (form: FormData, name: string) => [...new Set(form.getAll(name).map(String))];

/**
 * Turns the submitted form into what the API takes. It checks nothing itself:
 * empty or wrong values go through so that the API reports them field by field.
 */
export function parseTutorForm(form: FormData) {
  const availability = WEEKDAYS.flatMap((weekday) => {
    const startTime = text(form, `start-${weekday}`);
    const endTime = text(form, `end-${weekday}`);
    return startTime || endTime ? [{ weekday, startTime, endTime }] : [];
  });
  return {
    legalName: text(form, 'legalName'),
    tutorType: text(form, 'tutorType') as 'student' | 'teacher' | 'freelance',
    organization: optional(form, 'organization'),
    introduction: text(form, 'introduction'),
    experience: optional(form, 'experience'),
    teachingMethod: optional(form, 'teachingMethod'),
    pricePerLessonVnd: Number(text(form, 'pricePerLessonVnd')),
    lessonMinutes: Number(text(form, 'lessonMinutes')),
    teachingModes: list(form, 'teachingModes') as ('online' | 'offline')[],
    acceptingStudents: form.get('acceptingStudents') === 'on',
    subjectIds: list(form, 'subjectIds'),
    gradeIds: list(form, 'gradeIds'),
    regionIds: list(form, 'regionIds'),
    availability,
  };
}

export const formatVnd = (amount: number, locale: 'vi' | 'en') =>
  `${new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US').format(amount)} ₫`;

/** For search results and link previews: whole words, one line. */
export function shortDescription(value: string, max = 160): string {
  const line = value.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}
