import { describe, it, expect } from 'vitest';
import { defaultRangeEnd, shiftRangeToNextYear } from './useAppState';

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

describe('shiftRangeToNextYear (Phase 3 item 6: "Plan next year" banner action)', () => {
  it('shifts both ends forward by exactly one year, same month/day', () => {
    expect(shiftRangeToNextYear('2026-10-25', '2026-12-31')).toEqual({ rangeStart: '2027-10-25', rangeEnd: '2027-12-31' });
  });

  it('clamps Feb 29 to Feb 28 when the target year is not a leap year', () => {
    // 2028 is a leap year, 2029 is not.
    expect(shiftRangeToNextYear('2028-02-29', '2028-03-15')).toEqual({ rangeStart: '2029-02-28', rangeEnd: '2029-03-15' });
  });

  it('keeps Feb 29 when the target year is also a leap year', () => {
    expect(shiftRangeToNextYear('2024-02-29', '2024-03-01')).toEqual({ rangeStart: '2025-02-28', rangeEnd: '2025-03-01' });
    // 2024 -> 2028 (4 years later, still leap) via two hops lands back on Feb 29.
    const once = shiftRangeToNextYear('2027-02-28', '2027-03-01');
    expect(once.rangeStart).toBe('2028-02-28');
  });
});
