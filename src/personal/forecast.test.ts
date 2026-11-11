import { describe, expect, it } from 'vitest';
import type { TimeOffPolicy } from '../policy/model';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { projectBalance } from '../policy/projection';
import { createPtoRequest } from './requestLedger';
import { forecastWithRequests } from './forecast';

const base: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, accrual: { kind: 'per-pay-period', amount: 1.25, frequency: 'monthly', payDateAnchor: '2027-01-15' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'all' }, negativeBalanceAllowance: 0, payoutOnLeaving: 'not-sure',
  currentBalance: 10, balanceAsOf: '2027-01-01', plannedDays: [],
};
const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [] };
function approved(id: string, start: string, end = start) { return createPtoRequest({ start, end, status: 'approved' }, calendar, id)!; }

describe('date-specific forecast reuses the existing policy projection', () => {
  it('changes immediately with the chosen date and preserves precision', () => {
    expect(forecastWithRequests(base, '2027-01-14')!.confirmed.balance).toBe(10);
    expect(forecastWithRequests(base, '2027-02-15')!.confirmed.balance).toBe(12.5);
    const fractional = { ...base, accrual: { ...base.accrual, kind: 'per-pay-period' as const, amount: 1 / 3, frequency: 'weekly' as const, payDateAnchor: '2027-01-08' } };
    expect(forecastWithRequests(fractional, '2027-01-22')!.confirmed.balance).toBeCloseTo(11, 12);
  });
  it('pauses accrual above the cap without deleting already-earned balance', () => {
    const capped = { ...base, currentBalance: 25, accrualCap: 20 };
    const result = forecastWithRequests(capped, '2027-01-15')!;
    expect(result.confirmed).toMatchObject({ balance: 25, accrued: 0, lostAccrual: 1.25, expired: 0 });
    expect(result.confirmed.events).toContainEqual({ kind: 'cap-reached', date: '2027-01-15', lost: 1.25 });
  });
  it('unions approved leave with the policy planned dates and does not double count overlapping requests', () => {
    const policy = { ...base, plannedDays: ['2027-01-04'] };
    const forecast = forecastWithRequests(policy, '2027-01-14', [approved('a', '2027-01-04', '2027-01-05'), approved('b', '2027-01-05', '2027-01-06')])!;
    expect(forecast.confirmed.scheduled).toBe(3);
    expect(forecast.confirmed.balance).toBe(7);
    expect(forecast.conflicts).toHaveLength(1);
  });
  it('changes a requested entry into confirmed consumption only when manually marked approved', () => {
    const entry = { ...approved('a', '2027-01-04'), status: 'requested' as const };
    const pending = forecastWithRequests(base, '2027-01-14', [entry])!;
    expect(pending.confirmed.balance).toBe(10);
    expect(pending.tentative.balance).toBe(9);
    const confirmed = forecastWithRequests(base, '2027-01-14', [{ ...entry, status: 'approved' }])!;
    expect(confirmed.confirmed.balance).toBe(9);
    expect(confirmed.tentative.balance).toBe(9);
    expect(forecastWithRequests(base, '2027-01-14', [{ ...entry, status: 'canceled' }])!.tentative.balance).toBe(10);
  });
  it('never charges dates on or before the as-of balance', () => {
    const policy = { ...base, balanceAsOf: '2027-01-05', plannedDays: ['2027-01-04', '2027-01-05'] };
    expect(forecastWithRequests(policy, '2027-01-14', [approved('past', '2027-01-04', '2027-01-05')])!.confirmed.balance).toBe(10);
  });
  it('keeps hours as native units while charging each workday once', () => {
    const policy = { ...base, unit: 'hours' as const, currentBalance: 40, hoursPerDay: 7.5 };
    expect(forecastWithRequests(policy, '2027-01-14', [approved('a', '2027-01-04', '2027-01-05')])!.confirmed).toMatchObject({ balance: 25, scheduled: 15 });
  });
  it('charges 18 hours for two 9-hour shifts and flags a third as unfunded', () => {
    const schedule = { ...calendar, shiftMinutes: [540, 540, 540, 540, 480, 0, 0] };
    const build = (end: string, partialMinutes?: number) =>
      createPtoRequest({ start: '2027-01-04', end, status: 'approved', partialMinutes }, schedule, 'booking')!;
    const policy = { ...base, unit: 'hours' as const, currentBalance: 18 };
    const forecast = (request: ReturnType<typeof build>) => forecastWithRequests(policy, '2027-01-14', [request])!.confirmed;
    expect(forecast(build('2027-01-05'))).toMatchObject({ balance: 0, scheduled: 18, unfunded: 0 });
    expect(forecast(build('2027-01-06'))).toMatchObject({ balance: 0, scheduled: 27, unfunded: 9 });
    expect(forecast(build('2027-01-04', 240))).toMatchObject({ balance: 14, scheduled: 4, unfunded: 0 });
  });
  it('does not re-deduct an approval already reflected in the entered balance', () => {
    const policy = { ...base, balanceIncludesApprovedLeave: true, plannedDays: ['2027-01-04', '2027-01-07'] };
    const tentative = { ...approved('b', '2027-01-04', '2027-01-05'), status: 'requested' as const };
    const result = forecastWithRequests(policy, '2027-01-14', [approved('a', '2027-01-04'), tentative])!;
    expect(result.confirmed).toMatchObject({ balance: 9, scheduled: 1 });
    expect(result.tentative).toMatchObject({ balance: 8, scheduled: 2 });
  });
  it('reports a funding shortfall when the projection clamps the balance', () => {
    const policy = { ...base, currentBalance: 1 };
    const result = forecastWithRequests(policy, '2027-01-14', [approved('a', '2027-01-04', '2027-01-06')])!;
    expect(result.confirmed).toMatchObject({ balance: 0, scheduled: 3, unfunded: 2 });
  });
  it('honors a negative balance allowance and reset debt clearing in the shortfall calculation', () => {
    const policy = { ...base, currentBalance: 1, negativeBalanceAllowance: 2 };
    expect(forecastWithRequests(policy, '2027-01-14', [approved('a', '2027-01-04', '2027-01-07')])!.confirmed.unfunded).toBe(1);
    const resetPolicy = { ...base, currentBalance: -1, balanceAsOf: '2026-12-31', carryover: { mode: 'none' as const } };
    expect(forecastWithRequests(resetPolicy, '2027-01-01')!.confirmed.unfunded).toBe(0);
  });
  it('respects caps, forfeiture and approved leave in exactly the existing projection', () => {
    const policy = { ...base, currentBalance: 12, balanceAsOf: '2026-12-01', accrualCap: 13, carryover: { mode: 'capped' as const, cap: 5 } };
    const entry = approved('a', '2026-12-14', '2026-12-15');
    const forecast = forecastWithRequests(policy, '2027-01-16', [entry])!;
    const expected = projectBalance({ ...policy, plannedDays: entry.ptoDates }, '2027-01-16');
    expect(forecast.confirmed.series).toEqual(expected.series);
    expect(forecast.confirmed.expired).toBe(5);
    expect(forecast.confirmed.balance).toBe(6.25);
  });
  it('uses carried PTO on its inclusive use-by date before expiring the remainder', () => {
    const policy = { ...base, currentBalance: 4, balanceAsOf: '2026-12-31', accrual: { kind: 'front-loaded' as const, amount: 0, grantDate: '2026-01-01' }, carryover: { mode: 'all' as const, useByDate: '2027-03-31' } };
    const result = forecastWithRequests(policy, '2027-03-31', [approved('a', '2027-03-31')])!;
    expect(result.confirmed).toMatchObject({ balance: 0, scheduled: 1, expired: 3, unfunded: 0 });
    expect(result.confirmed.events.filter((event) => event.date === '2027-03-31').map((event) => event.kind)).toEqual(['planned-day-taken', 'carried-days-expiring']);
  });
  it('tracks only the explicitly entered current carried portion in native hours', () => {
    const carried = { ...base, unit: 'hours' as const, currentBalance: 80, currentCarriedBalance: 24,
      balanceAsOf: '2027-02-01', accrual: { kind: 'front-loaded' as const, amount: 0, grantDate: '2027-01-01' },
      carryover: { mode: 'all' as const, useByDate: '2027-03-31' } };
    const result = forecastWithRequests(carried, '2027-04-01', [approved('one', '2027-03-30')])!;
    expect(result.confirmed).toMatchObject({ balance: 56, expired: 16, scheduled: 8 });
  });
  it('rejects an impossible current carried portion rather than implying no expiration risk', () => {
    expect(forecastWithRequests({ ...base, currentCarriedBalance: 11, carryover: { mode: 'all', useByDate: '2027-03-31' } }, '2027-04-01')).toBeNull();
    expect(forecastWithRequests({ ...base, currentCarriedBalance: 2 }, '2027-04-01')).toBeNull();
    expect(forecastWithRequests({ ...base, currentCarriedBalance: -1 }, '2027-04-01')).toBeNull();
    expect(projectBalance({ ...base, currentCarriedBalance: 11, carryover: { mode: 'all', useByDate: '2027-03-31' } }, '2027-04-01')).toMatchObject({ series: [], events: [], validationError: expect.stringContaining('between zero and your current balance') });
  });
  it('does not invent a banked balance for unlimited PTO', () => {
    const policy = { ...base, accrual: { kind: 'unlimited' as const, expectedDaysPerYear: 20 } };
    expect(forecastWithRequests(policy, '2027-06-01')!.confirmed.balance).toBeNull();
  });
  it('fails gracefully for malformed, past, unbounded or non-finite inputs', () => {
    expect(forecastWithRequests(base, '2027-02-30')).toBeNull();
    expect(forecastWithRequests(base, '2026-12-31')).toBeNull();
    expect(forecastWithRequests(base, '2099-01-01')).toBeNull();
    expect(forecastWithRequests({ ...base, currentBalance: NaN }, '2027-02-01')).toBeNull();
    expect(forecastWithRequests({ ...base, hoursPerDay: 0 }, '2027-02-01')).toBeNull();
    expect(forecastWithRequests({ ...base, waitingPeriodDays: Infinity }, '2027-02-01')).toBeNull();
    expect(forecastWithRequests({ ...base, waitingPeriodDays: -1 }, '2027-02-01')).toBeNull();
  });
});

