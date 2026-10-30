import { describe, it, expect } from 'vitest';
import {
  isOffDay,
  nextDayOff,
  daysOffRemainingThisYear,
  longestStretchAhead,
  longestDrySpell,
  findBridges,
  remainingHolidays,
  runLength,
} from './landingData';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { Holiday } from '@daysoff/engine/data/holidays';

// 2026-11-26 is a Thursday (Thanksgiving); 2026-11-27 Fri, 28 Sat, 29 Sun.
const THANKSGIVING: Holiday = { date: '2026-11-26', nominalDate: '2026-11-26', name: 'Thanksgiving', countryCode: 'US', counties: null };

function holidaySet(...holidays: Holiday[]): Set<string> {
  return new Set(holidays.map((h) => h.date));
}

describe('isOffDay', () => {
  it('true for a weekend day under the default (Mon-Fri) work week', () => {
    expect(isOffDay('2026-11-28', new Set())).toBe(true); // Saturday
  });
  it('false for an ordinary Tuesday', () => {
    expect(isOffDay('2026-11-24', new Set())).toBe(false);
  });
  it('true for a holiday that falls on a weekday', () => {
    expect(isOffDay('2026-11-26', holidaySet(THANKSGIVING))).toBe(true);
  });
});

describe('nextDayOff', () => {
  it('finds the next weekend day when there are no holidays in between', () => {
    // 2026-11-24 is a Tuesday; the next off day is Saturday the 28th.
    expect(nextDayOff('2026-11-24', new Set())).toBe('2026-11-28');
  });
  it('finds a holiday before a weekend if it comes first', () => {
    // 2026-11-23 is a Monday; Thanksgiving (Thu 26th) comes before the weekend.
    expect(nextDayOff('2026-11-23', holidaySet(THANKSGIVING))).toBe('2026-11-26');
  });
});

describe('daysOffRemainingThisYear', () => {
  it('counts every weekend/holiday day strictly after today through year end', () => {
    // Nov 24 (Tue) through Nov 30 (Mon): off days are 28 (Sat), 29 (Sun) = 2.
    expect(daysOffRemainingThisYear('2026-11-24', '2026-11-30', new Set())).toBe(2);
  });
  it('is zero once year end has passed', () => {
    expect(daysOffRemainingThisYear('2026-12-31', '2026-11-30', new Set())).toBe(0);
  });
});

describe('longestStretchAhead / longestDrySpell', () => {
  // 2026-11-01 is a Sunday, so 2026-11-09 is the following Monday - a holiday there merges
  // directly with the Sat 7 / Sun 8 weekend into one 3-day run, with no working-day gap to
  // bridge (unlike Thanksgiving in this same year, which lands on a Thursday separated from
  // the weekend by one working Friday - see `findBridges` below for that case instead).
  const MONDAY_HOLIDAY: Holiday = { date: '2026-11-09', nominalDate: '2026-11-09', name: 'Made-up Monday Holiday', countryCode: 'US', counties: null };

  it('finds the long weekend created by a Monday holiday (Sat-Mon, 3 days) over every other plain 2-day weekend', () => {
    const set = holidaySet(MONDAY_HOLIDAY);
    const run = longestStretchAhead('2026-11-01', '2026-11-30', set);
    expect(run).toEqual({ start: '2026-11-07', end: '2026-11-09' });
    expect(runLength(run!)).toBe(3);
  });

  it('finds the longest run of working days (the dry spell) in the same window', () => {
    const set = holidaySet(MONDAY_HOLIDAY);
    // Nov 2 (Mon) - Nov 6 (Fri): 5 working days before the first weekend - the longest run,
    // tied with two later 5-day working weeks but first chronologically.
    const run = longestDrySpell('2026-11-01', '2026-11-30', set);
    expect(run).toEqual({ start: '2026-11-02', end: '2026-11-06' });
  });
});

describe('findBridges', () => {
  it('finds the Friday-after-Thanksgiving bridge: Thu-Sun run, one working day (Mon the 23rd is NOT adjacent - Fri 27th is)', () => {
    const set = holidaySet(THANKSGIVING);
    const bridges = findBridges('2026-11-01', '2026-11-30', set);
    // Thanksgiving (Thu 26th) is already adjacent to the weekend (Sat 28/Sun 29) with no gap -
    // the real bridge in this calendar is nothing to find here since Thu->Fri->Sat/Sun has no
    // working-day gap at all (Thu is the holiday, Fri is the one working day before the
    // weekend). Confirm that single working day IS detected as the bridge.
    expect(bridges).toEqual([{ bridgeDate: '2026-11-27', combined: { start: '2026-11-26', end: '2026-11-29' } }]);
  });

  it('finds no bridge when the gap between two off-runs is more than one working day', () => {
    // No holidays: the gap between one weekend and the next is 5 working days.
    expect(findBridges('2026-11-01', '2026-11-30', new Set())).toEqual([]);
  });
});

describe('remainingHolidays', () => {
  it('annotates Thanksgiving (an isolated 1-day off-run, bridged to the weekend by the Friday after it) correctly', () => {
    const list = remainingHolidays('2026-11-01', '2026-11-30', [THANKSGIVING], DEFAULT_WORK_WEEK);
    expect(list).toHaveLength(1);
    expect(list[0].weekday).toBe('Thursday');
    expect(list[0].daysAway).toBe(25);
    expect(list[0].runLength).toBe(1);
    expect(list[0].isBridgeable).toBe(true);
    expect(list[0].isObserved).toBe(false);
  });

  it('excludes holidays on or before today, and de-duplicates same-date entries', () => {
    const past: Holiday = { ...THANKSGIVING, date: '2026-10-31' };
    const dup: Holiday = { ...THANKSGIVING, name: 'Duplicate Name' };
    const list = remainingHolidays('2026-11-01', '2026-11-30', [past, THANKSGIVING, dup]);
    expect(list).toHaveLength(1);
    expect(list[0].holiday.name).toBe('Thanksgiving');
  });

  it('marks an observed-date holiday (nominal differs from actual) correctly', () => {
    const shifted: Holiday = { date: '2026-11-27', nominalDate: '2026-11-28', name: 'Shifted Day', countryCode: 'US', counties: null };
    const list = remainingHolidays('2026-11-01', '2026-11-30', [shifted]);
    expect(list[0].isObserved).toBe(true);
  });
});
