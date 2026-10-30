import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK, type WorkWeek } from '../solver/types';
import { addMonths, planYearContaining, carryoverDeadline } from './calendar';
import { validatePolicy, type LeavePolicy, type PolicyVersion } from './policy';
import { balanceOn, payPeriodsInYear, projectBalance, type LedgerEntryInput, type MemberFacts } from './projection';
import { requestCost } from './requestCost';

const member = (over: Partial<MemberFacts> = {}): MemberFacts => ({
  startDate: '2020-01-01',
  workWeek: DEFAULT_WORK_WEEK,
  hoursPerDay: 8,
  ...over,
});
const v = (policy: LeavePolicy, effectiveFrom = '2020-01-01'): PolicyVersion[] => [{ effectiveFrom, policy }];
const usage = (date: string, amount: number): LedgerEntryInput => ({ kind: 'usage', amount: -amount, effectiveDate: date });

const frontLoaded = (over: Partial<LeavePolicy> = {}): LeavePolicy => ({
  unit: 'days',
  accrual: { method: 'front_loaded', annualAllowance: 20 },
  planYear: { type: 'calendar' },
  carryover: { type: 'none' },
  ...over,
});

describe('calendar', () => {
  it('plan years: calendar, custom and anniversary', () => {
    expect(planYearContaining({ type: 'calendar' }, null, '2026-07-04')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(planYearContaining({ type: 'custom', month: 4, day: 1 }, null, '2026-03-31')).toEqual({ start: '2025-04-01', end: '2026-03-31' });
    expect(planYearContaining({ type: 'anniversary' }, '2024-09-15', '2026-07-04')).toEqual({ start: '2025-09-15', end: '2026-09-14' });
  });
  it('a Feb 29 anniversary resets on Feb 28 in non-leap years and Feb 29 in leap years', () => {
    expect(planYearContaining({ type: 'anniversary' }, '2024-02-29', '2025-03-01')).toEqual({ start: '2025-02-28', end: '2026-02-27' });
    expect(planYearContaining({ type: 'anniversary' }, '2024-02-29', '2028-03-01')).toEqual({ start: '2028-02-29', end: '2029-02-27' });
  });
  it('addMonths clamps to the month end, including leap February', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });
  it('use-by date is the first occurrence on or after the plan-year start', () => {
    expect(carryoverDeadline('2027-01-01', { month: 3, day: 31 })).toBe('2027-03-31');
    expect(carryoverDeadline('2027-04-01', { month: 3, day: 31 })).toBe('2028-03-31');
  });
  it('pay periods per year', () => {
    const y = { start: '2026-01-01', end: '2026-12-31' };
    expect(payPeriodsInYear(y, 'weekly')).toHaveLength(52);
    expect(payPeriodsInYear(y, 'biweekly')).toHaveLength(26);
    expect(payPeriodsInYear(y, 'semimonthly').map((p) => p.end).slice(0, 4)).toEqual(['2026-01-15', '2026-01-31', '2026-02-15', '2026-02-28']);
    expect(payPeriodsInYear(y, 'monthly').at(-1)).toEqual({ start: '2026-12-01', end: '2026-12-31' });
    // 26 × 14 = 364 days: the last biweekly period ends Dec 30, inside the year.
    expect(payPeriodsInYear(y, 'biweekly').at(-1)!.end).toBe('2026-12-30');
  });
});

describe('policy validation', () => {
  it('accepts a sensible policy and names every problem in a bad one', () => {
    expect(validatePolicy(frontLoaded())).toEqual([]);
    const bad = validatePolicy({
      unit: 'days',
      accrual: { method: 'per_pay_period', annualAllowance: -1, payPeriod: 'fortnightly' as never },
      planYear: { type: 'custom', month: 2, day: 30 },
      carryover: { type: 'upTo', max: -2, useBy: { month: 13, day: 1 } },
      accrualCap: -5,
    });
    expect(bad).toEqual([
      'accrual.annualAllowance must be a number ≥ 0',
      'accrual.payPeriod is not a known pay period',
      'planYear month/day is not a valid date',
      'accrualCap must be a number ≥ 0',
      'carryover.max must be a number ≥ 0',
      'carryover.useBy month/day is not a valid date',
    ]);
  });
});

