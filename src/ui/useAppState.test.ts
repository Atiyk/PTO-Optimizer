import { describe, it, expect } from 'vitest';
import { defaultRangeEnd, discoverSubdivisions } from './useAppState';
import type { Holiday } from '../data/holidays';

describe('defaultRangeEnd (Phase 2, bug found: always stuck to the current year)', () => {
  // Nothing in the solver/holiday-fetch/date-arithmetic layer actually blocks a
  // multi-year range (confirmed directly against a real Apr 2027 - Mar 2028 solve) - the
  // tool only ever APPEARED bounded to the current year because this default never rolled
  // forward, even when almost no useful planning window was left in it.

  it('stays at this year\'s Dec 31 when plenty of the year remains', () => {
    expect(defaultRangeEnd('2026-10-25')).toBe('2026-12-31'); // ~67 days left
    expect(defaultRangeEnd('2026-01-01')).toBe('2026-12-31');
    expect(defaultRangeEnd('2026-06-15')).toBe('2026-12-31');
  });

  it('still returns this year\'s Dec 31 right at the rollover threshold', () => {
    // 22 days remain (Dec 9 -> Dec 31 inclusive of neither endpoint as "today"): still
    // "more than a few weeks", per spec.
    expect(defaultRangeEnd('2026-12-09')).toBe('2026-12-31');
  });

  it('rolls forward to next year\'s Dec 31 once only a few weeks remain', () => {
    expect(defaultRangeEnd('2026-12-20')).toBe('2027-12-31'); // 11 days left
    expect(defaultRangeEnd('2026-12-31')).toBe('2027-12-31'); // 0 days left (today is the 31st itself)
  });

  it('rolls forward correctly across a leap year boundary', () => {
    expect(defaultRangeEnd('2027-12-20')).toBe('2028-12-31');
  });
});

function makeHoliday(overrides: Partial<Holiday> = {}): Holiday {
  return { date: '2027-01-01', nominalDate: '2027-01-01', name: 'Test holiday', countryCode: 'DE', counties: null, ...overrides };
}

describe('discoverSubdivisions (Phase 2: subdivisions via the counties field, any country)', () => {
  it('collects unique subdivision codes from holidays that carry them', () => {
    const holidays = [
      makeHoliday({ counties: ['DE-BW', 'DE-BY'] }),
      makeHoliday({ counties: ['DE-BE'] }),
      makeHoliday({ counties: null }), // national holiday - no counties
    ];
    expect(discoverSubdivisions(holidays)).toEqual(['DE-BE', 'DE-BW', 'DE-BY']);
  });

  it('deduplicates a code that appears on multiple holidays', () => {
    const holidays = [makeHoliday({ counties: ['DE-BY'] }), makeHoliday({ counties: ['DE-BY', 'DE-BW'] })];
    expect(discoverSubdivisions(holidays)).toEqual(['DE-BW', 'DE-BY']);
  });

  it('returns an empty list when nothing has subdivision data - the "no subdivisions" case, not a crash', () => {
    expect(discoverSubdivisions([makeHoliday({ counties: null })])).toEqual([]);
    expect(discoverSubdivisions([])).toEqual([]);
  });

  it('is not tied to any particular country - works for any code shape', () => {
    const holidays = [makeHoliday({ countryCode: 'JP', counties: ['JP-13'] })];
    expect(discoverSubdivisions(holidays)).toEqual(['JP-13']);
  });
});
