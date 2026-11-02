import { describe, it, expect } from 'vitest';
import { resetDatesInRange, payDatesInRange, toLegacySolverFields, type AccrualMethod, type TimeOffPolicy } from './model';

function basePolicy(overrides: Partial<TimeOffPolicy>): TimeOffPolicy {
  return {
    unit: 'days',
    hoursPerDay: 8,
    accrual: { kind: 'front-loaded', amount: 20, grantDate: '2026-01-01' },
    planYear: { kind: 'calendar' },
    carryover: { mode: 'none' },
    negativeBalanceAllowance: 0,
    payoutOnLeaving: 'not-sure',
    currentBalance: 20,
    balanceAsOf: '2026-01-01',
    plannedDays: [],
    ...overrides,
  };
}

describe('resetDatesInRange', () => {
  it('calendar plan year resets every Jan 1 in the window', () => {
    expect(resetDatesInRange({ kind: 'calendar' }, '2026-06-01', '2028-02-01')).toEqual(['2027-01-01', '2028-01-01']);
  });

  it('a custom reset date resets on the same month/day every year', () => {
    expect(resetDatesInRange({ kind: 'custom', resetDate: '2026-04-01' }, '2026-01-01', '2027-06-01')).toEqual(['2026-04-01', '2027-04-01']);
  });

  it('clamps leap-day anniversaries to February 28 in a common year', () => {
    expect(resetDatesInRange({ kind: 'anniversary', startDate: '2024-02-29' }, '2026-01-01', '2028-03-01'))
      .toEqual(['2026-02-28', '2027-02-28', '2028-02-29']);
  });
});

describe('payDatesInRange', () => {
  it('biweekly pay dates step forward from the anchor in exact 14-day increments', () => {
    const accrual: AccrualMethod = { kind: 'per-pay-period', amount: 1, frequency: 'biweekly', payDateAnchor: '2026-01-02' };
    expect(payDatesInRange(accrual, '2026-01-01', '2026-02-13')).toEqual(['2026-01-02', '2026-01-16', '2026-01-30', '2026-02-13']);
  });

  it('semi-monthly pays on the 1st and 16th regardless of anchor', () => {
    const accrual: AccrualMethod = { kind: 'per-pay-period', amount: 1, frequency: 'semi-monthly', payDateAnchor: '2026-01-05' };
    expect(payDatesInRange(accrual, '2026-01-01', '2026-02-01')).toEqual(['2026-01-16', '2026-02-01']);
  });

  it('credits every month when a pay-date anchor is on the 31st', () => {
    const accrual: AccrualMethod = { kind: 'per-pay-period', amount: 1, frequency: 'monthly', payDateAnchor: '2027-01-31' };
    expect(payDatesInRange(accrual, '2027-01-01', '2027-04-30'))
      .toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('keeps February 29 in a leap year for month-end monthly pay', () => {
    const accrual: AccrualMethod = { kind: 'per-pay-period', amount: 1, frequency: 'monthly', payDateAnchor: '2028-01-31' };
    expect(payDatesInRange(accrual, '2028-02-01', '2028-03-01')).toEqual(['2028-02-29']);
  });
});

describe('toLegacySolverFields — interop with the pre-existing /pto flat-annual model', () => {
  it('a front-loaded policy maps to a plain budget with no accrual/expiry', () => {
    const fields = toLegacySolverFields(basePolicy({}), '2026-01-01');
    // front-loaded has no accrualPerMonth or expiryDate equivalent — /pto treats it as the
    // full budget available from day one, unchanged from today's default behaviour.
    expect(fields.budget).toBe(20);
    expect(fields.accrualPerMonth).toBeUndefined();
  });

  it('a biweekly per-pay-period policy maps to the equivalent accrualPerMonth /pto already understands', () => {
    const accrual: AccrualMethod = { kind: 'per-pay-period', amount: 15 / 26, frequency: 'biweekly', payDateAnchor: '2026-01-02' };
    const fields = toLegacySolverFields(basePolicy({ accrual, currentBalance: 0 }), '2026-01-01');
    // 26 periods/year * (15/26) days/period = 15 days/year budget; /12 months = 1.25/month —
    // the exact same 1.25 default /pto's urlState.ts already assumes for accrualPerMonth.
    expect(fields.budget).toBeCloseTo(15, 6);
    expect(fields.accrualPerMonth).toBeCloseTo(1.25, 6);
  });
});