describe('request cost', () => {
  const holidays = new Map([['2026-11-26', 'Thanksgiving Day']]);
  const schedule = { workWeek: DEFAULT_WORK_WEEK, hoursPerDay: 8, holidays };

  it('a holiday inside a request is not deducted', () => {
    // Mon Nov 23 – Fri Nov 27 2026: 5 weekdays, Thu Nov 26 is Thanksgiving → 4 days.
    const c = requestCost({ start: '2026-11-23', end: '2026-11-27', part: 'full' }, schedule, 'days');
    expect(c.amount).toBe(4);
    expect(c.excluded).toEqual([{ date: '2026-11-26', reason: 'holiday', name: 'Thanksgiving Day' }]);
  });
  it('weekends inside a request are not deducted', () => {
    // Fri Nov 27 – Mon Nov 30: Fri + Mon = 2 days; Sat/Sun excluded.
    const c = requestCost({ start: '2026-11-27', end: '2026-11-30', part: 'full' }, schedule, 'days');
    expect(c.amount).toBe(2);
    expect(c.excluded.map((e) => e.reason)).toEqual(['non_working', 'non_working']);
  });
  it('hours mode at 7.5 h/day', () => {
    const s75 = { ...schedule, hoursPerDay: 7.5 };
    // 3 working days × 7.5 h = 22.5 h.
    expect(requestCost({ start: '2026-11-16', end: '2026-11-18', part: 'full' }, s75, 'hours').amount).toBe(22.5);
    // Half day = 7.5 / 2 = 3.75 h.
    expect(requestCost({ start: '2026-11-16', end: '2026-11-16', part: 'pm' }, s75, 'hours').amount).toBe(3.75);
    // 3 hours on a days-based policy = 3 / 7.5 = 0.4 days.
    expect(requestCost({ start: '2026-11-16', end: '2026-11-16', part: 'hours', hours: 3 }, s75, 'days').amount).toBe(0.4);
  });
  it('part-time work week: only scheduled days count', () => {
    const mwf: WorkWeek = [true, false, true, false, true, false, false];
    // Mon Nov 16 – Sun Nov 22: Mon, Wed, Fri = 3 days.
    const c = requestCost({ start: '2026-11-16', end: '2026-11-22', part: 'full' }, { ...schedule, workWeek: mwf }, 'days');
    expect(c.amount).toBe(3);
  });
  it('a half day on a holiday costs nothing; bad shapes are reported, not thrown', () => {
    expect(requestCost({ start: '2026-11-26', end: '2026-11-26', part: 'am' }, schedule, 'days').amount).toBe(0);
    expect(requestCost({ start: '2026-11-27', end: '2026-11-26', part: 'full' }, schedule, 'days').problems).toEqual(['end date is before start date']);
    expect(requestCost({ start: '2026-11-23', end: '2026-11-24', part: 'am' }, schedule, 'days').problems).toEqual(['a half-day request must be a single day']);
    expect(requestCost({ start: '2026-11-23', end: '2026-11-23', part: 'hours', hours: 9 }, schedule, 'hours').problems).toEqual(['hours must be more than 0 and at most 8']);
  });
  it('leap day is an ordinary working day', () => {
    // Tue Feb 29 2028.
    expect(requestCost({ start: '2028-02-28', end: '2028-03-01', part: 'full' }, schedule, 'days').amount).toBe(3);
  });
});

