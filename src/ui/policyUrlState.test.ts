import { describe, it, expect } from 'vitest';
import { defaultPolicyURLState, readPolicyStateFromURL, writePolicyStateToURL, type PolicyURLState } from './policyUrlState';

function roundTrip(state: PolicyURLState): PolicyURLState {
  const params = new URLSearchParams();
  writePolicyStateToURL(params, state);
  return readPolicyStateFromURL(`?${params.toString()}`, state.country);
}

describe('/policy URL round-trip (Stage 4A follow-through)', () => {
  it('the default state round-trips exactly', () => {
    const state = defaultPolicyURLState();
    expect(roundTrip(state)).toEqual(state);
  });

  it('a front-loaded + capped-carryover policy (S1-shaped) round-trips exactly', () => {
    const state: PolicyURLState = {
      ...defaultPolicyURLState(),
      accrualKind: 'front-loaded',
      amount: 20,
      grantDate: '2026-01-01',
      carryoverMode: 'capped',
      carryoverCap: 5,
      currentBalance: 12,
      balanceAsOf: '2026-10-28',
      country: 'US',
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it('a per-pay-period biweekly policy with a cap (S2-shaped) round-trips exactly', () => {
    const state: PolicyURLState = {
      ...defaultPolicyURLState(),
      accrualKind: 'per-pay-period',
      amount: 15 / 26,
      frequency: 'biweekly',
      payDateAnchor: '2026-11-02',
      accrualCapEnabled: true,
      accrualCap: 22.5,
      currentBalance: 21,
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it('hours mode (S3-shaped) round-trips exactly', () => {
    const state: PolicyURLState = {
      ...defaultPolicyURLState(),
      unit: 'hours',
      hoursPerDay: 7.5,
      accrualKind: 'per-pay-period',
      amount: 4.62,
      frequency: 'biweekly',
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it('a carryover use-by date distinct from the reset (S4-shaped) round-trips exactly', () => {
    const state: PolicyURLState = {
      ...defaultPolicyURLState(),
      carryoverMode: 'capped',
      carryoverCap: 10,
      carryoverUseByEnabled: true,
      carryoverUseBy: '2027-03-31',
      currentBalance: 10,
      balanceAsOf: '2026-12-20',
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it('unlimited PTO (S5-shaped) round-trips exactly', () => {
    const state: PolicyURLState = { ...defaultPolicyURLState(), accrualKind: 'unlimited', expectedDaysPerYear: 15 };
    expect(roundTrip(state)).toEqual(state);
  });

  it('planned days, a waiting period, a negative-balance allowance, and an anniversary plan year all round-trip together', () => {
    const state: PolicyURLState = {
      ...defaultPolicyURLState(),
      planYearKind: 'anniversary',
      anniversaryStart: '2026-06-15',
      waitingPeriodEnabled: true,
      waitingPeriodDays: 90,
      negativeBalanceAllowance: 3,
      plannedDays: ['2026-11-02', '2026-11-03', '2026-12-25'],
      payoutOnLeaving: 'pays',
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it('a custom plan year reset date round-trips exactly', () => {
    const state: PolicyURLState = { ...defaultPolicyURLState(), planYearKind: 'custom', customResetDate: '2026-06-30' };
    expect(roundTrip(state)).toEqual(state);
  });

  it('an unrelated query param (e.g. the glossary hand-off ?highlight=) is left untouched', () => {
    const params = new URLSearchParams('highlight=accrual-cap');
    writePolicyStateToURL(params, defaultPolicyURLState());
    expect(params.get('highlight')).toBe('accrual-cap');
  });
});
