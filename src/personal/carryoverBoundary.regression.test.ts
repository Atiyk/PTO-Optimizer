import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest } from './requestLedger';
import { carryoverSnapshot } from './carryoverSnapshot';

const policy: TimeOffPolicy = {
  unit: 'days',
  hoursPerDay: 8,
  accrual: { kind: 'front-loaded', amount: 0, grantDate: '2026-01-01' },
  planYear: { kind: 'calendar' },
  carryover: { mode: 'capped', cap: 5, useByDate: '2027-03-31' },
  negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure',
  currentBalance: 12,
  balanceAsOf: '2026-11-02',
  plannedDays: [],
};

describe('carryover boundary and scenario regressions', () => {
  it('does not debit confirmed carryover for a merely requested day on the inclusive deadline', () => {
    const pending = createPtoRequest(
      { start: '2027-03-31', end: '2027-03-31', status: 'requested' },
      { workWeek: DEFAULT_WORK_WEEK, offDays: [] },
      'pending-deadline',
    );
    expect(pending).not.toBeNull();
    const result = carryoverSnapshot(policy, pending ? [pending] : []);
    expect(result?.carriedUseByDate).toBe('2027-03-31');
    expect(result?.carriedExpiry).toEqual({ confirmed: 5, tentative: 4 });
    expect(result?.confirmed.scheduledThroughReset).toBe(0);
  });

  it('marks a deadline on the reset itself as ambiguous rather than projecting an expiry', () => {
    const result = carryoverSnapshot({
      ...policy,
      carryover: { mode: 'capped', cap: 5, useByDate: '2027-01-01' },
    });
    expect(result?.resetDate).toBe('2027-01-01');
    expect(result?.deadlineNeedsReview).toBe(true);
    expect(result?.carriedUseByDate).toBeUndefined();
    expect(result?.carriedExpiry).toBeUndefined();
  });

  it('preserves reset arithmetic when the balance date is the last day of a leap year', () => {
    const result = carryoverSnapshot({
      ...policy,
      balanceAsOf: '2028-12-31',
      carryover: { mode: 'capped', cap: 5 },
    });
    expect(result?.resetDate).toBe('2029-01-01');
    expect(result?.lastUseDateBeforeReset).toBe('2028-12-31');
    expect(result?.confirmed).toMatchObject({
      beforeResetBalance: 12,
      carriedAtReset: 5,
      forfeitedAtReset: 7,
      afterResetBalance: 5,
    });
  });
});
