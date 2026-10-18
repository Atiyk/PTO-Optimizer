import { describe, it, expect } from 'vitest';
import { computeMarginalValues, marginalValue } from './marginalValue';
import type { Break, SolveInput } from './types';

function fakeBreak(start: string, end: string, days: string[]): Break {
  return {
    id: `${start}|${end}`,
    start,
    end,
    days,
    totalDaysOff: days.length,
    ptoCost: 1,
    multiplier: days.length,
    tags: [],
    meanDemand: 1,
  };
}

function baseInput(overrides: Partial<SolveInput> = {}): SolveInput {
  return {
    offDays: [],
    rangeStart: '2026-01-01',
    rangeEnd: '2026-01-31',
    budget: 10,
    ...overrides,
  };
}

describe('computeMarginalValues', () => {
  it('a day adjacent to an already-suggested day gains only the new days, not the whole run length', () => {
    // Sat Jan3, Sun Jan4 (weekend, free), Mon Jan5 (already suggested PTO) -> qualifying run of 3.
    const primary = [fakeBreak('2026-01-03', '2026-01-05', ['2026-01-03', '2026-01-04', '2026-01-05'])];
    const result = marginalValue('2026-01-06', baseInput(), primary); // Tuesday
    expect(result).not.toBeNull();
    expect(result!.deltaDays).toBe(1); // not 4 (the naive "length of the run it would sit in")
    expect(result!.multiplier).toBe(1);
  });

  it('an isolated workday with no adjacent off days gains exactly 1 day', () => {
    const result = marginalValue('2026-01-07', baseInput(), []); // Wednesday, no holidays, no plan
    expect(result).toEqual({ deltaDays: 1, ptoCost: 1, multiplier: 1 });
  });

  it('a Friday before a free weekend gains the whole bridged stretch', () => {
    const result = marginalValue('2026-01-09', baseInput(), []); // Friday, Sat-Sun free after
    expect(result).toEqual({ deltaDays: 3, ptoCost: 1, multiplier: 3 });
  });

  it('bridging two separate existing qualifying runs only credits the bridging day', () => {
    // Mon Jan5 already suggested (run: just Jan5, length 1, qualifying).
    // Wed Jan7 already suggested (run: just Jan7, length 1, qualifying).
    // Hovering Tue Jan6 bridges them: new run = Jan5,6,7 (length 3), already counted = 1+1 = 2.
    const primary = [fakeBreak('2026-01-05', '2026-01-05', ['2026-01-05']), fakeBreak('2026-01-07', '2026-01-07', ['2026-01-07'])];
    const result = marginalValue('2026-01-06', baseInput(), primary);
    expect(result!.deltaDays).toBe(1);
  });

  it('skips blackout days', () => {
    const result = marginalValue('2026-01-07', baseInput({ blackouts: ['2026-01-07'] }), []);
    expect(result).toBeNull();
  });

  it('skips days already off (weekend/holiday) or already suggested', () => {
    const map = computeMarginalValues(baseInput({ offDays: ['2026-01-01'] }), []);
    expect(map.has('2026-01-03')).toBe(false); // Saturday, baseline off
    expect(map.has('2026-01-01')).toBe(false); // holiday

    const primary = [fakeBreak('2026-01-05', '2026-01-05', ['2026-01-05'])];
    const map2 = computeMarginalValues(baseInput(), primary);
    expect(map2.has('2026-01-05')).toBe(false); // already suggested
  });

  it('skips days outside the range', () => {
    const map = computeMarginalValues(baseInput({ rangeStart: '2026-01-05', rangeEnd: '2026-01-10' }), []);
    expect(map.has('2026-01-01')).toBe(false);
    expect(map.has('2026-02-01')).toBe(false);
  });
});
