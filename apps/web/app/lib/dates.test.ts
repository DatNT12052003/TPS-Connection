// Đổi ngày giữa dạng hiện trên form (dd/mm/yyyy) và dạng API (YYYY-MM-DD).
import { describe, expect, it } from 'vitest';
import { dateToIso, displayToIso, isoToDate, isoToDisplay } from './dates';

describe('displayToIso', () => {
  it.each([
    ['05/09/2014', '2014-09-05'],
    ['5/9/2014', '2014-09-05'],
    [' 29.02.2016 ', '2016-02-29'],
    ['31-12-2010', '2010-12-31'],
  ])('reads %j as %s', (text, iso) => {
    expect(displayToIso(text)).toBe(iso);
  });

  it.each(['', '2014-09-05', '31/02/2014', '29/02/2015', '00/01/2014', '12/13/2014', 'abc'])(
    'rejects %j',
    (text) => {
      expect(displayToIso(text)).toBeNull();
    },
  );
});

describe('iso conversions', () => {
  it('shows an API date as dd/mm/yyyy', () => {
    expect(isoToDisplay('2014-09-05')).toBe('05/09/2014');
  });

  it('keeps the calendar date without shifting the day', () => {
    expect(dateToIso(isoToDate('2014-09-05'))).toBe('2014-09-05');
  });
});
