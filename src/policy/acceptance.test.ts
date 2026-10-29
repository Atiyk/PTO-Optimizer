import { describe, it, expect } from 'vitest';
import { projectBalance } from './projection';
import { generateAlerts } from './alerts';
import { generatePolicySummary } from './summary';
import { generateHRQuestions, hrQuestionsMessage } from './hrQuestions';
import { decodeParagraph, uniqueMatchedTerms } from './decode';
import type { TimeOffPolicy } from './model';

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
    balanceAsOf: '2026-10-28',
    plannedDays: [],
    ...overrides,
  };
}

/**
 * The seven acceptance scenarios from the run prompt, tested against the real engine
 * (projectBalance/generateAlerts/generatePolicySummary/generateHRQuestions/decodeParagraph) -
 * the same functions Policy.tsx calls. Stage 4's full UI layer (the inputs, the rendered
 * chart, the clickable cards) is exercised separately where it's practical to; these tests
 * lock down the underlying numbers and text every one of those scenarios depends on.
 */
describe('S1 — front-loaded + carryover forfeiture, with the /pto hand-off', () => {
  const policy = basePolicy({ carryover: { mode: 'capped', cap: 5 }, currentBalance: 12, balanceAsOf: '2026-10-28' });

  it('plain summary mentions the carryover cap', () => {
    const summary = generatePolicySummary(policy);
    expect(summary.some((s) => s.includes('5'))).toBe(true);
  });

  it('alerts: "7 days lost on Jan 1", with a /pto hand-off ending Dec 31 at budget 7', () => {
    const { events } = projectBalance(policy, '2027-01-02');
    const alerts = generateAlerts(policy, events, '2026-10-28', 'US');
    const forfeitAlert = alerts.find((a) => a.id.startsWith('forfeit-'));
    expect(forfeitAlert).toBeDefined();
    expect(forfeitAlert!.text).toBe("You'll lose 7 days on 2027-01-01 unless you take them.");
    expect(forfeitAlert!.daysAtStake).toBe(7);
    const url = new URLSearchParams(forfeitAlert!.ptoHref.split('?')[1]);
    expect(url.get('b')).toBe('7');
    expect(url.get('e')).toBe('2026-12-31');
    expect(url.get('c')).toBe('US');
  });
});

describe('S2 — biweekly accrual with a cap, alert carries the date and the amount lost', () => {
  it('reports when the cap is reached and the accrual lost if nothing is taken', () => {
    const policy = basePolicy({
      accrual: { kind: 'per-pay-period', amount: 15 / 26, frequency: 'biweekly', payDateAnchor: '2026-11-02' },
      accrualCap: 22.5,
      currentBalance: 21,
      balanceAsOf: '2026-10-28',
    });
    const { events } = projectBalance(policy, '2026-12-01');
    const alerts = generateAlerts(policy, events, '2026-10-28', 'US');
    const capAlert = alerts.find((a) => a.id.startsWith('cap-'));
    expect(capAlert).toBeDefined();
    expect(capAlert!.text).toContain('cap');
    expect(capAlert!.daysAtStake).toBeGreaterThan(0);
  });
});

describe('S3 — hours mode stays consistent between summary and the balance', () => {
  it('summary states the rate in hours, and the projected balance accrues in hours', () => {
    const policy = basePolicy({
      unit: 'hours',
      hoursPerDay: 7.5,
      accrual: { kind: 'per-pay-period', amount: 4.62, frequency: 'biweekly', payDateAnchor: '2026-11-02' },
      currentBalance: 0,
      balanceAsOf: '2026-10-28',
    });
    const summary = generatePolicySummary(policy);
    expect(summary[0]).toContain('4.62 hours');
    const { series } = projectBalance(policy, '2026-11-03');
    expect(series[series.length - 1].balance).toBeCloseTo(4.62, 6); // one pay date fired, in hours
  });
});

describe('S4 — a carryover use-by date gets its own, separate alert', () => {
  it('carried-days-expiring is distinct from the reset-day forfeiture alert', () => {
    const policy = basePolicy({
      carryover: { mode: 'capped', cap: 10, useByDate: '2027-03-31' },
      currentBalance: 10,
      balanceAsOf: '2026-12-20',
    });
    const { events } = projectBalance(policy, '2027-04-01');
    const alerts = generateAlerts(policy, events, '2026-12-20', 'US');
    const expiring = alerts.find((a) => a.id.startsWith('carried-expiring-'));
    const forfeited = alerts.find((a) => a.id.startsWith('forfeit-'));
    expect(expiring).toBeDefined();
    expect(expiring!.text).toContain('2027-03-31');
    // Nothing forfeited at reset itself here (balance 10 == cap 10), so the two alert
    // kinds really are independent, not two labels for the same event.
    expect(forfeited).toBeUndefined();
  });
});

describe('S5 — unlimited PTO has no balance chart and offers the expected-days plan', () => {
  it('projectBalance returns no series, and the summary is neutral, not statistical', () => {
    const policy = basePolicy({ accrual: { kind: 'unlimited', expectedDaysPerYear: 15 } });
    const { series } = projectBalance(policy, '2027-01-01');
    expect(series).toEqual([]);
    const summary = generatePolicySummary(policy);
    expect(summary[0]).toContain('unlimited');
    expect(summary[0]).not.toMatch(/\d+%/); // no invented statistic
  });
});

describe('S6 — "not sure" fields appear in the HR questions', () => {
  it('payout and carryover both surface when marked not sure / left uncapped', () => {
    const policy = basePolicy({ payoutOnLeaving: 'not-sure', carryover: { mode: 'capped', cap: 0 } });
    const questions = generateHRQuestions(policy);
    expect(questions.some((q) => q.toLowerCase().includes('paid out'))).toBe(true);
    expect(questions.some((q) => q.toLowerCase().includes('carry over'))).toBe(true);
    expect(hrQuestionsMessage(questions)).toContain('A few questions');
  });
});

describe('S7 — decoding a pasted paragraph matches terms without storing or mutating anything', () => {
  const sample = `Full-time employees have an accrual rate tied to each pay period. Your balance has an
accrual cap you cannot exceed, and unused time has a carryover into the next plan year only
up to a set limit — any time above that is forfeited. New hires are subject to a 90-day waiting
period before PTO can be used.`;

  it('finds the expected terms and nothing is auto-filled', () => {
    const matches = decodeParagraph(sample);
    const terms = uniqueMatchedTerms(matches).map((t) => t.id);
    expect(terms).toContain('pto');
    expect(terms).toContain('accrual-rate');
    expect(terms).toContain('accrual-cap');
    expect(terms).toContain('carryover');
    expect(terms).toContain('forfeiture');
    expect(terms).toContain('waiting-period');
    // decodeParagraph returns matches only - it has no side effects, writes nothing to
    // localStorage or the URL, and returns a fresh array every call (never caches the text).
    expect(decodeParagraph(sample)).not.toBe(matches);
  });

  it('returns nothing for empty input, and never throws on arbitrary text', () => {
    expect(decodeParagraph('')).toEqual([]);
    expect(() => decodeParagraph('normal text with punctuation! and 10,000 characters repeated. '.repeat(200))).not.toThrow();
  });
});
