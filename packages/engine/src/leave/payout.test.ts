import { describe, expect, it } from 'vitest';
import { computePayout, DEFAULT_PAYOUT_POLICY, payoutConflicts, statePayoutRule, STATE_PAYOUT_RULES, type PayoutInput, type PayoutPolicy } from './payout';

const bal = (balance: number, yearEnd: { wouldCarry: number; wouldForfeit: number } | null = null): PayoutInput['balance'] => ({
  balance,
  unit: 'hours',
  yearEnd: yearEnd ? { date: '2026-12-31', balance: yearEnd.wouldCarry + yearEnd.wouldForfeit, ...yearEnd } : null,
});
const pol = (p: Partial<PayoutPolicy> = {}): PayoutPolicy => ({ ...DEFAULT_PAYOUT_POLICY, ...p });

describe('state payout rules (cited or needs verification)', () => {
  it('pins each cited rule to its source and retrieval date', () => {
    expect(STATE_PAYOUT_RULES.CA).toMatchObject({ separationRequired: true, forfeitureBanned: true, citation: { regulation: 'Cal. Labor Code', section: '§ 227.3', retrievedOn: '2026-11-01' } });
    expect(STATE_PAYOUT_RULES.CA!.citation!.quote).toMatch(/shall not provide for forfeiture of vested vacation/);
    expect(STATE_PAYOUT_RULES.CO).toMatchObject({ separationRequired: true, forfeitureBanned: true, citation: { url: expect.stringContaining('cdle.colorado.gov'), publisher: 'agency_guidance' } });
    expect(STATE_PAYOUT_RULES.CO!.citation!.quote).toMatch(/all vacation pay earned and determinable/);
    expect(STATE_PAYOUT_RULES.TX).toMatchObject({ separationRequired: false, citation: { section: '§ 821.25(a)' } });
    expect(STATE_PAYOUT_RULES.TX!.citation!.quote).toMatch(/only if a written agreement/);
    expect(STATE_PAYOUT_RULES.NY).toMatchObject({ separationRequired: false, citation: { section: '§ 198-c', publisher: 'official' } });
    expect(STATE_PAYOUT_RULES.NY!.needsVerification).toBeTruthy();
    expect(STATE_PAYOUT_RULES.WA!.needsVerification).toBeTruthy();
    for (const r of Object.values(STATE_PAYOUT_RULES)) expect(r.citation || r.needsVerification).toBeTruthy();
  });

  it('any other state is "needs verification" and follows the written policy', () => {
    const r = statePayoutRule('OR');
    expect(r).toMatchObject({ state: 'OR', separationRequired: false, forfeitureBanned: false, citation: null });
    expect(r.needsVerification).toMatch(/not researched/);
    expect(statePayoutRule('US-CA').state).toBe('CA');
  });
});

describe('computePayout: separation', () => {
  it.each([
    // state, policy mode, balance → payable, forfeited, capApplied, basis
    ['CA', { mode: 'no' }, 40, 40, 0, null, 'law'],
    ['CA', { mode: 'up_to_cap', cap: 16 }, 40, 40, 0, null, 'law'],
    ['CO', { mode: 'state_law' }, 12.5, 12.5, 0, null, 'law'],
    ['TX', { mode: 'state_law' }, 40, 0, 40, null, 'law'],
    ['TX', { mode: 'yes' }, 40, 40, 0, null, 'org_policy'],
    ['TX', { mode: 'up_to_cap', cap: 16 }, 40, 16, 24, 16, 'org_policy'],
    ['TX', { mode: 'up_to_cap', cap: 80 }, 40, 40, 0, null, 'org_policy'],
    ['NY', { mode: 'no' }, 40, 0, 40, null, 'org_policy'],
    ['OR', { mode: 'state_law' }, 40, 0, 40, null, 'org_policy'],
  ] as const)('%s, policy %j, balance %d → payable %d', (state, separation, balance, payable, forfeited, capApplied, basis) => {
    const r = computePayout({ policy: pol({ separation: separation as PayoutPolicy['separation'] }), balance: bal(balance), scenario: 'separation', state, isSickLeave: false });
    expect([r.payable, r.forfeited, r.capApplied, r.rule.basis]).toEqual([payable, forfeited, capApplied, basis]);
    if (basis === 'law' && (state === 'CA' || state === 'CO')) expect(r.rule.citation?.url).toBe(STATE_PAYOUT_RULES[state]!.citation!.url);
  });

  it('sick leave is excluded by default, even in California', () => {
    const r = computePayout({ policy: pol(), balance: bal(24), scenario: 'separation', state: 'CA', isSickLeave: true });
    expect(r).toMatchObject({ payable: 0, forfeited: 24, rule: { id: 'sick-excluded', basis: 'org_policy' } });
    expect(r.warnings).toEqual([]);
  });

  it('money only when a rate is passed: hours × rate, days × hours per day × rate, to the cent', () => {
    expect(computePayout({ policy: pol(), balance: bal(40), scenario: 'separation', state: 'CA', isSickLeave: false }).amount).toBeNull();
    expect(computePayout({ policy: pol(), balance: bal(37.5), scenario: 'separation', state: 'CA', isSickLeave: false, money: { hourlyRate: 22.4, hoursPerDay: 8 } }).amount).toBe(840);
    const days = computePayout({ policy: pol(), balance: { balance: 2.5, unit: 'days', yearEnd: null }, scenario: 'separation', state: 'CO', isSickLeave: false, money: { hourlyRate: 19.99, hoursPerDay: 7.5 } });
    expect(days.amount).toBe(374.81); // 2.5 × 7.5 × 19.99 = 374.8125
  });
});

