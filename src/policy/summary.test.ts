import { describe, expect, it } from 'vitest';
import type { TimeOffPolicy } from './model';
import { generatePolicySummary } from './summary';

const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, accrual: { kind: 'per-pay-period', amount: 1.25, frequency: 'monthly', payDateAnchor: '2027-01-15' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'all' }, negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure', currentBalance: 12, balanceAsOf: '2027-02-01', plannedDays: [],
};

describe('policy explanations stay consistent with native units and expiration rules', () => {
  it('describes an hourly-work accrual rate in hours even when balances are displayed in days', () => {
    const lines = generatePolicySummary({ ...policy, accrual: { kind: 'per-hour-worked', rate: 0.0625, typicalWeeklyHours: 40 } });
    expect(lines[0]).toBe('You earn about 0.06 hours of PTO for every hour worked.');
    expect(lines[0]).not.toContain('0.06 days');
  });
  it('preserves native-hour and native-day pay-period explanations', () => {
    expect(generatePolicySummary(policy)[0]).toContain('1.25 days every month');
    expect(generatePolicySummary({ ...policy, unit: 'hours' })[0]).toContain('1.25 hours every month');
  });
  it('describes an accrual pause without denying an existing balance above the cap', () => {
    const summary = generatePolicySummary({ ...policy, currentBalance: 25, accrualCap: 20 }).join(' ');
    expect(summary).toContain('At a balance of 20 days, new PTO accrual pauses until your balance drops below the cap.');
    expect(summary).not.toContain("can't go above");
  });
  it('explains a separate carried deadline for full carryover without treating the entire bank as expiring', () => {
    const lines = generatePolicySummary({ ...policy, currentCarriedBalance: 3, carryover: { mode: 'all', useByDate: '2027-03-31' } });
    expect(lines).toContain('Everything carries over at your annual reset.');
    expect(lines).toContain('Your current balance includes 3 days of carried PTO.');
    expect(lines).toContain('Carried-over PTO must be used by 2027-03-31, or the remaining carried portion expires.');
    expect(lines.join(' ')).not.toContain('12 days');
  });
  it('explains a capped carryover and its deadline exactly once', () => {
    const lines = generatePolicySummary({ ...policy, carryover: { mode: 'capped', cap: 5, useByDate: '2027-03-31' } });
    expect(lines.some((line) => line.includes('up to 5 days'))).toBe(true);
    expect(lines.filter((line) => line.includes('2027-03-31'))).toHaveLength(1);
  });
  it('does not describe stale carryover fields as a finite balance under unlimited PTO', () => {
    const lines = generatePolicySummary({ ...policy, accrual: { kind: 'unlimited', expectedDaysPerYear: 20 }, currentCarriedBalance: 3, negativeBalanceAllowance: 2,
      carryover: { mode: 'capped', cap: 5, useByDate: '2027-03-31' } });
    expect(lines).toEqual(["Your PTO is unlimited — there's no fixed number of days, and no balance to track."]);
  });
  it('does not turn an invalid carried portion into a factual expiration explanation', () => {
    const lines = generatePolicySummary({ ...policy, currentCarriedBalance: 99, carryover: { mode: 'all', useByDate: '2027-03-31' } });
    expect(lines.some((line) => line.includes('99'))).toBe(false);
    expect(lines.some((line) => line.includes('2027-03-31'))).toBe(false);
  });
});
