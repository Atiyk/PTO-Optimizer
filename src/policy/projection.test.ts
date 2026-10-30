import { describe, it, expect } from 'vitest';
import { projectBalance, type PolicyEvent } from './projection';
import type { TimeOffPolicy } from './model';

function base(overrides: Partial<TimeOffPolicy>): TimeOffPolicy {
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

function eventsOf(events: PolicyEvent[], kind: PolicyEvent['kind']) {
  return events.filter((e) => e.kind === kind);
}

describe('projectBalance — per-pay-period accrual', () => {
  it('15 days/year accrued biweekly: ~0.577 days per period, exactly 15.00 over 26 periods', () => {
    // 15 / 26 = 0.576923076923... per period (hand-verified: 0.576923076923 * 26 = 14.999999999998).
    const policy = base({
      accrual: { kind: 'per-pay-period', amount: 15 / 26, frequency: 'biweekly', payDateAnchor: '2026-01-02' },
      currentBalance: 0,
      balanceAsOf: '2026-01-01',
    });
    // Horizon ends 2026-12-31, one day short of the next Jan 1 reset, so exactly the 26
    // biweekly pay dates inside this one plan year are counted (anchor + 25*14 days =
    // 2026-12-18 is the 26th and last one before the reset would otherwise fire).
    const { series } = projectBalance(policy, '2026-12-31');
    const final = series[series.length - 1].balance;
    expect(final).toBeCloseTo(15, 6);
  });

  it('a 22.5-day cap pauses accrual, resumes once a day is taken, and reports the lost amount', () => {
    // Balance starts at 22, one more 0.577-day credit would be 22.577 -> capped at 22.5,
    // so 0.077 days (0.576923... - 0.5) is lost. Hand-verified: 22 + 0.576923076923 = 22.576923;
    // capped to 22.5 -> lost = 0.076923076923.
    const policy = base({
      accrual: { kind: 'per-pay-period', amount: 15 / 26, frequency: 'biweekly', payDateAnchor: '2026-01-02' },
      accrualCap: 22.5,
      currentBalance: 22,
      balanceAsOf: '2026-01-01',
      plannedDays: ['2026-01-05'], // one day taken right after the first pay date, freeing room
    });
    // Horizon ends right after the second pay date (2026-01-16) and before the third
    // (2026-01-30), which would exceed the cap again given only one day was freed —
    // keeping this window to exactly the two pay dates under test.
    const { events } = projectBalance(policy, '2026-01-17');
    const capped = eventsOf(events, 'cap-reached');
    expect(capped).toHaveLength(1);
    expect(capped[0]).toMatchObject({ kind: 'cap-reached', date: '2026-01-02' });
    if (capped[0].kind === 'cap-reached') expect(capped[0].lost).toBeCloseTo(15 / 26 - 0.5, 6);
    // After the day is taken (balance drops to 21.5), the next pay date (2026-01-16) should
    // credit the full amount with no further cap-reached event.
    const secondCredit = eventsOf(events, 'accrual-credited').find((e) => e.date === '2026-01-16');
    expect(secondCredit).toMatchObject({ amount: 15 / 26 });
  });
});

describe('projectBalance — front-loaded, carryover, and forfeiture', () => {
  it('20 days front-loaded Jan 1, 8 used, carryover up to 5, calendar year: 7 forfeited at the next Jan 1 reset', () => {
    // Balance as of 2026-10-28: 20 - 8 = 12. At the 2027-01-01 reset: allowed = min(12, 5) = 5,
    // forfeited = 12 - 5 = 7.
    const policy = base({ carryover: { mode: 'capped', cap: 5 }, currentBalance: 12, balanceAsOf: '2026-10-28' });
    const { events } = projectBalance(policy, '2027-01-02');
    const forfeited = eventsOf(events, 'forfeited');
    expect(forfeited).toEqual([{ kind: 'forfeited', date: '2027-01-01', amount: 7 }]);
  });

  it('the same policy with 7 days planned before Dec 31 forfeits nothing', () => {
    // Balance drops from 12 to 5 as the 7 planned days are each taken; at reset,
    // allowed = min(5, 5) = 5, forfeited = 0.
    const planned = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'];
    const policy = base({ carryover: { mode: 'capped', cap: 5 }, currentBalance: 12, balanceAsOf: '2026-10-28', plannedDays: planned });
    const { events } = projectBalance(policy, '2027-01-02');
    expect(eventsOf(events, 'forfeited')).toEqual([]);
  });

  it('carried days with a Mar 31 use-by expire on that date, not at the Jan 1 reset', () => {
    // Balance 12 at reset, cap 10 -> 2 forfeited immediately, 10 carried with a Mar 31 deadline.
    // Nothing is taken from the carried amount, so all 10 expire on 2027-03-31.
    const policy = base({
      carryover: { mode: 'capped', cap: 10, useByDate: '2027-03-31' },
      currentBalance: 12,
      balanceAsOf: '2026-12-20',
    });
    const { events } = projectBalance(policy, '2027-04-01');
    expect(eventsOf(events, 'forfeited')).toEqual([{ kind: 'forfeited', date: '2027-01-01', amount: 2 }]);
    expect(eventsOf(events, 'carried-days-expiring')).toEqual([{ kind: 'carried-days-expiring', date: '2027-03-31', amount: 10 }]);
  });

  it('a planned day taken from the carried amount before its use-by reduces what later expires', () => {
    const policy = base({
      carryover: { mode: 'capped', cap: 10, useByDate: '2027-03-31' },
      currentBalance: 10,
      balanceAsOf: '2026-12-20',
      plannedDays: ['2027-02-10'],
    });
    const { events } = projectBalance(policy, '2027-04-01');
    expect(eventsOf(events, 'carried-days-expiring')).toEqual([{ kind: 'carried-days-expiring', date: '2027-03-31', amount: 9 }]);
  });
});

describe('projectBalance — anniversary year, waiting period, negative balance, hours', () => {
  it('an anniversary year starting Jun 15 resets on Jun 15 each later year', () => {
    const policy = base({ planYear: { kind: 'anniversary', startDate: '2026-06-15' }, balanceAsOf: '2026-01-01', currentBalance: 0 });
    const { events } = projectBalance(policy, '2027-07-01');
    expect(eventsOf(events, 'reset').map((e) => e.date)).toEqual(['2026-06-15', '2027-06-15']);
  });

  it('a 90-day waiting period from an anniversary start date fires on day 90', () => {
    // 2026-06-15 + 90 days = 2026-09-13 (hand-verified: Jun has 15 remaining days to the 30th,
    // + Jul 31 + Aug 31 = 77, + 13 days into September = 90).
    const policy = base({
      planYear: { kind: 'anniversary', startDate: '2026-06-15' },
      waitingPeriodDays: 90,
      balanceAsOf: '2026-06-15',
      currentBalance: 0,
    });
    const { events } = projectBalance(policy, '2026-10-01');
    expect(eventsOf(events, 'waiting-period-ended')).toEqual([{ kind: 'waiting-period-ended', date: '2026-09-13' }]);
  });

  it('a negative balance allowance of 3 clamps spending, never going below -3', () => {
    const policy = base({
      accrual: { kind: 'front-loaded', amount: 0, grantDate: '2099-01-01' },
      negativeBalanceAllowance: 3,
      currentBalance: 1,
      balanceAsOf: '2026-01-01',
      plannedDays: ['2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'],
    });
    const { series } = projectBalance(policy, '2026-01-10');
    const minBalance = Math.min(...series.map((p) => p.balance));
    expect(minBalance).toBe(-3);
  });

  it('hours mode: 4.62 hours per biweekly period at 7.5 hours/day stays in hours internally', () => {
    const policy = base({
      unit: 'hours',
      hoursPerDay: 7.5,
      accrual: { kind: 'per-pay-period', amount: 4.62, frequency: 'biweekly', payDateAnchor: '2026-01-02' },
      currentBalance: 0,
      balanceAsOf: '2026-01-01',
    });
    const { events } = projectBalance(policy, '2026-01-20');
    const credited = eventsOf(events, 'accrual-credited');
    expect(credited).toEqual([{ kind: 'accrual-credited', date: '2026-01-02', amount: 4.62 }, { kind: 'accrual-credited', date: '2026-01-16', amount: 4.62 }]);
  });

  it('unlimited PTO has no balance to project', () => {
    const policy = base({ accrual: { kind: 'unlimited', expectedDaysPerYear: 15 } });
    const { series, events } = projectBalance(policy, '2027-01-01');
    expect(series).toEqual([]);
    expect(events).toEqual([]);
  });

  it('a projection window spanning a leap day (2028-02-29) does not error and keeps counting', () => {
    const policy = base({ balanceAsOf: '2028-02-20', currentBalance: 5 });
    const { series } = projectBalance(policy, '2028-03-05');
    expect(series.some((p) => p.date === '2028-02-29')).toBe(true);
  });
});
