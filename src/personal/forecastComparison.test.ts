import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest, type RequestCalendar } from './requestLedger';
import { compareVacationForecast } from './forecastComparison';

const policy: TimeOffPolicy = {
  unit: 'days',
  hoursPerDay: 8,
  accrual: { kind: 'per-pay-period', amount: 1.25, frequency: 'monthly', payDateAnchor: '2027-01-15' },
  planYear: { kind: 'calendar' },
  carryover: { mode: 'all' },
  negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure',
  currentBalance: 10,
  balanceAsOf: '2027-01-01',
  plannedDays: [],
};
const calendar: RequestCalendar = {
  workWeek: DEFAULT_WORK_WEEK,
  offDays: [],
  rangeStart: '2027-01-01',
  rangeEnd: '2027-12-31',
};
const request = (id: string, start: string, end = start, status: 'approved' | 'requested' | 'completed' = 'approved') =>
  createPtoRequest({ start, end, status, note: 'PRIVATE REQUEST NOTE' }, calendar, id)!;

describe('consumer vacation before/after forecast', () => {
  it('uses the same accrual engine and calculates the actual impact of a proposed break', () => {
    const result = compareVacationForecast(policy, '2027-02-15', [], calendar, '2027-01-04', '2027-01-05')!;
    expect(result.proposedPtoDates).toEqual(['2027-01-04', '2027-01-05']);
    expect(result.incrementalConfirmedDays).toBe(2);
    expect(result.confirmed.before.balance).toBe(12.5);
    expect(result.confirmed.after.balance).toBe(10.5);
    expect(result.confirmed.balanceChange).toBe(-2);
    expect(result.confirmed.scheduledChange).toBe(2);
    expect(result.confirmed.after.accrued).toBe(2.5);
    expect(result.employerCalendarCoverageDeclared).toBe(true);
  });

  it('does not double-charge approved leave or existing policy planned dates', () => {
    const existing = { ...policy, plannedDays: ['2027-01-05'] };
    const result = compareVacationForecast(existing, '2027-01-14', [request('a', '2027-01-04')], calendar, '2027-01-04', '2027-01-06')!;
    expect(result.overlappingConfirmedDays).toBe(2);
    expect(result.incrementalConfirmedDays).toBe(1);
    expect(result.confirmed.before.balance).toBe(8);
    expect(result.confirmed.after.balance).toBe(7);
    expect(result.confirmed.scheduledChange).toBe(1);
  });

  it('distinguishes confirmed and tentative baselines without mutating requests', () => {
    const pending = request('p', '2027-01-04', '2027-01-04', 'requested');
    const original = JSON.stringify(pending);
    const result = compareVacationForecast(policy, '2027-01-14', [pending], calendar, '2027-01-04', '2027-01-04')!;
    expect(result.confirmed.balanceChange).toBe(-1);
    expect(result.tentative.balanceChange).toBe(0);
    expect(result.incrementalConfirmedDays).toBe(1);
    expect(result.incrementalTentativeDays).toBe(0);
    expect(JSON.stringify(pending)).toBe(original);
    expect(JSON.stringify(result)).not.toContain('PRIVATE REQUEST NOTE');
    expect(JSON.stringify(result)).not.toContain('"id":"p"');
  });

  it('respects employer days off and the workweek instead of assuming every date costs PTO', () => {
    const withHoliday = { ...calendar, offDays: ['2027-01-04'] };
    const result = compareVacationForecast(policy, '2027-01-14', [], withHoliday, '2027-01-02', '2027-01-05')!;
    expect(result.proposedPtoDates).toEqual(['2027-01-05']);
    expect(result.confirmed.balanceChange).toBe(-1);
    expect(result.incrementalConfirmedDays).toBe(1);
  });

  it('preserves native hours and fractional workday conversion', () => {
    const hours = { ...policy, unit: 'hours' as const, currentBalance: 40, hoursPerDay: 7.5 };
    const result = compareVacationForecast(hours, '2027-01-14', [], calendar, '2027-01-04', '2027-01-05')!;
    expect(result.confirmed.before.balance).toBe(40);
    expect(result.confirmed.after.balance).toBe(25);
    expect(result.confirmed.scheduledChange).toBe(15);
    expect(result.confirmed.balanceChange).toBe(-15);
  });

  it('uses actual carryover projection rather than assuming every PTO day changes the end balance', () => {
    const resetPolicy: TimeOffPolicy = {
      ...policy,
      currentBalance: 10,
      balanceAsOf: '2026-12-01',
      accrual: { kind: 'front-loaded', amount: 0, grantDate: '2026-01-01' },
      carryover: { mode: 'capped', cap: 5 },
    };
    const coverage = { ...calendar, rangeStart: '2026-12-01' };
    const result = compareVacationForecast(resetPolicy, '2027-01-02', [], coverage, '2026-12-31', '2026-12-31')!;
    expect(result.confirmed.before.balance).toBe(5);
    expect(result.confirmed.after.balance).toBe(5);
    expect(result.confirmed.balanceChange).toBe(0);
    expect(result.confirmed.expiredChange).toBe(-1);
    expect(result.confirmed.scheduledChange).toBe(1);
  });

  it('does not invent a cashable balance for unlimited PTO', () => {
    const unlimited = { ...policy, accrual: { kind: 'unlimited' as const, expectedDaysPerYear: 20 } };
    const result = compareVacationForecast(unlimited, '2027-01-14', [], calendar, '2027-01-04', '2027-01-05')!;
    expect(result.confirmed.before.balance).toBeNull();
    expect(result.confirmed.after.balance).toBeNull();
    expect(result.confirmed.balanceChange).toBeNull();
  });

  it('discloses when complete employer calendar coverage has not been declared', () => {
    const result = compareVacationForecast(policy, '2027-01-14', [], { ...calendar, rangeStart: undefined, rangeEnd: undefined }, '2027-01-04', '2027-01-04')!;
    expect(result.employerCalendarCoverageDeclared).toBe(false);
  });

  it('rejects invalid, past, unbounded, out-of-coverage or malformed calendar inputs', () => {
    expect(compareVacationForecast(policy, '2027-01-14', [], calendar, '2027-01-00', '2027-01-04')).toBeNull();
    expect(compareVacationForecast(policy, '2027-01-14', [], calendar, '2027-01-01', '2027-01-04')).toBeNull();
    expect(compareVacationForecast(policy, '2027-01-14', [], calendar, '2027-01-14', '2027-01-15')).toBeNull();
    expect(compareVacationForecast(policy, '2027-01-14', [], calendar, '2027-02-01', '2027-02-02')).toBeNull();
    expect(compareVacationForecast(policy, '2027-01-14', [], calendar, '2028-01-02', '2028-01-02')).toBeNull();
    expect(compareVacationForecast(policy, '2027-01-14', [], { ...calendar, offDays: ['2027-02-30'] }, '2027-01-04', '2027-01-04')).toBeNull();
    expect(compareVacationForecast(policy, '2027-01-14', [], { ...calendar, workWeek: [true] as unknown as RequestCalendar['workWeek'] }, '2027-01-04', '2027-01-04')).toBeNull();
    expect(compareVacationForecast({ ...policy, currentBalance: NaN }, '2027-01-14', [], calendar, '2027-01-04', '2027-01-04')).toBeNull();
  });
});
