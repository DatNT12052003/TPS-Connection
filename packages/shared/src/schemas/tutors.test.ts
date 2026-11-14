import { describe, expect, it } from 'vitest';
import { UpdateAccountRequest } from './account.js';
import { CreateTutorCredentialRequest, UpdateTutorProfileRequest } from './tutors.js';

const codesOf = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe('UpdateTutorProfileRequest', () => {
  it('fills missing fields so PUT replaces the whole profile', () => {
    expect(UpdateTutorProfileRequest.parse({ headline: '  Gia sư Toán ' })).toMatchObject({
      headline: 'Gia sư Toán',
      bio: null,
      teachingMode: null,
      rate: null,
      acceptingStudents: true,
      teachingSubjects: [],
      serviceAreaIds: [],
      availability: [],
    });
  });

  it('rejects duplicate subjects, overlapping slots and areas for online-only tutors', () => {
    const result = UpdateTutorProfileRequest.safeParse({
      teachingMode: 'online',
      teachingSubjects: [
        { subjectId: 1, gradeLevelId: 9 },
        { subjectId: 1, gradeLevelId: 9 },
      ],
      serviceAreaIds: [1],
      availability: [
        { weekday: 2, startTime: '18:00', endTime: '20:00' },
        { weekday: 2, startTime: '19:30', endTime: '21:00' },
      ],
    });
    expect(codesOf(result)).toEqual(
      expect.arrayContaining(['duplicate', 'service_areas_need_in_person', 'slot_overlap']),
    );
  });

  it('accepts back-to-back slots and validates times', () => {
    expect(
      UpdateTutorProfileRequest.safeParse({
        availability: [
          { weekday: 2, startTime: '18:00', endTime: '19:30' },
          { weekday: 2, startTime: '19:30', endTime: '21:00' },
        ],
      }).success,
    ).toBe(true);
    const bad = UpdateTutorProfileRequest.safeParse({
      availability: [{ weekday: 8, startTime: '25:00', endTime: '20:00' }],
    });
    expect(codesOf(bad)).toContain('invalid_time');
  });

  it('requires an https intro video link and a positive rate', () => {
    const result = UpdateTutorProfileRequest.safeParse({
      introVideoUrl: 'http://example.com/video',
      rate: { amountVnd: 0, unit: 'hour' },
    });
    expect(codesOf(result)).toEqual(expect.arrayContaining(['invalid_url', 'invalid_amount']));
  });
});

describe('CreateTutorCredentialRequest', () => {
  it('rejects a year in the future', () => {
    const result = CreateTutorCredentialRequest.safeParse({
      kind: 'degree',
      title: 'Cử nhân Sư phạm Toán',
      issuedYear: new Date().getFullYear() + 1,
    });
    expect(codesOf(result)).toContain('invalid_year');
  });
});

describe('UpdateAccountRequest', () => {
  it('normalises the phone number and clears it with an empty string', () => {
    expect(UpdateAccountRequest.parse({ phone: '0912 345 678' })).toEqual({ phone: '0912345678' });
    expect(UpdateAccountRequest.parse({ phone: '' })).toEqual({ phone: null });
    expect(codesOf(UpdateAccountRequest.safeParse({}))).toContain('nothing_to_update');
  });
});
