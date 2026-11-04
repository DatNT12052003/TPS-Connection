import { describe, expect, it } from 'vitest';
import { toFormResult } from '~/lib/form-errors';
import { formatVnd, parseTutorForm, shortDescription } from '~/lib/tutor-form';

const formOf = (entries: [string, string][]) => {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
};

describe('parseTutorForm', () => {
  it('collects repeated fields without duplicates', () => {
    const body = parseTutorForm(
      formOf([
        ['regionIds', 'a'],
        ['regionIds', 'b'],
        ['regionIds', 'a'],
        ['teachingModes', 'online'],
      ]),
    );
    expect(body.regionIds).toEqual(['a', 'b']);
    expect(body.teachingModes).toEqual(['online']);
  });

  it('turns empty optional text into null, and reads the checkbox', () => {
    const body = parseTutorForm(formOf([['organization', '  ']]));
    expect(body.organization).toBeNull();
    expect(body.acceptingStudents).toBe(false);
    expect(parseTutorForm(formOf([['acceptingStudents', 'on']])).acceptingStudents).toBe(true);
  });

  it('keeps only the days with a time, and half-filled ones for the API to refuse', () => {
    const body = parseTutorForm(
      formOf([
        ['start-1', '18:00'],
        ['end-1', '20:00'],
        ['start-3', '09:00'],
        ['start-0', ''],
        ['end-0', ''],
      ]),
    );
    expect(body.availability).toEqual([
      { weekday: 1, startTime: '18:00', endTime: '20:00' },
      { weekday: 3, startTime: '09:00', endTime: '' },
    ]);
  });
});

describe('field errors from nested paths', () => {
  it('points array errors at the field as a whole', () => {
    const result = toFormResult({
      fields: [
        { path: 'body.subjectIds', code: 'NOT_SELECTABLE' },
        { path: 'body.availability.0.endTime', code: 'CUSTOM' },
      ],
    });
    expect(result.fieldErrors.subjectIds).toBe('fieldError.notSelectable');
    expect(result.fieldErrors.availability).toBe('fieldError.availability');
  });

  it('words the code for a name that needs checking again', () => {
    expect(toFormResult({ code: 'REVERIFICATION_REQUIRED', fields: [] }).formError).toBe(
      'code.REVERIFICATION_REQUIRED',
    );
  });
});

describe('display helpers', () => {
  it('formats VND by language', () => {
    expect(formatVnd(300000, 'vi')).toBe('300.000 ₫');
    expect(formatVnd(300000, 'en')).toBe('300,000 ₫');
  });

  it('shortens at a word, on one line', () => {
    expect(shortDescription('một\nhai   ba')).toBe('một hai ba');
    const long = shortDescription('từ '.repeat(100));
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long.endsWith('từ…')).toBe(true);
  });
});
