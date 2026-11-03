import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest } from './requestLedger';
import { carryoverSnapshot } from './carryoverSnapshot';

const base: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8,
  accrual: { kind: 'front-loaded', amount: 0, grantDate: '2026-01-01' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'capped', cap: 5 },
  negativeBalanceAllowance: 0, payoutOnLeaving: 'not-sure',
  currentBalance: 12, balanceAsOf: '2026-11-02', plannedDays: [],
};

function leave(id: string, start: string, end = start, status: 'approved' | 'requested' = 'approved') {
  return createPtoRequest({ start, end, status }, { workWeek: DEFAULT_WORK_WEEK, offDays: [] }, id)!;
}

describe('carryover snapshot uses canonical policy projection', () => {
  it('shows pre-reset, carried, forfeited and after-reset amounts without duplicate math', () => {
    const result = carryoverSnapshot(base)!;
    expect(result).toMatchObject({
      unit: 'days', resetDate: '2027-01-01', lastUseDateBeforeReset: '2026-12-31',
      confirmed: { beforeResetBalance: 12, carriedAtReset: 5, forfeitedAtReset: 7, afterResetBalance: 5, creditedOnReset: 0 },
      deadlineNeedsReview: false,
    });
    expect(result.carriedExpiry).toBeUndefined();
  });

  it('never claims forfeiture when all remaining PTO carries without a deadline', () => {
    const result = carryoverSnapshot({ ...base, carryover: { mode: 'all' } })!;
    expect(result.confirmed).toMatchObject({ carriedAtReset: 12, forfeitedAtReset: 0, afterResetBalance: 12 });
    expect(result.carriedExpiry).toBeUndefined();
  });

  it('deduplicates approved leave against policy planned days and separates tentative requests', () => {
    const policy = { ...base, plannedDays: ['2026-12-14'] };
    const result = carryoverSnapshot(policy, [
      leave('approved', '2026-12-14', '2026-12-15'),
      leave('duplicate', '2026-12-15'),
      leave('pending', '2026-12-16', '2026-12-17', 'requested'),
    ])!;
    expect(result.confirmed).toMatchObject({ scheduledThroughReset: 2, beforeResetBalance: 10, carriedAtReset: 5, forfeitedAtReset: 5 });
    expect(result.tentative).toMatchObject({ scheduledThroughReset: 4, beforeResetBalance: 8, carriedAtReset: 5, forfeitedAtReset: 3 });
  });

  it('does not charge approved leave already included in the as-of balance', () => {
    const result = carryoverSnapshot(base, [leave('past', '2026-10-29', '2026-11-02')])!;
    expect(result.confirmed).toMatchObject({ scheduledThroughReset: 0, forfeitedAtReset: 7 });
  });

  it('handles a custom reset and shows the separate grant credited on reset day', () => {
    const policy: TimeOffPolicy = {
      ...base, balanceAsOf: '2026-05-01', planYear: { kind: 'custom', resetDate: '2026-07-01' },
      accrual: { kind: 'front-loaded', amount: 4, grantDate: '2026-07-01' },
      carryover: { mode: 'capped', cap: 3 },
    };
    const result = carryoverSnapshot(policy)!;
    expect(result).toMatchObject({
      resetDate: '2026-07-01', lastUseDateBeforeReset: '2026-06-30',
      confirmed: { beforeResetBalance: 12, carriedAtReset: 3, forfeitedAtReset: 9, creditedOnReset: 4, afterResetBalance: 7 },
    });
  });

  it('preserves native hours and fractional policy balances', () => {
    const result = carryoverSnapshot({ ...base, unit: 'hours', currentBalance: 80.5, carryover: { mode: 'capped', cap: 40.25 } })!;
    expect(result.unit).toBe('hours');
    expect(result.confirmed).toMatchObject({ beforeResetBalance: 80.5, carriedAtReset: 40.25, forfeitedAtReset: 40.25, afterResetBalance: 40.25 });
  });

  it('reports lost accrual due to a cap without treating it as reset forfeiture', () => {
    const policy: TimeOffPolicy = {
      ...base, accrual: { kind: 'per-pay-period', amount: 2, frequency: 'monthly', payDateAnchor: '2026-11-15' },
      accrualCap: 13,
    };
    const result = carryoverSnapshot(policy)!;
    expect(result.confirmed).toMatchObject({
      beforeResetBalance: 13, accruedThroughReset: 1, lostAccrualThroughReset: 3,
      forfeitedAtReset: 8, carriedAtReset: 5, afterResetBalance: 5,
    });
  });

  it('shows existing carried days expiring before the next reset separately', () => {
    const policy: TimeOffPolicy = {
      ...base, currentCarriedBalance: 3, carryover: { mode: 'capped', cap: 5, useByDate: '2026-12-01' },
    };
    const result = carryoverSnapshot(policy)!;
    expect(result.confirmed).toMatchObject({
      carriedExpiredBeforeReset: 3, beforeResetBalance: 9, forfeitedAtReset: 4, carriedAtReset: 5,
    });
    expect(result.deadlineNeedsReview).toBe(true);
    expect(result.carriedExpiry).toBeUndefined();
  });

  it('shows the actual post-reset carried-bank expiry after approved leave on its inclusive deadline', () => {
    const policy: TimeOffPolicy = { ...base, carryover: { mode: 'capped', cap: 5, useByDate: '2027-03-31' } };
    const result = carryoverSnapshot(policy, [leave('last-day', '2027-03-31')])!;
    expect(result.carriedUseByDate).toBe('2027-03-31');
    expect(result.carriedExpiry).toEqual({ confirmed: 4, tentative: 4 });
    expect(result.deadlineNeedsReview).toBe(false);
  });

  it('does not infer carried expiry beyond the next reset cycle', () => {
    const policy: TimeOffPolicy = { ...base, carryover: { mode: 'all', useByDate: '2028-03-31' } };
    const result = carryoverSnapshot(policy)!;
    expect(result.deadlineNeedsReview).toBe(true);
    expect(result.carriedExpiry).toBeUndefined();
  });

  it('reports unfunded requested leave instead of pretending the bank covered it', () => {
    const result = carryoverSnapshot({ ...base, currentBalance: 1, carryover: { mode: 'none' } },
      [leave('too-much', '2026-12-14', '2026-12-16')])!;
    expect(result.confirmed).toMatchObject({ scheduledThroughReset: 3, unfundedThroughReset: 2, forfeitedAtReset: 0 });
  });

  it('does not invent a bank for unlimited PTO or silently accept malformed policies', () => {
    expect(carryoverSnapshot({ ...base, accrual: { kind: 'unlimited', expectedDaysPerYear: 20 } })).toBeNull();
    expect(carryoverSnapshot({ ...base, currentBalance: Number.NaN })).toBeNull();
    expect(carryoverSnapshot({ ...base, currentCarriedBalance: 99 })).toBeNull();
    expect(carryoverSnapshot({ ...base, balanceAsOf: '2026-02-30' })).toBeNull();
  });
});
