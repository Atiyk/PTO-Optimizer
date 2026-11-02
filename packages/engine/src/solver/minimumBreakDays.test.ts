import { describe, expect, it } from 'vitest';
import { solve } from './solve';
import type { SolveInput } from './types';

const input: SolveInput = {
  offDays: ['2027-01-01'], rangeStart: '2027-01-01', rangeEnd: '2027-02-28',
  budget: 7, country: 'US', w: 0,
};

describe('optional minimum break length', () => {
  it('changes the candidate selection rather than hiding shorter results after solving', () => {
    const original = solve(input);
    const constrained = solve({ ...input, minimumBreakDays: 5 });
    expect(original.primary.some((brk) => brk.totalDaysOff < 5)).toBe(true);
    expect(constrained.primary.length).toBeGreaterThan(0);
    expect(constrained.primary.every((brk) => brk.totalDaysOff >= 5)).toBe(true);
    expect(constrained.alternatives.every((brk) => brk.totalDaysOff >= 5)).toBe(true);
    expect(constrained.budgetSpent).toBeLessThanOrEqual(input.budget);
    expect(constrained.primary.some((brk) => !original.primary.some((old) => old.id === brk.id))).toBe(true);
  });

  it('leaves PTO unspent when no qualifying break can absorb it', () => {
    const result = solve({ offDays: [], rangeStart: '2027-01-04', rangeEnd: '2027-01-06', budget: 2, minimumBreakDays: 5 });
    expect(result.primary).toEqual([]);
    expect(result.budgetSpent).toBe(0);
  });

  it('keeps the exact legacy result when the option is omitted, zero, or one', () => {
    const cases: SolveInput[] = [
      input,
      { ...input, breakCount: 1, blackouts: ['2027-01-15'] },
      { ...input, breakCount: 7, workWeek: [true, true, true, true, false, false, false] },
      { ...input, budget: 3, accrualPerMonth: 2 },
      { ...input, expiryDate: '2027-01-31', carryoverCap: 1 },
      { ...input, mustIncludeDays: ['2027-02-03'] },
      { ...input, peakCap: { enabled: true, startDate: '2027-01-01', endDate: '2027-01-31', maxDays: 2 } },
    ];
    for (const example of cases) {
      const legacy = JSON.stringify(solve(example));
      expect(JSON.stringify(solve({ ...example, minimumBreakDays: 0 }))).toBe(legacy);
      expect(JSON.stringify(solve({ ...example, minimumBreakDays: 1 }))).toBe(legacy);
    }
  });

  it('never ignores a blackout while finding a longer candidate', () => {
    const result = solve({ ...input, minimumBreakDays: 5, blackouts: ['2027-01-15', '2027-02-12'] });
    expect(result.primary.flatMap((brk) => brk.days)).not.toContain('2027-01-15');
    expect(result.primary.flatMap((brk) => brk.days)).not.toContain('2027-02-12');
  });

  it('keeps omitted/zero/one byte-identical across small deterministic B2B-style fixtures', () => {
    for (let fixture = 0; fixture < 18; fixture++) {
      const example: SolveInput = {
        offDays: fixture % 2 ? ['2028-02-21'] : ['2028-02-14', '2028-02-21'],
        rangeStart: '2028-02-01', rangeEnd: '2028-03-15', budget: fixture % 5 + 1,
        country: ['US', 'GB', 'DE'][fixture % 3],
        w: fixture % 6 * 20, breakCount: fixture % 8,
        workWeek: fixture % 3 === 0 ? [true, true, true, true, false, false, false] : undefined,
        blackouts: fixture % 4 === 0 ? ['2028-02-11'] : [],
        mustIncludeDays: fixture % 5 === 0 ? ['2028-02-09'] : [],
        accrualPerMonth: fixture % 6 === 0 ? 3 : undefined,
        expiryDate: fixture % 7 === 0 ? '2028-02-29' : undefined,
        carryoverCap: fixture % 7 === 0 ? 1 : undefined,
      };
      const omitted = JSON.stringify(solve(example));
      expect(JSON.stringify(solve({ ...example, minimumBreakDays: 0 }))).toBe(omitted);
      expect(JSON.stringify(solve({ ...example, minimumBreakDays: 1 }))).toBe(omitted);
    }
  });
});
