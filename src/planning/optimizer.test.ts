import { describe, expect, it } from 'vitest';
import { planningStyleSettings, solveConsumer, solveLegacyConsumer, validatePtoDates } from './optimizer';
import { solve } from '@daysoff/engine/solver/solve';
import { mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import type { SolveInput } from '@daysoff/engine/solver/types';

const input: SolveInput = {
  offDays: ['2027-01-01'], rangeStart: '2027-01-01', rangeEnd: '2027-03-31',
  budget: 10, country: 'US', w: 0,
};

describe('consumer planning styles and minimums', () => {
  it('provides transparent presets and preserves custom controls', () => {
    expect(planningStyleSettings('balanced')).toEqual({ w: 30, breakCount: 3 });
    expect(planningStyleSettings('long-breaks')).toEqual({ w: 20, breakCount: 1 });
    expect(planningStyleSettings('more-breaks')).toEqual({ w: 30, breakCount: 7 });
    expect(planningStyleSettings('custom')).toBeUndefined();
  });

  it('produces feasible, deterministically different long and frequent plans', () => {
    const long = solveConsumer(input, { style: 'long-breaks', minimumBreakDays: 3 });
    const frequent = solveConsumer(input, { style: 'more-breaks', minimumBreakDays: 3 });
    expect(long.issue).toBeUndefined();
    expect(frequent.issue).toBeUndefined();
    expect(long.result.primary).toHaveLength(1);
    expect(frequent.result.primary.length).toBeGreaterThan(1);
    expect(solveConsumer(input, { style: 'more-breaks', minimumBreakDays: 3 })).toEqual(frequent);
    for (const result of [long.result, frequent.result]) {
      expect(result.budgetSpent).toBeLessThanOrEqual(input.budget);
      expect(result.primary.every((brk) => brk.totalDaysOff >= 3)).toBe(true);
    }
  });

  it('explains an impossible minimum without silently relaxing it', () => {
    const value = solveConsumer({ ...input, rangeEnd: '2027-01-03', budget: 1 }, { minimumBreakDays: 5 });
    expect(value.result.primary).toEqual([]);
    expect(value.issue).toContain('at least 5');
  });

  it('does not turn a required isolated day into a shorter-than-requested vacation', () => {
    const value = solveConsumer({
      ...input, rangeStart: '2027-01-04', rangeEnd: '2027-01-08',
      budget: 1, mustIncludeDays: ['2027-01-06'],
    }, { minimumBreakDays: 3 });
    expect(value.result.primary).toEqual([]);
    expect(value.issue).toBeTruthy();
  });

  it('rejects malformed minimums', () => {
    for (const minimumBreakDays of [-1, 0.5, 61, NaN]) {
      expect(solveConsumer(input, { minimumBreakDays }).issue).toContain('minimum break length');
    }
  });
});

describe('realistic consumer acceptance cases', () => {
  const usYear: SolveInput = {
    offDays: ['2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-10-11', '2027-11-11', '2027-11-25', '2027-12-24'],
    rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 15 - 3, country: 'US',
  };

  it('returns meaningful breaks within a 15-day balance minus a three-day reserve', () => {
    const { result, issue } = solveConsumer(usYear, { style: 'balanced', minimumBreakDays: 5 });
    expect(issue).toBeUndefined();
    expect(result.primary.length).toBeGreaterThan(0);
    expect(result.budgetSpent).toBeLessThanOrEqual(12);
    expect(result.primary.every((brk) => brk.totalDaysOff >= 5)).toBe(true);
  });

  it('does not commonly empty realistic monthly-accrual plans', () => {
    for (const accrualPerMonth of [1, 1.25, 2]) {
      const policy = { ...usYear, accrualPerMonth };
      const { result, issue } = solveConsumer(policy, { style: 'balanced', minimumBreakDays: 5 });
      expect(issue).toBeUndefined();
      expect(result.primary.length).toBeGreaterThan(0);
      expect(validatePtoDates(policy, result.primary.flatMap((brk) => brk.days)).valid).toBe(true);
    }
  });

  it('treats unobserved and company-specific holidays as real changes to PTO cost', () => {
    const removed = { ...usYear, offDays: usYear.offDays.filter((date) => date !== '2027-12-24') };
    expect(validatePtoDates(usYear, ['2027-12-24']).ptoDays).toEqual([]);
    expect(validatePtoDates(removed, ['2027-12-24']).ptoDays).toEqual(['2027-12-24']);
    const custom = { ...removed, offDays: [...removed.offDays, '2027-12-23'] };
    expect(validatePtoDates(custom, ['2027-12-23']).ptoDays).toEqual([]);
    expect(solveConsumer(custom, { style: 'balanced', minimumBreakDays: 5 }).issue).toBeUndefined();
  });

  it('supports custom workweeks and a free pinned day without emptying valid plans', () => {
    const workWeek: SolveInput['workWeek'] = [true, true, true, true, false, false, false];
    const custom = solveConsumer({ ...usYear, workWeek }, { style: 'balanced', minimumBreakDays: 5 });
    const freePin = solveConsumer({ ...usYear, mustIncludeDays: ['2027-01-02'] }, { style: 'balanced', minimumBreakDays: 5 });
    expect(custom.issue).toBeUndefined();
    expect(freePin.issue).toBeUndefined();
    expect(custom.result.primary.length).toBeGreaterThan(0);
    expect(freePin.result.primary.length).toBeGreaterThan(0);
    expect(solveConsumer({ ...usYear, budget: 0 }, { minimumBreakDays: 5 }).result.budgetSpent).toBe(0);
  });

  it('shares one actual allocation across expiry and carryover, with or without accrual', () => {
    for (const accrualPerMonth of [undefined, 1, 1.25, 2]) {
      const policy = { ...usYear, accrualPerMonth, expiryDate: '2027-06-30', carryoverCap: 2 };
      const { result, issue } = solveConsumer(policy, { style: 'balanced', minimumBreakDays: 5 });
      expect(issue).toBeUndefined();
      expect(result.primary.length).toBeGreaterThan(0);
      expect(result.budgetSpent).toBeLessThanOrEqual(12);
      expect(validatePtoDates(policy, result.primary.flatMap((brk) => brk.days)).valid).toBe(true);
    }
  });

  it('does not needlessly empty full-carryover or end-of-range expiry plans', () => {
    const plain = solveConsumer(usYear, { style: 'balanced', minimumBreakDays: 5 });
    const fullCarry = solveConsumer({ ...usYear, expiryDate: '2027-06-30', carryoverCap: 12 }, { style: 'balanced', minimumBreakDays: 5 });
    const atEnd = solveConsumer({ ...usYear, expiryDate: '2027-12-31', carryoverCap: 0 }, { style: 'balanced', minimumBreakDays: 5 });
    expect(fullCarry).toEqual(plain);
    expect(atEnd).toEqual(plain);
  });
});

describe('PTO spending is checked on actual dates', () => {
  it('deduplicates PTO and excludes free weekends/employer holidays', () => {
    const value = validatePtoDates(input, ['2027-01-01', '2027-01-02', '2027-01-04', '2027-01-04']);
    expect(value).toEqual({ valid: true, ptoDays: ['2027-01-04'] });
  });

  it('refuses excess required dates instead of using the permissive legacy pinned path', () => {
    const value = solveConsumer({ ...input, budget: 1, mustIncludeDays: ['2027-01-04', '2027-01-05'] });
    expect(value.result.budgetSpent).toBe(0);
    expect(value.issue).toContain('exceed');
  });

  it('rejects leave before accrual even when its break ends after accrual', () => {
    const policy = { ...input, accrualPerMonth: 2 };
    expect(validatePtoDates(policy, ['2027-01-29', '2027-02-01']).valid).toBe(false);
    expect(validatePtoDates(policy, ['2027-02-01', '2027-02-02']).valid).toBe(true);
    expect(validatePtoDates(policy, ['2027-02-01', '2027-02-02', '2027-02-03']).valid).toBe(false);
  });

  it('does not treat carryover as a second allocation', () => {
    const policy = { ...input, budget: 2, expiryDate: '2027-01-31', carryoverCap: 2 };
    expect(validatePtoDates(policy, ['2027-01-04', '2027-02-01']).valid).toBe(true);
    expect(validatePtoDates(policy, ['2027-01-04', '2027-01-05', '2027-02-01']).valid).toBe(false);
  });

  it('expires only the portion beyond the carryover cap at the boundary', () => {
    const policy = { ...input, budget: 10, expiryDate: '2027-01-31', carryoverCap: 1 };
    expect(validatePtoDates(policy, ['2027-01-29', '2027-02-01']).valid).toBe(true);
    expect(validatePtoDates(policy, ['2027-01-29', '2027-02-01', '2027-02-02']).valid).toBe(false);
  });

  it('retains post-expiry accrual separately from carried days', () => {
    const policy = { ...input, budget: 10, accrualPerMonth: 2, expiryDate: '2027-02-01', carryoverCap: 1 };
    expect(validatePtoDates(policy, ['2027-02-01', '2027-02-02', '2027-03-01', '2027-03-02']).valid).toBe(true);
    expect(validatePtoDates(policy, ['2027-02-02', '2027-02-03']).valid).toBe(false);
  });

  it('checks leap-year month anniversaries in UTC', () => {
    const policy = { ...input, rangeStart: '2028-01-29', rangeEnd: '2028-03-31', accrualPerMonth: 2 };
    expect(validatePtoDates(policy, ['2028-02-28']).valid).toBe(false);
    expect(validatePtoDates(policy, ['2028-02-29']).valid).toBe(true);
  });

  it('tolerates floating-point accrual credit without relaxing the total balance cap', () => {
    // Mathematically 29 days, but JavaScript multiplication is a few ulps below it.
    expect(0.58 * 50).toBeLessThan(29);
    const dates = rangeISO('2027-01-20', '2027-03-01').filter((date) => mondayIndexedDow(date) < 5);
    expect(dates).toHaveLength(29);
    const policy: SolveInput = {
      offDays: [], rangeStart: '2023-01-01', rangeEnd: '2027-03-31',
      budget: 29, accrualPerMonth: 0.58,
    };
    expect(validatePtoDates(policy, dates).valid).toBe(true);
    expect(validatePtoDates({ ...policy, budget: 0.58 * 50 }, dates).valid).toBe(false);
  });

  it('honors blackouts, the custom workweek, and the peak cap', () => {
    expect(validatePtoDates({ ...input, blackouts: ['2027-01-04'] }, ['2027-01-04']).valid).toBe(false);
    expect(validatePtoDates({ ...input, workWeek: [false, true, true, true, true, true, false] }, ['2027-01-04']).ptoDays).toEqual([]);
    const peakCap = { enabled: true, startDate: '2027-01-01', endDate: '2027-01-31', maxDays: 1 };
    expect(validatePtoDates({ ...input, peakCap }, ['2027-01-04', '2027-01-05']).valid).toBe(false);
  });

  it('rejects invalid dates and required-date conflicts', () => {
    expect(validatePtoDates(input, ['2027-02-30']).valid).toBe(false);
    expect(validatePtoDates(input, ['2026-12-31']).valid).toBe(false);
    expect(validatePtoDates({ ...input, mustIncludeDays: ['2027-01-04'] }, []).valid).toBe(false);
    expect(validatePtoDates({ ...input, mustIncludeDays: ['2027-01-04'], blackouts: ['2027-01-04'] }, []).valid).toBe(false);
  });
});

describe('legacy consumer URLs keep valid plans and repair unsafe outcomes', () => {
  it('keeps complete valid legacy results exactly without adding minimums or presets', () => {
    const examples: SolveInput[] = [
      input,
      { ...input, breakCount: 1, w: 70, blackouts: ['2027-01-15'] },
      { ...input, breakCount: 7, w: 20, workWeek: [true, true, true, true, false, false, false] },
      { ...input, budget: 0 },
      { ...input, mustIncludeDays: ['2027-01-02'] },
      { ...input, offDays: ['2027-01-04', '2027-02-15'] },
      { ...input, budget: 4, accrualPerMonth: 4, breakCount: 1, blackouts: rangeISO('2027-01-01', '2027-01-31') },
      { ...input, expiryDate: '2027-03-31', carryoverCap: 0 },
    ];
    for (const example of examples) {
      const legacy = solve(example);
      expect(validatePtoDates(example, legacy.primary.flatMap((brk) => brk.days)).valid).toBe(true);
      for (const alternative of legacy.alternatives) {
        const remaining = legacy.primary.filter((brk) => brk.start !== alternative.replaces.start || brk.end !== alternative.replaces.end);
        expect(validatePtoDates(example, [...remaining, alternative].flatMap((brk) => brk.days)).valid).toBe(true);
      }
      const safe = solveLegacyConsumer(example);
      expect(safe.issue).toBeUndefined();
      expect(safe.result).toEqual(legacy);
      expect(JSON.stringify(safe.result)).toBe(JSON.stringify(legacy));
    }
  });

  it('removes unfunded early alternatives while preserving the valid funded primary', () => {
    const policy: SolveInput = {
      offDays: ['2027-02-15'], rangeStart: '2027-01-01', rangeEnd: '2027-03-31',
      budget: 2, accrualPerMonth: 1.25, w: 10, breakCount: 1, country: 'US',
    };
    const legacy = solve(policy);
    // Fri Feb 26-Mon Mar 1 (2 PTO, 4 days) ties the old Mar 4-7 and starts earlier; it
    // is funded day by day (1.25 earned by Feb 26, 2.5 by Mar 1).
    expect(legacy.primary[0].start).toBe('2027-02-26');
    // The legacy alternatives fall in January, before any PTO has accrued.
    expect(legacy.alternatives.length).toBeGreaterThan(0);
    expect(legacy.alternatives.every((alternative) => alternative.start < '2027-02-01')).toBe(true);
    const safe = solveLegacyConsumer(policy);
    expect(safe.issue).toBeUndefined();
    expect(safe.result.primary).toEqual(legacy.primary);
    expect(safe.result.budgetSpent).toBe(legacy.budgetSpent);
    expect(safe.result.breakCountActual).toBe(legacy.breakCountActual);
    expect(safe.result.breakCountRequested).toBe(legacy.breakCountRequested);
    expect(safe.result.peakCapApplied).toBe(legacy.peakCapApplied);
    expect(safe.result.alternatives).toEqual([]);
  });

  it('returns an explicit issue when required legacy pins exceed the balance', () => {
    const policy = { ...input, budget: 2, mustIncludeDays: ['2027-01-04', '2027-01-05', '2027-01-06'] };
    expect(solve(policy).budgetSpent).toBeGreaterThan(policy.budget);
    const safe = solveLegacyConsumer(policy);
    expect(safe.result.primary).toEqual([]);
    expect(safe.result.budgetSpent).toBe(0);
    expect(safe.issue).toContain('exceed');
  });

  it('moves an endpoint-funded legacy break to actual funded working dates', () => {
    const policy: SolveInput = {
      offDays: [], rangeStart: '2026-01-01', rangeEnd: '2026-02-08',
      budget: 4, accrualPerMonth: 4, breakCount: 1, w: 0,
      blackouts: rangeISO('2026-01-01', '2026-01-26'),
    };
    const legacy = solve(policy);
    expect(validatePtoDates(policy, legacy.primary.flatMap((brk) => brk.days)).valid).toBe(false);
    const safe = solveLegacyConsumer(policy);
    expect(safe.issue).toBeUndefined();
    expect(safe.result.primary.length).toBeGreaterThan(0);
    expect(safe.result.budgetSpent).toBeLessThanOrEqual(policy.budget);
    expect(validatePtoDates(policy, safe.result.primary.flatMap((brk) => brk.days)).valid).toBe(true);
    expect(safe.result.breakCountRequested).toBe(1);
  });

  it('explains an empty result when the legacy plan spends accrual that never arrives', () => {
    const policy = { ...input, accrualPerMonth: 0 };
    expect(solve(policy).budgetSpent).toBeGreaterThan(0);
    const safe = solveLegacyConsumer(policy);
    expect(safe.result.primary).toEqual([]);
    expect(safe.result.budgetSpent).toBe(0);
    expect(safe.issue).toContain('accrued PTO');
  });

  it('repairs the legacy carryover double allocation within the original budget', () => {
    const policy: SolveInput = {
      offDays: [], rangeStart: '2026-02-01', rangeEnd: '2026-03-31',
      budget: 5, expiryDate: '2026-02-15', carryoverCap: 20, breakCount: 1, w: 0,
    };
    expect(solve(policy).budgetSpent).toBeGreaterThan(policy.budget);
    const safe = solveLegacyConsumer(policy);
    expect(safe.issue).toBeUndefined();
    expect(safe.result.primary.length).toBeGreaterThan(0);
    expect(safe.result.budgetSpent).toBeLessThanOrEqual(policy.budget);
    expect(validatePtoDates(policy, safe.result.primary.flatMap((brk) => brk.days)).valid).toBe(true);
    expect(safe.result.breakCountRequested).toBe(1);
  });
});