describe('hourly and partial-day requests in every balance unit', () => {
  const eightHour = { ...calendar, shiftMinutes: [480, 480, 480, 480, 480, 0, 0] };
  const fourTens = { workWeek: [true, true, true, true, false, false, false] as typeof DEFAULT_WORK_WEEK, offDays: [], shiftMinutes: [600, 600, 600, 600, 0, 0, 0] };
  const flat = { ...base, accrual: { kind: 'front-loaded' as const, amount: 0, grantDate: '2026-01-01' } };

  it('charges a 4h request on an 8h day as 0.5 day in a day-based balance', () => {
    const half = createPtoRequest({ start: '2027-01-04', end: '2027-01-04', status: 'approved', partialMinutes: 240 }, eightHour, 'half')!;
    expect(forecastWithRequests(flat, '2027-02-01', [half])!.confirmed).toMatchObject({ balance: 9.5, scheduled: 0.5 });
  });

  it('charges a 5h request against a 10h shift on a 4x10 schedule as 0.5 day, and a full 10h shift as 1 day', () => {
    const policy = { ...flat, shiftMinutes: [600, 600, 600, 600, 0, 0, 0] };
    const partial = createPtoRequest({ start: '2027-01-04', end: '2027-01-04', status: 'approved', partialMinutes: 300 }, fourTens, 'p')!;
    const full = createPtoRequest({ start: '2027-01-05', end: '2027-01-06', status: 'approved' }, fourTens, 'f')!;
    expect(forecastWithRequests(policy, '2027-02-01', [partial, full])!.confirmed).toMatchObject({ balance: 7.5, scheduled: 2.5 });
  });

  it('charges a policy planned day for that weekday shift in an hours balance', () => {
    const policy = { ...flat, unit: 'hours' as const, currentBalance: 80, hoursPerDay: 8, shiftMinutes: [600, 600, 600, 600, 0, 0, 0], plannedDays: ['2027-01-04'] };
    expect(forecastWithRequests(policy, '2027-02-01')!.confirmed).toMatchObject({ balance: 70, scheduled: 10 });
    // Without a per-weekday schedule the legacy hours-per-day charge is unchanged.
    expect(forecastWithRequests({ ...policy, shiftMinutes: undefined }, '2027-02-01')!.confirmed).toMatchObject({ balance: 72, scheduled: 8 });
  });

  it('keeps a legacy whole-day request at one day per date', () => {
    expect(forecastWithRequests(flat, '2027-02-01', [approved('w', '2027-01-04', '2027-01-05')])!.confirmed).toMatchObject({ balance: 8, scheduled: 2 });
  });
});