describe('computePayout: year end', () => {
  it.each([
    ['TX', 'forfeit_excess', 0, 40, 10],
    ['TX', 'cash_out_excess', 10, 40, 0],
    ['CA', 'forfeit_excess', 0, 50, 0],
    ['CA', 'cash_out_excess', 10, 40, 0],
    ['CO', 'forfeit_excess', 0, 50, 0],
  ] as const)('%s with %s: payable %d, carried %d, forfeited %d', (state, yearEnd, payable, carried, forfeited) => {
    const r = computePayout({ policy: pol({ yearEnd }), balance: bal(30, { wouldCarry: 40, wouldForfeit: 10 }), scenario: 'year_end', state, isSickLeave: false });
    expect([r.payable, r.carried, r.forfeited]).toEqual([payable, carried, forfeited]);
  });

  it('no projection (e.g. unlimited): nothing changes', () => {
    expect(computePayout({ policy: pol(), balance: bal(5), scenario: 'year_end', state: 'TX', isSickLeave: false })).toMatchObject({ payable: 0, forfeited: 0, carried: 0 });
  });
});

describe('computePayout: voluntary cash-out', () => {
  const vc = (v: Partial<PayoutPolicy['voluntaryCashOut']>) => pol({ voluntaryCashOut: { allowed: true, minBalanceKept: 0, maxPerYear: null, ...v } });
  it.each([
    [{ allowed: false }, 40, 0, 0, null],
    [{ minBalanceKept: 40 }, 100, 0, 60, null],
    [{ minBalanceKept: 40 }, 20, 0, 20, null],
    [{ minBalanceKept: 40 }, 100, 0, 60, null],
    [{ minBalanceKept: 10, maxPerYear: 40 }, 100, 30, 10, 40],
    [{ minBalanceKept: 10, maxPerYear: 40 }, 5, 0, 5, null],
  ] as const)('%j, asked %d (already %d) → %d', (v, requested, already, payable, capApplied) => {
    const r = computePayout({ policy: vc(v), balance: bal(100), scenario: 'cash_out', state: 'TX', isSickLeave: false, cashOut: { requested, alreadyThisYear: already } });
    expect(r.payable).toBe(payable);
    if (capApplied != null) expect(r.capApplied).toBe(capApplied);
  });
});

describe('payoutConflicts', () => {
  it('warns when a policy conflicts with a cited state rule, and not otherwise', () => {
    expect(payoutConflicts(pol({ separation: { mode: 'no' }, yearEnd: 'cash_out_excess' }), 'CA')).toEqual([expect.stringMatching(/requires earned vacation to be paid/)]);
    expect(payoutConflicts(pol({ separation: { mode: 'no' } }), 'CA')).toHaveLength(2);
    expect(payoutConflicts(pol({ yearEnd: 'forfeit_excess' }), 'CO')).toEqual([expect.stringMatching(/can't be forfeited|doesn't allow/)]);
    expect(payoutConflicts(pol({ separation: { mode: 'no' }, yearEnd: 'forfeit_excess' }), 'TX')).toEqual([]);
    expect(payoutConflicts(pol({ separation: { mode: 'state_law' }, yearEnd: 'cash_out_excess' }), 'CA')).toEqual([]);
  });
});
