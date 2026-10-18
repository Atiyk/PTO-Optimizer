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

  it('still matches a day that genuinely belongs to no primary break', () => {
    const alt = makeAlt({ start: '2026-10-25', end: '2026-11-01' });
    const chosenDaySet = new Set<string>(); // nothing chosen - e.g. viewing alternatives before any primary exists
    expect(alternativeForDate('2026-10-26', [alt], chosenDaySet, true)).toBe(alt);
  });

  it('returns undefined when alternatives are toggled off, regardless of chosenDaySet', () => {
    const alt = makeAlt();
    expect(alternativeForDate('2026-10-26', [alt], new Set(), false)).toBeUndefined();
  });

  it('returns undefined for a date outside every alternative\'s range', () => {
    const alt = makeAlt({ start: '2026-10-25', end: '2026-10-28' });
    expect(alternativeForDate('2026-12-01', [alt], new Set(), true)).toBeUndefined();
  });
});