describe('balance projection', () => {
  it('15 days/yr biweekly = 0.577 days per period, exactly 15 over 26 periods', () => {
    const p: LeavePolicy = {
      unit: 'days',
      accrual: { method: 'per_pay_period', annualAllowance: 15, payPeriod: 'biweekly' },
      planYear: { type: 'calendar' },
      carryover: { type: 'all' },
    };
    const r = projectBalance({ policies: v(p, '2026-01-01'), member: member({ startDate: '2026-01-01' }), ledger: [], asOf: '2026-12-31' });
    const accruals = r.timeline.filter((t) => t.kind === 'accrual');
    expect(accruals).toHaveLength(26);
    // 15 / 26 = 0.576923…; each period is 0.5769 or 0.577 (cumulative rounding to 4 dp).
    for (const a of accruals) expect(a.amount.toFixed(3)).toBe('0.577');
    // Period 1: round(150000·1/26)=5769 units = 0.5769. Period 2: round(150000·2/26)=11538 → 0.5769.
    expect(accruals[0]!.amount).toBe(0.5769);
    // Sum is exactly round(150000·26/26) = 150000 units = 15, no float drift.
    expect(r.asOf.balance).toBe(15);
  });

  it('monthly and semimonthly also sum to exactly the allowance', () => {
    for (const payPeriod of ['monthly', 'semimonthly', 'weekly'] as const) {
      const p: LeavePolicy = { unit: 'days', accrual: { method: 'per_pay_period', annualAllowance: 17, payPeriod }, planYear: { type: 'calendar' }, carryover: { type: 'all' } };
      const r = projectBalance({ policies: v(p, '2026-01-01'), member: member({ startDate: '2026-01-01' }), ledger: [], asOf: '2026-12-31' });
      expect(r.asOf.balance).toBe(17);
    }
  });

  it('a cap pauses accrual and it resumes after use', () => {
    // 24 days/yr monthly = 2/month, cap 5. Jan 31: 2, Feb 28: 4, Mar 31: 5 (+1, reduced to cap),
    // Apr 30: 5 (+0, paused). Use 3 on May 4 → 2. May 31: 4 (accrual resumed). Jun 30: 5 (+1).
    const p: LeavePolicy = {
      unit: 'days',
      accrual: { method: 'per_pay_period', annualAllowance: 24, payPeriod: 'monthly' },
      planYear: { type: 'calendar' },
      carryover: { type: 'all' },
      accrualCap: 5,
    };
    const r = projectBalance({
      policies: v(p, '2026-01-01'),
      member: member({ startDate: '2026-01-01' }),
      ledger: [usage('2026-05-04', 3)],
      asOf: '2026-06-30',
    });
    const at = (d: string) => balanceOn(r.timeline, d);
    expect([at('2026-01-31'), at('2026-02-28'), at('2026-03-31'), at('2026-04-30')]).toEqual([2, 4, 5, 5]);
    expect(r.timeline.find((t) => t.date === '2026-04-30')!.note).toMatch(/at cap: accrual paused/);
    expect(at('2026-05-04')).toBe(2);
    expect(at('2026-05-31')).toBe(4);
    expect(at('2026-06-30')).toBe(5);
  });

  it('front-loaded 20, 8 used, carry up to 5 → 7 forfeited at reset', () => {
    // Jan 1 grant 20; usage 8 → 12 at Dec 31. Reset Jan 1 2027: keep min(12, 5)=5, forfeit 7,
    // then the new grant: 5 + 20 = 25.
    const p = frontLoaded({ carryover: { type: 'upTo', max: 5 } });
    const r = projectBalance({
      policies: v(p, '2026-01-01'),
      member: member({ startDate: '2025-06-01' }),
      ledger: [usage('2026-03-02', 3), usage('2026-08-10', 5)],
      asOf: '2026-12-31',
      horizon: '2027-01-01',
    });
    expect(r.yearEnd).toEqual({ yearEnd: '2026-12-31', balance: 12, wouldCarry: 5, wouldForfeit: 7 });
    const reset = r.timeline.find((t) => t.key === 'forfeiture:reset:2027-01-01')!;
    expect(reset.amount).toBe(-7);
    expect(reset.note).toBe('plan year ended with 12; 5 carried over, 7 forfeited');
    expect(r.atHorizon.balance).toBe(25);
    expect(r.atHorizon.carried).toBe(5);
  });

  it('carried days with a Mar 31 use-by: used first, the rest expire Apr 1', () => {
    // End of 2026: 20 − 12 = 8 → carry up to 5 (use by Mar 31), forfeit 3. 2027: 5 + 20 = 25.
    // Feb 2027 usage of 2 spends carried first → carried 3. Apr 1: the 3 carried expire → 20.
    const p = frontLoaded({ carryover: { type: 'upTo', max: 5, useBy: { month: 3, day: 31 } } });
    const r = projectBalance({
      policies: v(p, '2026-01-01'),
      member: member({ startDate: '2025-06-01' }),
      ledger: [usage('2026-07-06', 12), usage('2027-02-15', 2)],
      asOf: '2027-03-15',
      horizon: '2027-04-30',
    });
    expect(r.asOf).toMatchObject({ balance: 23, carried: 3, carriedExpiresOn: '2027-03-31' });
    const expiry = r.timeline.find((t) => t.key === 'forfeiture:useby:2027-04-01')!;
    expect(expiry.amount).toBe(-3);
    expect(expiry.note).toBe('carried-over leave not used by 2027-03-31 expired');
    expect(r.atHorizon).toMatchObject({ balance: 20, carried: 0, carriedExpiresOn: null });
  });

  it('an anniversary year with a mid-year start is pro-rated', () => {
    // Anniversary plan year from the 2025-03-01 start: 2025-03-01 … 2026-02-28 (365 days).
    // The policy takes effect 2026-01-01, mid-year: 59 days remain (Jan 31 + Feb 28).
    // Grant = 20 × 59 / 365 = 3.23287… → 3.2329 (4 dp). Next anniversary 2026-03-01: full 20.
    const p = frontLoaded({ planYear: { type: 'anniversary' }, carryover: { type: 'all' } });
    const r = projectBalance({ policies: v(p, '2026-01-01'), member: member({ startDate: '2025-03-01' }), ledger: [], asOf: '2026-01-01', horizon: '2026-03-01' });
    expect(r.asOf.balance).toBe(3.2329);
    expect(r.timeline[0]!.note).toBe('20 a year, pro-rated for 59 of 365 days');
    expect(r.atHorizon.balance).toBe(23.2329);
  });

  it('a calendar-year hire mid-year is pro-rated the same way', () => {
    // Start 2026-07-01: 184 of 365 days remain → 20 × 184 / 365 = 10.0821…
    const p = frontLoaded();
    const r = projectBalance({ policies: v(p, '2020-01-01'), member: member({ startDate: '2026-07-01' }), ledger: [], asOf: '2026-07-01' });
    expect(r.asOf.balance).toBe(10.0822);
  });

  it('hours mode at 7.5 h/day: a front-loaded 150 h allowance less a 3-day request', () => {
    // 150 h − 3 × 7.5 h = 127.5 h.
    const p = frontLoaded({ unit: 'hours', accrual: { method: 'front_loaded', annualAllowance: 150 } });
    const cost = requestCost({ start: '2026-11-16', end: '2026-11-18', part: 'full' }, { workWeek: DEFAULT_WORK_WEEK, hoursPerDay: 7.5, holidays: new Map() }, 'hours');
    const r = projectBalance({
      policies: v(p, '2026-01-01'),
      member: member({ startDate: '2024-01-01', hoursPerDay: 7.5 }),
      ledger: [usage('2026-11-16', cost.amount)],
      asOf: '2026-11-30',
    });
    expect(r.unit).toBe('hours');
    expect(r.asOf.balance).toBe(127.5);
  });

  it('per-hour-worked accrual uses scheduled hours, skipping holidays', () => {
    // Monthly periods, 1 h per 30 h worked. January 2026 has 22 weekdays, New Year's Day is a
    // holiday → 21 × 8 = 168 h → 168 / 30 = 5.6 h.
    const p: LeavePolicy = { unit: 'hours', accrual: { method: 'per_hour_worked', ratePerHour: 1 / 30, payPeriod: 'monthly' }, planYear: { type: 'calendar' }, carryover: { type: 'all' } };
    const r = projectBalance({
      policies: v(p, '2026-01-01'),
      member: member({ startDate: '2026-01-01', holidays: new Map([['2026-01-01', "New Year's Day"]]) }),
      ledger: [],
      asOf: '2026-01-31',
    });
    expect(r.asOf.balance).toBe(5.6);
  });

  it('a policy change mid-year applies going forward only', () => {
    // 12/yr monthly until Jun 30 (6 × 1 = 6), then 24/yr from Jul 1: period 7..12 of 24/yr
    // credit round(24·k/12) − round(24·(k−1)/12) = 2 each → 6 × 2 = 12. Total 18.
    const base: LeavePolicy = { unit: 'days', accrual: { method: 'per_pay_period', annualAllowance: 12, payPeriod: 'monthly' }, planYear: { type: 'calendar' }, carryover: { type: 'all' } };
    const richer: LeavePolicy = { ...base, accrual: { method: 'per_pay_period', annualAllowance: 24, payPeriod: 'monthly' } };
    const r = projectBalance({
      policies: [{ effectiveFrom: '2026-01-01', policy: base }, { effectiveFrom: '2026-07-01', policy: richer }],
      member: member({ startDate: '2026-01-01' }),
      ledger: [],
      asOf: '2026-12-31',
    });
    expect(balanceOn(r.timeline, '2026-06-30')).toBe(6);
    expect(r.asOf.balance).toBe(18);
  });

  it('posted scheduled rows are used as-is and not regenerated; unposted ones are due', () => {
    // The posting job wrote January's accrual (as 1.5, e.g. under an older policy).
    const p: LeavePolicy = { unit: 'days', accrual: { method: 'per_pay_period', annualAllowance: 12, payPeriod: 'monthly' }, planYear: { type: 'calendar' }, carryover: { type: 'all' } };
    const r = projectBalance({
      policies: v(p, '2026-01-01'),
      member: member({ startDate: '2026-01-01' }),
      ledger: [{ kind: 'accrual', amount: '1.5000', effectiveDate: '2026-01-31', eventKey: 'accrual:2026-01-31' }],
      asOf: '2026-03-15',
    });
    expect(r.timeline.filter((t) => t.key === 'accrual:2026-01-31')).toHaveLength(1);
    expect(r.asOf.balance).toBe(2.5); // 1.5 posted + Feb's 1
    expect(r.duePostings.map((d) => d.key)).toEqual(['accrual:2026-02-28']);
  });

  it('posted year-end rows keep the carried bucket and its use-by', () => {
    const p = frontLoaded({ carryover: { type: 'upTo', max: 5, useBy: { month: 3, day: 31 } } });
    const r = projectBalance({
      policies: v(p, '2026-01-01'),
      member: member({ startDate: '2025-06-01' }),
      ledger: [
        { kind: 'accrual', amount: 20, effectiveDate: '2026-01-01', eventKey: 'accrual:2026-01-01' },
        usage('2026-07-06', 12),
        { kind: 'forfeiture', amount: -3, effectiveDate: '2027-01-01', eventKey: 'forfeiture:reset:2027-01-01' },
        { kind: 'accrual', amount: 20, effectiveDate: '2027-01-01', eventKey: 'accrual:2027-01-01' },
      ],
      asOf: '2027-02-01',
      horizon: '2027-04-01',
    });
    expect(r.asOf).toMatchObject({ balance: 25, carried: 5, carriedExpiresOn: '2027-03-31' });
    expect(r.atHorizon.balance).toBe(20);
  });

  it('waiting periods: no accrual before, or accrued but locked', () => {
    const p: LeavePolicy = { unit: 'days', accrual: { method: 'per_pay_period', annualAllowance: 12, payPeriod: 'monthly' }, planYear: { type: 'calendar' }, carryover: { type: 'all' } };
    // Start Jan 1, 90-day wait → Apr 1. no_accrual: Jan–Mar periods skipped; Apr 30 is the first.
    const none = projectBalance({ policies: v({ ...p, waitingPeriod: { days: 90, mode: 'no_accrual' } }, '2026-01-01'), member: member({ startDate: '2026-01-01' }), ledger: [], asOf: '2026-04-30' });
    expect(none.asOf.balance).toBe(1);
    // locked: 3 accrued by Mar 31 but usable 0 until Apr 1.
    const locked = projectBalance({ policies: v({ ...p, waitingPeriod: { days: 90, mode: 'locked' } }, '2026-01-01'), member: member({ startDate: '2026-01-01' }), ledger: [], asOf: '2026-03-31' });
    expect(locked.asOf).toMatchObject({ balance: 3, usable: 0, lockedUntil: '2026-04-01' });
  });

  it('a negative balance carries into the next year as a debt, nothing forfeited', () => {
    const p = frontLoaded({ negativeAllowance: 3, carryover: { type: 'none' } });
    const r = projectBalance({ policies: v(p, '2026-01-01'), member: member(), ledger: [usage('2026-06-01', 22)], asOf: '2026-12-31', horizon: '2027-01-01' });
    expect(r.yearEnd).toMatchObject({ balance: -2, wouldCarry: -2, wouldForfeit: 0 });
    expect(r.atHorizon.balance).toBe(18);
    expect(r.negativeAllowance).toBe(3);
  });

  it('unlimited: no accruals, usage is still counted', () => {
    const p: LeavePolicy = { unit: 'days', accrual: { method: 'unlimited' }, planYear: { type: 'calendar' }, carryover: { type: 'none' } };
    const r = projectBalance({ policies: v(p, '2026-01-01'), member: member(), ledger: [usage('2026-03-02', 2), usage('2026-07-06', 3.5)], asOf: '2026-08-01' });
    expect(r.unlimited).toBe(true);
    expect(r.timeline.filter((t) => t.kind === 'accrual')).toHaveLength(0);
    expect(r.usedThisPlanYear).toBe(5.5);
    expect(r.yearEnd).toBeNull();
  });

  it('is deterministic: same inputs, same output', () => {
    const p = frontLoaded({ carryover: { type: 'upTo', max: 5, useBy: { month: 3, day: 31 } } });
    const input = { policies: v(p, '2024-01-01'), member: member(), ledger: [usage('2025-02-03', 4), usage('2026-05-05', 7)], asOf: '2026-06-01' };
    expect(projectBalance(input)).toEqual(projectBalance(input));
  });
});
