import { describe, it, expect } from 'vitest';
import { extendSabbatical, bestPlacements, placementNote, paddedCalendarRange, type SabbaticalPlacement } from './sabbaticalData';
import { addDays } from '../solver/dateUtils';
import { DEFAULT_WORK_WEEK } from '../solver/types';
import type { Holiday } from '../data/holidays';

function holiday(date: string, name: string): Holiday {
  return { date, nominalDate: date, name, countryCode: 'US', counties: null };
}

// 2026-11-02 is a Monday (confirmed in landingData.test.ts's own fixtures).
const MONDAY = '2026-11-02';

describe('extendSabbatical (3C: marginal baseline)', () => {
  it('for a Monday-start 4-week block with no nearby holidays, the baseline already absorbs the free weekend before it, and PTO days 1-5 gain [1,1,1,1,3]', () => {
    const coreEnd = addDays(MONDAY, 27); // Sunday 2026-11-29
    const { marginal } = extendSabbatical(MONDAY, coreEnd, 5, 0, new Set());
    expect(marginal[0].awayDays).toBe(30); // 28 core days + the Sat/Sun absorbed for free
    const gains = marginal.slice(1).map((m, i) => m.awayDays - marginal[i].awayDays);
    expect(gains).toEqual([1, 1, 1, 1, 3]);
  });

  it('a holiday adjacent to the block changes the curve - the PTO day that reaches it bridges to it for free', () => {
    const coreEnd = addDays(MONDAY, 27); // Sunday 2026-11-29
    const holidaySet = new Set(['2026-12-01']); // Tuesday, one workday beyond the natural end
    const { marginal } = extendSabbatical(MONDAY, coreEnd, 1, 0, holidaySet);
    const gain = marginal[1].awayDays - marginal[0].awayDays;
    expect(gain).toBe(2); // Monday (paid) + Tuesday's holiday (free bridge)
  });

  it('breaks ties toward the right/after side (3B)', () => {
    const coreEnd = addDays(MONDAY, 27);
    const { start, end } = extendSabbatical(MONDAY, coreEnd, 1, 0, new Set());
    expect(start).toBe(addDays(MONDAY, -2)); // left only ever absorbs the free weekend, never spends
    expect(end).toBe(addDays(coreEnd, 1)); // the 1 paid day went to the right
  });

  it('never extends left past minStart, even with PTO budget left unspent (3B/K3b)', () => {
    const start = '2026-11-09'; // Monday
    const coreEnd = addDays(start, 6); // Sunday 2026-11-15, a 1-week block
    const floor = '2026-11-05'; // Thursday - 4 days before start
    const { start: extStart } = extendSabbatical(start, coreEnd, 10, 0, new Set(), DEFAULT_WORK_WEEK, floor);
    expect(extStart >= floor).toBe(true);
  });
});

describe('extendSabbatical (4C: unpaid leave)', () => {
  it('spends PTO first, then unpaid, for the days actually extended', () => {
    const coreEnd = addDays(MONDAY, 27); // Sunday 2026-11-29
    // Baseline already absorbs the weekend before (left edge at MONDAY-2); 1 PTO + 2
    // unpaid days are then spent, all on the right (ties break right, nothing blocks it).
    const { spentDays } = extendSabbatical(MONDAY, coreEnd, 1, 2, new Set());
    expect(spentDays).toHaveLength(3);
    expect(spentDays[0].kind).toBe('pto');
    expect(spentDays[1].kind).toBe('unpaid');
    expect(spentDays[2].kind).toBe('unpaid');
  });

  it('unpaid-only budget still extends the block when ptoToAdd is 0', () => {
    const coreEnd = addDays(MONDAY, 27);
    const { marginal, spentDays } = extendSabbatical(MONDAY, coreEnd, 0, 2, new Set());
    expect(spentDays.every((s) => s.kind === 'unpaid')).toBe(true);
    expect(marginal[marginal.length - 1].awayDays).toBeGreaterThan(marginal[0].awayDays);
  });
});

describe('placementNote (3A)', () => {
  const base: SabbaticalPlacement = {
    start: '2026-12-21',
    coreEnd: '2027-01-17',
    lengthDays: 28,
    holidayNames: [],
    totalAwayDays: 41,
    travelTag: null,
    extendedStart: '2026-12-19',
    extendedEnd: '2027-01-19',
    ptoBefore: 2,
    ptoAfter: 1,
    unpaidBefore: 0,
    unpaidAfter: 0,
    spentDays: [],
    marginal: [],
  };

  it('always leads with the total away-days figure', () => {
    expect(placementNote(base)).toBe('41 days away');
  });

  it('adds an "includes ..." clause only when holidays actually fall inside', () => {
    const withHolidays = { ...base, holidayNames: ['Christmas Day', "New Year's Day"] };
    expect(placementNote(withHolidays)).toBe("41 days away · includes Christmas Day and New Year's Day");
  });

  it('adds the travel tag clause when present', () => {
    const peak = { ...base, holidayNames: ['Christmas Day'], travelTag: 'peak travel' as const };
    expect(placementNote(peak)).toBe('41 days away · includes Christmas Day · peak travel');
  });
});

