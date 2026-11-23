import { describe, expect, it } from 'vitest';
import { guideHolidayList } from './planGuidePlan';

/**
 * The 2027 holiday dates the guide pages print, read through the same pipeline the planner
 * uses (committed public/holidays JSON -> consumer normalisation -> a new visitor's holiday
 * entries). Checked by hand against the official sources on 2026-11-22:
 * - US: OPM federal holidays, https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
 * - England and Wales: https://www.gov.uk/bank-holidays.json ("england-and-wales")
 * If a source changes, fix the data pipeline (scripts/build-holidays.ts), not these rows.
 */
const rows = (scope: Parameters<typeof guideHolidayList>[0]) =>
  guideHolidayList(scope).map(({ date, weekday }) => `${date} ${weekday}`);

describe('2027 US federal holidays (OPM)', () => {
  it('lists all 12 days observed in 2027 with their weekdays', () => {
    expect(rows({ year: 2027, country: 'US' })).toEqual([
      '2027-01-01 Fri', // New Year's Day
      '2027-01-18 Mon', // Birthday of Martin Luther King, Jr.
      '2027-02-15 Mon', // Washington's Birthday
      '2027-05-31 Mon', // Memorial Day
      '2027-06-18 Fri', // Juneteenth, observed (Jun 19 is a Saturday)
      '2027-07-05 Mon', // Independence Day, observed (Jul 4 is a Sunday)
      '2027-09-06 Mon', // Labor Day
      '2027-10-11 Mon', // Columbus Day
      '2027-11-11 Thu', // Veterans Day
      '2027-11-25 Thu', // Thanksgiving Day
      '2027-12-24 Fri', // Christmas Day, observed (Dec 25 is a Saturday)
      '2027-12-31 Fri', // New Year's Day 2028, observed (Jan 1, 2028 is a Saturday)
    ]);
  });

  it('leaves out state-only days such as Good Friday and Lincoln\'s Birthday', () => {
    const dates = guideHolidayList({ year: 2027, country: 'US' }).map((h) => h.date);
    expect(dates).not.toContain('2027-03-26');
    expect(dates).not.toContain('2027-02-12');
  });
});

describe('2027 bank holidays, England and Wales (gov.uk)', () => {
  const expected = [
    '2027-01-01 Fri', // New Year's Day
    '2027-03-26 Fri', // Good Friday
    '2027-03-29 Mon', // Easter Monday
    '2027-05-03 Mon', // Early May bank holiday
    '2027-05-31 Mon', // Spring bank holiday
    '2027-08-30 Mon', // Summer bank holiday
    '2027-12-27 Mon', // Christmas Day (substitute day)
    '2027-12-28 Tue', // Boxing Day (substitute day)
  ];

  it('England has the 8 gov.uk dates', () => {
    expect(rows({ year: 2027, country: 'GB', subdivision: 'GB-ENG' })).toEqual(expected);
  });

  it('Wales has the same 8 dates', () => {
    expect(rows({ year: 2027, country: 'GB', subdivision: 'GB-WLS' })).toEqual(expected);
  });

  it('without a region the UK-wide list misses Easter Monday and the August bank holiday, so the UK guide must carry sd', () => {
    const dates = guideHolidayList({ year: 2027, country: 'GB' }).map((h) => h.date);
    expect(dates).not.toContain('2027-03-29');
    expect(dates).not.toContain('2027-08-30');
  });
});
