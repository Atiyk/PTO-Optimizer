import { describe, expect, it } from 'vitest';
import { explainPlan } from './planExplanation';

describe('explainPlan', () => {
  it('uses the actual solved totals, never a fabricated percentile or holiday', () => {
    const result = explainPlan({ budgetSpent: 1, totalDaysOff: 4, weighting: 30 });
    expect(result?.calendar).toContain('3 days');
    expect(result?.calendar).toContain('do not use additional PTO');
    expect(result?.preference).toContain('30/100');
    expect(JSON.stringify(result)).not.toMatch(/percentile|Thanksgiving|guaranteed/i);
  });

  it('uses singular grammar for one calendar day already off', () => {
    expect(explainPlan({ budgetSpent: 2, totalDaysOff: 3, weighting: 0 })?.calendar)
      .toContain('1 day in this plan does not use additional PTO');
  });

  it('is honest when a travel-oriented plan has no extra calendar days', () => {
    const result = explainPlan({ budgetSpent: 4, totalDaysOff: 4, weighting: 100 });
    expect(result?.calendar).toContain('does not gain extra calendar days');
    expect(result?.preference).toContain('quieter travel periods');
  });

  it('never claims that the solver used fewer PTO days than a broken input reports', () => {
    const result = explainPlan({ budgetSpent: 6, totalDaysOff: 4, weighting: 50 });
    expect(result?.calendar).toContain('does not gain extra calendar days');
    expect(result?.calendar).not.toContain('-2');
  });

  it('returns no explanation for zero, invalid or non-finite solved totals', () => {
    expect(explainPlan({ budgetSpent: 0, totalDaysOff: 0, weighting: 20 })).toBeNull();
    expect(explainPlan({ budgetSpent: 0, totalDaysOff: NaN, weighting: 20 })).toBeNull();
    expect(explainPlan({ budgetSpent: Infinity, totalDaysOff: 4, weighting: 20 })).toBeNull();
  });

  it('clamps invalid preference values rather than presenting a fabricated range', () => {
    expect(explainPlan({ budgetSpent: 1, totalDaysOff: 2, weighting: -10 })?.preference).toContain('prioritizes total days off');
    expect(explainPlan({ budgetSpent: 1, totalDaysOff: 2, weighting: 200 })?.preference).toContain('quieter travel periods');
  });
});
