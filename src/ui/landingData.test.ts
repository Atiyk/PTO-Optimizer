import { describe, it, expect } from 'vitest';
import {
  isOffDay,
  nextDayOff,
  nextHoliday,
  daysOffRemainingThisYear,
  longestStretchAhead,
  longestDrySpell,
  findDrySpells,
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

  it('(K4) a dry spell spans weekends - it only ends at the next holiday that falls on a working day, not at the next Saturday', () => {
    // Only one working-day holiday in the whole window (Nov 9); everything else, weekends
    // included, is one continuous dry spell on either side of it. Under the old "longest
    // run of working days" definition, every weekend would have ended it at ~5 days - here
    // it correctly spans straight through the Nov 7-8 and Nov 14-15 etc. weekends.
    const set = holidaySet(MONDAY_HOLIDAY);
    const run = longestDrySpell('2026-11-01', '2026-11-30', set);
    expect(run).toEqual({ start: '2026-11-10', end: '2026-11-30' }); // 21 days, weekends included
    expect(runLength(run!)).toBe(21);
  });

  it('(K4) a holiday landing on a weekend is not a "break" - it does not end a dry spell, since it created no new day off', () => {
    const weekendHoliday: Holiday = { date: '2026-11-07', nominalDate: '2026-11-07', name: 'Falls on a Saturday', countryCode: 'US', counties: null };
    const run = longestDrySpell('2026-11-01', '2026-11-30', holidaySet(weekendHoliday));
    // No working-day break anywhere in the window - the whole thing is one dry spell.
    expect(run).toEqual({ start: '2026-11-02', end: '2026-11-30' });
  });

  it('(K4) today and the horizon act as implicit boundaries, so the dry spell you are currently in is found too', () => {
    // A single working-day holiday mid-month splits the window into a spell right after
    // today (Nov 2-17, 16 days) and a shorter one after the holiday (Nov 19-30, 12 days) -
    // "today" itself is the start of the longer one, found correctly without a real
    // holiday bounding it on that side.
    const midMonth: Holiday = { date: '2026-11-18', nominalDate: '2026-11-18', name: 'Mid-month holiday', countryCode: 'US', counties: null };
    const run = longestDrySpell('2026-11-01', '2026-11-30', holidaySet(midMonth));
    expect(run).toEqual({ start: '2026-11-02', end: '2026-11-17' });
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

describe('nextHoliday (5A: weekends are not news)', () => {
  it('finds the next real public holiday and the bridge touching its run, skipping ordinary weekends entirely', () => {
    const set = [THANKSGIVING];
    const result = nextHoliday('2026-11-01', '2026-11-30', set);
    expect(result).toBeDefined();
    expect(result!.holiday.name).toBe('Thanksgiving');
    expect(result!.daysAway).toBe(25);
    expect(result!.runLength).toBe(1); // isolated Thursday, not yet merged with the weekend
    expect(result!.bridge).toBeDefined();
    expect(result!.bridge!.bridgeDate).toBe('2026-11-27'); // the Friday that bridges it to the weekend
  });

  it('returns undefined when no holiday falls in the window at all', () => {
    expect(nextHoliday('2026-11-01', '2026-11-30', [])).toBeUndefined();
  });
});

describe('findDrySpells (K4, used directly by YearStrip)', () => {
  it('returns every spell at least minDays long, not just the longest one', () => {
    const early: Holiday = { date: '2026-11-04', nominalDate: '2026-11-04', name: 'Early', countryCode: 'US', counties: null };
    const late: Holiday = { date: '2026-11-25', nominalDate: '2026-11-25', name: 'Late', countryCode: 'US', counties: null };
    const spells = findDrySpells('2026-11-01', '2026-11-30', new Set([early.date, late.date]), DEFAULT_WORK_WEEK, 5);
    // Gaps: Nov2-3 (2d, excluded), Nov5-24 (20d), Nov26-30 (5d) - both of the latter two
    // clear the 5-day threshold.
    expect(spells).toEqual([
      { start: '2026-11-05', end: '2026-11-24' },
      { start: '2026-11-26', end: '2026-11-30' },
    ]);
  });
});
