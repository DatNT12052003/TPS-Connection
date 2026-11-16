// Ngày giờ theo giờ Việt Nam cho lịch học (G6): ngày, giờ địa phương của một thời điểm UTC, tuần bắt đầu thứ Hai,
// tên lớp ghép từ môn và học sinh, nhãn trạng thái của buổi.
import type { Lesson } from '@tps/shared';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  classTitle,
  isoWeekday,
  lessonBadge,
  mondayOf,
  vnDate,
  vnInstant,
  vnTime,
} from './classes';

describe('Vietnam dates', () => {
  it('converts UTC instants to the local date and time', () => {
    // 18:30 UTC là 01:30 sáng hôm sau ở Việt Nam.
    expect(vnDate('2026-11-16T18:30:00.000Z')).toBe('2026-11-17');
    expect(vnTime('2026-11-16T18:30:00.000Z')).toBe('01:30');
    expect(vnInstant('2026-11-17', '01:30')).toBe('2026-11-17T01:30:00+07:00');
    expect(new Date(vnInstant('2026-11-17', '01:30')).toISOString()).toBe(
      '2026-11-16T18:30:00.000Z',
    );
  });

  it('computes ISO weekdays, Mondays and day offsets across months', () => {
    expect(isoWeekday('2026-11-16')).toBe(1);
    expect(isoWeekday('2026-11-22')).toBe(7);
    expect(mondayOf('2026-11-22')).toBe('2026-11-16');
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
});

describe('classTitle', () => {
  const subjects = [{ id: 1, label: 'Toán' }];
  it('uses the tutor-given name, else subject and learner', () => {
    expect(classTitle({ name: 'Ôn thi', subjectId: 1, learnerName: 'Bin' }, subjects)).toBe(
      'Ôn thi',
    );
    expect(classTitle({ name: null, subjectId: 1, learnerName: 'Bin' }, subjects)).toBe(
      'Toán – Bin',
    );
  });
});

describe('lessonBadge', () => {
  const lesson = (overrides: Partial<Lesson>) =>
    ({
      status: 'scheduled',
      startsAt: '2020-01-01T00:00:00Z',
      myRole: 'tutor',
      ...overrides,
    }) as Lesson;
  it('asks the tutor for attendance once the lesson has started', () => {
    expect(lessonBadge(lesson({})).key).toBe('lessons.badgeNeedsAttendance');
    expect(lessonBadge(lesson({ myRole: 'client' })).key).toBe('lessons.badgeAwaitingRecord');
    expect(lessonBadge(lesson({ startsAt: '2999-01-01T00:00:00Z' })).key).toBe(
      'lessons.badgeUpcoming',
    );
    expect(lessonBadge(lesson({ status: 'held' })).key).toBe('lessons.badgeHeld');
  });
});
