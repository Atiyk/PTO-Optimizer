import { describe, it, expect } from 'vitest';
import { alternativeForDate } from './alternativeForDate';
import type { Alternative } from '../solver/types';

function makeAlt(overrides: Partial<Alternative> = {}): Alternative {
  return {
    id: 'alt-1',
    start: '2026-10-25',
    end: '2026-11-01',
    days: [],
    totalDaysOff: 8,
    ptoCost: 4,
    multiplier: 2.0,
    tags: [],
    meanDemand: 1.0,
    replaces: { start: '2026-10-24', end: '2026-11-01' },
    ...overrides,
  };
}

describe('alternativeForDate (regression: an alternative must never claim a day a real break already owns)', () => {
  it('reproduces the found bug: an alternative that replaces a break by shifting it one day later shares most of that break\'s own dates, and those dates must not count as "alternative"', () => {
    const alt = makeAlt({ start: '2026-10-25', end: '2026-11-01', replaces: { start: '2026-10-24', end: '2026-11-01' } });
    const chosenDaySet = new Set(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    // Oct 26 is both a real suggested-PTO day of the primary break AND inside the alternative's own [start,end].
    expect(alternativeForDate('2026-10-26', [alt], chosenDaySet, true)).toBeUndefined();
  });

  it('matches an alternative\'s own start day when it genuinely belongs to no primary break', () => {
    const alt = makeAlt({ start: '2026-10-25', end: '2026-11-01' });
    const chosenDaySet = new Set<string>(); // nothing chosen - e.g. viewing alternatives before any primary exists
    expect(alternativeForDate('2026-10-25', [alt], chosenDaySet, true)).toBe(alt);
  });

  it('returns undefined when alternatives are toggled off, regardless of chosenDaySet', () => {
    const alt = makeAlt();
    expect(alternativeForDate('2026-10-25', [alt], new Set(), false)).toBeUndefined();
  });

  it('returns undefined for a date outside every alternative\'s range', () => {
    const alt = makeAlt({ start: '2026-10-25', end: '2026-10-28' });
    expect(alternativeForDate('2026-12-01', [alt], new Set(), true)).toBeUndefined();
  });
});

describe('alternativeForDate (bug: nearly every day rendered a dashed outline)', () => {
  it('an alternative only ever marks its OWN START DAY, never any other day in its (often multi-day) span - this is what keeps the per-break dashed-cell count bounded, not the solver-side alternatives-per-break cap alone', () => {
    const alt = makeAlt({ start: '2026-10-25', end: '2026-11-15' }); // a 22-day span
    const chosenDaySet = new Set<string>();
    expect(alternativeForDate('2026-10-25', [alt], chosenDaySet, true)).toBe(alt); // the start day: marked
    // Every other day across the full 3-week span: none of them render a dashed cell for
    // this alternative, even though all of them fall within [alt.start, alt.end].
    const otherDaysInSpan = ['2026-10-26', '2026-10-31', '2026-11-05', '2026-11-10', '2026-11-15'];
    for (const iso of otherDaysInSpan) {
      expect(alternativeForDate(iso, [alt], chosenDaySet, true)).toBeUndefined();
    }
  });

  it('with 4 breaks and up to 2 alternatives each (the solver\'s own per-break cap), at most 8 dates in a whole date range ever render a dashed cell - counted directly, not inferred from the cap alone', () => {
    // Four breaks' worth of alternatives, 2 each, each itself a long multi-day span (the
    // exact shape that produced "nearly every day in November and December" before this
    // fix) - 8 alternatives, each 10-20 days long.
    const alternatives: Alternative[] = [];
    let cursor = 1;
    for (let brk = 0; brk < 4; brk++) {
      for (let i = 0; i < 2; i++) {
        const start = `2026-${String(Math.min(12, 10 + Math.floor(cursor / 28))).padStart(2, '0')}-${String(
          (cursor % 28) + 1,
        ).padStart(2, '0')}`;
        alternatives.push(makeAlt({ id: `alt-${brk}-${i}`, start, end: start, replaces: { start, end: start } }));
        cursor += 15; // spread them out across Oct-Dec so spans don't collide
      }
    }
    expect(alternatives.length).toBe(8);

    // Scan a full quarter of actual dates (every day Oct 1 - Dec 31) and count how many
    // render a dashed cell - the real DOM-equivalent check, done against every date in
    // range rather than just the known start dates.
    const allDates: string[] = [];
    for (let m = 10; m <= 12; m++) {
      const days = m === 10 || m === 12 ? 31 : 30;
      for (let d = 1; d <= days; d++) allDates.push(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    const chosenDaySet = new Set<string>();
    const dashedCount = allDates.filter((iso) => alternativeForDate(iso, alternatives, chosenDaySet, true) !== undefined).length;
    expect(dashedCount).toBeLessThanOrEqual(8);
    expect(dashedCount).toBe(8); // every alternative's distinct start day is marked exactly once
  });
});