describe('bestPlacements (3A: diversity and PTO-aware ranking)', () => {
  it('ranks by total away days WITH the given PTO budget, not the 0-PTO natural total', () => {
    const eligibleFrom = '2026-11-01';
    const eligibleTo = addDays(eligibleFrom, 364);
    const zeroPto = bestPlacements(eligibleFrom, eligibleTo, 4, 0, 0, [], undefined);
    const fivePto = bestPlacements(eligibleFrom, eligibleTo, 4, 5, 0, [], undefined);
    // Same candidate set, but the ranked totals must differ once a PTO budget is applied -
    // this is the structural fix for the headline/card mismatch (K3a/K3b): both numbers
    // come from the exact same extendSabbatical call now, not two different budgets.
    expect(zeroPto.placements[0].totalAwayDays).toBeLessThan(fivePto.placements[0].totalAwayDays);
  });

  it('never returns placements with overlapping core blocks', () => {
    const eligibleFrom = '2026-11-01';
    const eligibleTo = addDays(eligibleFrom, 364);
    const { placements } = bestPlacements(eligibleFrom, eligibleTo, 4, 5, 0, [], undefined);
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i];
        const b = placements[j];
        const overlap = a.start <= b.coreEnd && b.start <= a.coreEnd;
        expect(overlap).toBe(false);
      }
    }
  });

  it('anyHolidayInAnyCandidate is false when nothing in the whole search window has a holiday inside', () => {
    const eligibleFrom = '2026-11-01';
    const eligibleTo = addDays(eligibleFrom, 364);
    const { anyHolidayInAnyCandidate } = bestPlacements(eligibleFrom, eligibleTo, 4, 0, 0, [], undefined);
    expect(anyHolidayInAnyCandidate).toBe(false);
  });

  it('anyHolidayInAnyCandidate is true, and the placement actually containing it reports its name, when a holiday falls inside at least one candidate window', () => {
    const eligibleFrom = '2026-11-01';
    const eligibleTo = addDays(eligibleFrom, 364);
    const holidays = [holiday('2026-12-25', 'Christmas Day')];
    const { anyHolidayInAnyCandidate, placements } = bestPlacements(eligibleFrom, eligibleTo, 4, 0, 0, holidays, 'US');
    expect(anyHolidayInAnyCandidate).toBe(true);
    expect(placements.some((p) => p.holidayNames.includes('Christmas Day'))).toBe(true);
  });

  it('(4C) an unpaid-leave budget extends placements further, and unpaidBefore/After count only unpaid days', () => {
    const eligibleFrom = '2026-11-01';
    const eligibleTo = addDays(eligibleFrom, 364);
    const noUnpaid = bestPlacements(eligibleFrom, eligibleTo, 4, 0, 0, [], undefined);
    const twoWeeksUnpaid = bestPlacements(eligibleFrom, eligibleTo, 4, 0, 2, [], undefined);
    expect(twoWeeksUnpaid.placements[0].totalAwayDays).toBeGreaterThan(noUnpaid.placements[0].totalAwayDays);
    const top = twoWeeksUnpaid.placements[0];
    expect(top.unpaidBefore + top.unpaidAfter).toBeGreaterThan(0);
    expect(top.ptoBefore + top.ptoAfter).toBe(0); // ptoToAdd was 0 - nothing should be PTO
  });
});

describe('paddedCalendarRange (3D: every month the trip touches, plus one either side)', () => {
  it('pads a trip fully inside one month out to the month before and after', () => {
    const { start, end } = paddedCalendarRange('2026-11-10', '2026-11-20');
    expect(start).toBe('2026-10-01');
    expect(end).toBe('2026-12-31');
  });

  it('pads a trip spanning a month boundary out to one month before the first and one after the last', () => {
    const { start, end } = paddedCalendarRange('2026-11-25', '2026-12-10');
    expect(start).toBe('2026-10-01');
    expect(end).toBe('2027-01-31');
  });

  it('handles a year rollover correctly', () => {
    const { start, end } = paddedCalendarRange('2026-12-15', '2026-12-20');
    expect(start).toBe('2026-11-01');
    expect(end).toBe('2027-01-31');
  });
});
