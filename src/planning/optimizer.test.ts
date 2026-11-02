import { describe, expect, it } from 'vitest';
import { planningStyleSettings, solveConsumer, validatePtoDates } from './optimizer';
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
