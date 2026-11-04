import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest } from './requestLedger';
import { explainConnectedPolicy, type PolicyRuleId } from './policyExplanation';

const base: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8,
  accrual: { kind: 'per-pay-period', amount: 1.25, frequency: 'monthly', payDateAnchor: '2027-01-15' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'all' },
  negativeBalanceAllowance: 0, payoutOnLeaving: 'not-sure',
  currentBalance: 5, balanceAsOf: '2027-01-01', plannedDays: [],
};

const explain = (policy: TimeOffPolicy = base, through = '2027-01-31') =>
  explainConnectedPolicy(policy, through);

function rule(result: NonNullable<ReturnType<typeof explainConnectedPolicy>>, id: PolicyRuleId) {
  return result.rules.find((entry) => entry.id === id)!;
}

const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [] };
function request(id: string, date: string, status: 'approved' | 'planned' | 'requested', note = '') {
  return createPtoRequest({ start: date, end: date, status, note }, calendar, id)!;
}

describe('connected policy explanation uses canonical forecast events only', () => {
  it('rejects invalid horizons instead of presenting a zero balance', () => {
    expect(explain(base, '2026-12-31')).toBeNull();
    expect(explain(base, 'not-a-date')).toBeNull();
  });

  it('explains each configured policy rule with an HR question and real guide destination', () => {
    const result = explain()!;
    expect(result.rules.map((entry) => entry.id)).toEqual([
      'accrual', 'balance-cap', 'plan-year', 'carryover', 'carried-expiration',
      'scheduled-leave', 'waiting-period', 'negative-balance', 'departure-payout',
    ]);
    expect(result.rules.every((entry) => entry.explanation && entry.example && entry.hrQuestion
      && entry.guidePath === '/glossary')).toBe(true);
  });

  it('uses the pay-date trace rather than daily pro-rating', () => {
    expect(rule(explain(base, '2027-01-14')!, 'accrual').impact.amount).toBe(0);
    const result = explain(base, '2027-01-15')!;
    expect(result.confirmedAccrued).toBe(1.25);
    expect(rule(result, 'accrual').impact.amount).toBe(1.25);
    expect(result.confirmedBalance).toBe(6.25);
  });

  it('reports only actual blocked accrual at a balance cap', () => {
    const result = explain({ ...base, currentBalance: 4.5, accrualCap: 5 }, '2027-01-15')!;
    expect(result.confirmedLostAccrual).toBe(0.75);
    expect(result.confirmedAccrued).toBe(0.5);
    expect(rule(result, 'balance-cap').impact).toMatchObject({ kind: 'observed', amount: 0.75 });
    expect(result.confirmedBalance).toBe(5);
  });

  it('does not invent a cap impact when no cap is entered', () => {
    const result = explain()!;
    expect(rule(result, 'balance-cap').impact).toMatchObject({ kind: 'configured' });
    expect(rule(result, 'balance-cap').impact.amount).toBeUndefined();
  });

  it('uses reset events to distinguish carried and forfeited balances', () => {
    const policy: TimeOffPolicy = {
      ...base, currentBalance: 12, balanceAsOf: '2027-12-30',
      accrual: { kind: 'front-loaded', amount: 20, grantDate: '2027-01-01' },
      carryover: { mode: 'capped', cap: 5 },
    };
    const result = explain(policy, '2028-01-02')!;
    expect(result.confirmedExpired).toBe(7);
    expect(rule(result, 'plan-year').impact.date).toBe('2028-01-01');
    expect(rule(result, 'carryover').impact).toMatchObject({ kind: 'observed', amount: 5 });
    expect(rule(result, 'carryover').impact.detail).toContain('7 days');
  });

  it('does not claim a carryover happened when the horizon precedes the reset', () => {
    const result = explain(base, '2027-06-01')!;
    expect(rule(result, 'carryover').impact.kind).toBe('configured');
    expect(rule(result, 'plan-year').impact.date).toBeUndefined();
  });

  it('separates carried-bank expiration from a plan-year reset', () => {
    const result = explain({
      ...base, currentCarriedBalance: 2,
      carryover: { mode: 'all', useByDate: '2027-02-01' },
    }, '2027-02-02')!;
    expect(rule(result, 'carried-expiration').impact).toMatchObject({
      kind: 'observed', amount: 2, date: '2027-02-01',
    });
    expect(result.confirmedExpired).toBe(2);
  });

  it('deduplicates policy-planned and approved leave, keeping tentative separate', () => {
    const result = explainConnectedPolicy({
      ...base, plannedDays: ['2027-01-05'],
    }, '2027-01-10', [
      request('approved', '2027-01-05', 'approved'),
      request('planned', '2027-01-05', 'planned'),
      request('requested', '2027-01-06', 'requested'),
    ])!;
    expect(result.confirmedScheduled).toBe(1);
    expect(result.tentativeAdditionalScheduled).toBe(1);
    expect(result.confirmedBalance).toBe(4);
    expect(result.tentativeBalance).toBe(3);
  });

  it('does not charge leave on or before the as-of balance date', () => {
    const result = explain({
      ...base, plannedDays: ['2027-01-01', '2027-01-05'],
    }, '2027-01-06')!;
    expect(result.confirmedScheduled).toBe(1);
  });

  it('preserves hours and does not convert scheduled hours into days', () => {
    const result = explain({
      ...base, unit: 'hours', hoursPerDay: 7.5, currentBalance: 12,
      plannedDays: ['2027-01-05'],
    }, '2027-01-06')!;
    expect(result.unit).toBe('hours');
    expect(result.confirmedScheduled).toBe(7.5);
    expect(result.confirmedBalance).toBe(4.5);
  });

  it('discloses that waiting periods are informational, not enforced', () => {
    const result = explain({ ...base, waitingPeriodDays: 10 }, '2027-01-12')!;
    expect(rule(result, 'waiting-period').impact.date).toBe('2027-01-11');
    expect(rule(result, 'waiting-period').explanation).toContain('does not block');
    expect(result.caveats.some((caveat) => caveat.includes('not enforced'))).toBe(true);
  });

  it('discloses unfunded requests rather than implying all scheduled units were deducted', () => {
    const result = explain({
      ...base, currentBalance: 0, plannedDays: ['2027-01-05', '2027-01-06'],
    }, '2027-01-06')!;
    expect(result.confirmedScheduled).toBe(2);
    expect(result.confirmedBalance).toBe(0);
    expect(result.confirmedUnfunded).toBe(2);
    expect(rule(result, 'negative-balance').impact.amount).toBe(2);
  });

  it('never labels a user-entered payout policy as legally verified', () => {
    for (const setting of ['pays', 'doesnt', 'not-sure'] as const) {
      const result = explain({ ...base, payoutOnLeaving: setting })!;
      const payout = rule(result, 'departure-payout');
      expect(payout.impact.kind).toBe('not-projected');
      expect(payout.explanation).toContain(setting === 'not-sure' ? 'unknown' : 'assumption');
      expect(result.caveats[0]).toContain('not verified');
    }
  });

  it('keeps unlimited PTO unbanked rather than fabricating a monetary balance', () => {
    const result = explain({
      ...base, accrual: { kind: 'unlimited', expectedDaysPerYear: 20 },
      currentBalance: 0,
    })!;
    expect(result.currentBalance).toBeNull();
    expect(result.confirmedBalance).toBeNull();
    expect(rule(result, 'accrual').impact).toMatchObject({ kind: 'not-projected' });
    expect(rule(result, 'departure-payout').impact.amount).toBeUndefined();
  });

  it('describes per-hour-worked accrual in PTO hours even when the balance is in days', () => {
    const result = explain({
      ...base, accrual: { kind: 'per-hour-worked', rate: 0.05, typicalWeeklyHours: 40 },
    }, '2027-01-08')!;
    expect(rule(result, 'accrual').explanation).toContain('PTO hours per hour worked');
    expect(result.confirmedAccrued).toBeCloseTo(0.25);
  });

  it('labels an expiration deadline beyond the horizon as configured, not observed', () => {
    const result = explain({
      ...base, carryover: { mode: 'all', useByDate: '2027-03-31' },
    }, '2027-02-01')!;
    expect(rule(result, 'carried-expiration').impact).toMatchObject({ kind: 'configured' });
    expect(rule(result, 'carried-expiration').impact.amount).toBeUndefined();
  });

  it('does not leak request identifiers or notes in the explanatory output', () => {
    const result = explainConnectedPolicy(base, '2027-01-10', [
      request('private-request-id', '2027-01-05', 'approved', 'SECRET PRIVATE APPOINTMENT'),
    ])!;
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('private-request-id');
    expect(serialized).not.toContain('SECRET PRIVATE APPOINTMENT');
  });

  it('returns null for an invalid current carried-bank allocation', () => {
    expect(explain({ ...base, currentCarriedBalance: 6 })).toBeNull();
  });
});
