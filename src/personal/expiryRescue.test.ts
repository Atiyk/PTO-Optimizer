import { isPlanAddressKey } from '../ui/shareFormat';
import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK, type WorkWeek } from '@daysoff/engine/solver/types';
import { mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import type { TimeOffPolicy } from '../policy/model';
import { expirationReminders, expirationRisks } from './expiration';
import { formatRescueRange, rescuePlan, rescuePlans, rescueSentence, rescueSuggestions, rescueSuggestionText } from './expiryRescue';
import { createPtoRequest } from './requestLedger';

const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, accrual: { kind: 'front-loaded', amount: 0, grantDate: '2026-01-01' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'capped', cap: 5 }, negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure', currentBalance: 8, balanceAsOf: '2026-10-01', plannedDays: [],
};
const HOLIDAYS = ['2026-11-26', '2026-12-25', '2027-01-01'];
const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: HOLIDAYS };

function plansFor(p: TimeOffPolicy, today: string, cal: { workWeek: WorkWeek; offDays: string[] } = calendar) {
  const risks = expirationRisks(p, 'US', [], today);
  return { risks, plans: rescuePlans(risks, { policy: p, country: 'US', calendar: cal, today }) };
}

describe('rescuePlan', () => {
  it('solves a forfeiture rescue with the planner, inside the deadline, spending at most the budget', () => {
    const { risks, plans } = plansFor(policy, '2026-11-02');
    const plan = plans.get(risks[0].id)!;
    expect(plan).toMatchObject({ kind: 'forfeiture', deadline: '2026-12-31', daysAtRisk: 3, daysRescued: 3, daysStillAtRisk: 0, ptoDays: 3 });
    expect(plan.shortfall).toBeUndefined();
    expect(plan.ptoDays).toBeLessThanOrEqual(risks[0].planningBudget);
    for (const date of plan.ptoDates) {
      expect(date >= '2026-11-02' && date <= '2026-12-31').toBe(true);
      expect(HOLIDAYS).not.toContain(date);
      expect(mondayIndexedDow(date)).toBeLessThan(5);
    }
    expect(plan.totalDaysOff).toBeGreaterThan(plan.ptoDays);
    expect(plan.ptoHref).toContain('e=2026-12-31');
    expect(rescueSentence(plan)).toMatch(/^Take .+ to keep all 3 days\.$/);
  });

  it('is deterministic for a given today', () => {
    expect(JSON.stringify([...plansFor(policy, '2026-11-02').plans])).toBe(JSON.stringify([...plansFor(policy, '2026-11-02').plans]));
  });

  it('merges touching breaks and writes the single-break sentence', () => {
    const { risks, plans } = plansFor(policy, '2026-12-29');
    const plan = plans.get(risks[0].id)!;
    expect(plan.breaks).toEqual([{ start: '2026-12-29', end: '2026-12-31', ptoDates: ['2026-12-29', '2026-12-30', '2026-12-31'], ptoDays: 3, totalDaysOff: 3 }]);
    expect(rescueSentence(plan)).toBe('Take Dec 29–31 (3 PTO days) for 3 days off and keep all 3 days.');
    expect(rescueSuggestionText(plan)).toBe('Suggested: take Dec 29-31 (3 PTO days).');
  });

  it('says how many days cannot be rescued when the deadline is too close', () => {
    const { risks, plans } = plansFor(policy, '2026-12-31');
    const plan = plans.get(risks[0].id)!;
    expect(plan).toMatchObject({ ptoDays: 1, daysRescued: 1, daysStillAtRisk: 2 });
    expect(plan.shortfall).toMatchObject({ days: 2, reason: 'deadline' });
    expect(plan.shortfall!.message).toContain('only 1 working day is left');
    expect(rescueSentence(plan)).toBe('Take Dec 31 (1 PTO day) for 1 day off and keep 1 of 3 days.');
  });

  it('explains a balance that is not earned in time', () => {
    const late = { ...policy, currentBalance: 0, accrual: { kind: 'front-loaded' as const, amount: 10, grantDate: '2026-12-30' }, carryover: { mode: 'none' as const } };
    const { risks, plans } = plansFor(late, '2026-11-02');
    const plan = plans.get(risks[0].id)!;
    expect(plan.ptoDates).toEqual(['2026-12-30', '2026-12-31']);
    expect(plan.shortfall).toMatchObject({ days: 8, reason: 'not-earned' });
    expect(plan.shortfall!.message).toContain('only earned on Dec 30, 2026');
  });

  it('explains a waiting period that ends after the deadline, with no dates', () => {
    const { risks, plans } = plansFor({ ...policy, balanceAsOf: '2026-11-02', waitingPeriodDays: 90 }, '2026-11-02');
    const plan = plans.get(risks[0].id)!;
    expect(plan.breaks).toEqual([]);
    expect(plan.shortfall).toMatchObject({ days: 3, reason: 'waiting-period' });
  });

  it('reports blackout when scheduled leave fills the remaining working days', () => {
    const booked = ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-28', '2026-12-29'];
    const planned = { ...policy, currentBalance: 15, plannedDays: booked };
    const { risks, plans } = plansFor(planned, '2026-12-21');
    const plan = plans.get(risks[0].id)!;
    expect(plan.daysAtRisk).toBe(4);
    expect(plan.ptoDates).toEqual(['2026-12-30', '2026-12-31']);
    expect(plan.shortfall).toMatchObject({ days: 2, reason: 'blackout' });
  });

  it('honors planned and tentative requested dates and keeps them in the planner link', () => {
    const requested = createPtoRequest({ start: '2026-12-14', end: '2026-12-16', status: 'requested' }, { workWeek: DEFAULT_WORK_WEEK, offDays: [] }, 'r1')!;
    const planned = { ...policy, currentBalance: 12, plannedDays: ['2026-12-21', '2026-12-22'] };
    const risks = expirationRisks(planned, 'US', [requested], '2026-11-02');
    const plan = rescuePlan(risks[0], { policy: planned, country: 'US', requests: [requested], calendar, today: '2026-11-02' });
    expect(plan.daysAtRisk).toBe(5);
    for (const date of ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-21', '2026-12-22']) expect(plan.ptoDates).not.toContain(date);
    // Privacy (Issue 2): no reserved dates in the navigable link. Ledger dates are derived
    // by the planner itself; manually planned days travel in the on-device hand-off.
    const linkParams = new URLSearchParams(plan.ptoHref.split('?')[1]);
    expect(linkParams.has('bo')).toBe(false);
    for (const key of linkParams.keys()) expect(isPlanAddressKey(key), key).toBe(true);
    expect(plan.privatePlan).toBe('bo=2026-12-21%2C2026-12-22');
    expect(plan.daysStillAtRisk).toBe(0);
  });

  it('places an expiring carried bank after its reset and before its use-by date', () => {
    const carried = { ...policy, currentBalance: 5, carryover: { mode: 'all' as const, useByDate: '2027-03-31' } };
    const { risks, plans } = plansFor(carried, '2026-11-02');
    const plan = plans.get(risks[0].id)!;
    expect(plan.kind).toBe('carryover');
    expect(plan.window).toEqual({ start: '2027-01-01', end: '2027-03-31' });
    expect(plan.ptoDates.every((date) => date >= '2027-01-01' && date <= '2027-03-31')).toBe(true);
    expect(plan).toMatchObject({ daysRescued: 5, daysStillAtRisk: 0 });
  });

  it('makes room under an accrual cap', () => {
    const capped = { ...policy, currentBalance: 19, accrualCap: 20, accrual: { kind: 'per-pay-period' as const, amount: 1.25, frequency: 'monthly' as const, payDateAnchor: '2026-10-15' }, carryover: { mode: 'all' as const } };
    const { risks, plans } = plansFor(capped, '2026-11-02');
    const plan = plans.get(risks[0].id)!;
    expect(plan.kind).toBe('cap');
    expect(plan.ptoDates.every((date) => date <= risks[0].deadline)).toBe(true);
    expect(plan.daysStillAtRisk).toBe(0);
    expect(rescueSentence(plan)).toContain('to make room under your accrual cap and keep earning.');
  });

  it('plans hours policies in whole days and reports the remainder in hours', () => {
    const hours = { ...policy, unit: 'hours' as const, currentBalance: 62, carryover: { mode: 'capped' as const, cap: 20 } };
    const { risks, plans } = plansFor(hours, '2026-11-02');
    const plan = plans.get(risks[0].id)!;
    expect(plan).toMatchObject({ ptoDays: 5, daysAtRisk: 5.25, daysStillAtRisk: 0.25, unit: 'hours' });
    expect(plan.shortfall).toMatchObject({ reason: 'partial-day' });
    expect(rescueSentence(plan)).toContain('keep 40 of 42 hours');
  });

  it('respects a custom work week', () => {
    const fourDay: WorkWeek = [true, true, true, true, false, false, false];
    const { risks, plans } = plansFor(policy, '2026-11-02', { workWeek: fourDay, offDays: HOLIDAYS });
    const plan = plans.get(risks[0].id)!;
    expect(plan.ptoDates.every((date) => mondayIndexedDow(date) < 4)).toBe(true);
    expect(new URLSearchParams(plan.ptoHref.split('?')[1]).get('ww')).toBe('1111000');
  });

  it('formats date ranges compactly', () => {
    expect(formatRescueRange('2026-12-22', '2026-12-24')).toBe('Dec 22–24');
    expect(formatRescueRange('2026-11-30', '2026-12-02', '-')).toBe('Nov 30-Dec 2');
    expect(formatRescueRange('2026-12-30', '2027-01-02')).toBe('Dec 30, 2026–Jan 2, 2027');
    expect(formatRescueRange('2026-12-22', '2026-12-22')).toBe('Dec 22');
  });
});

describe('reminders carry the rescue dates', () => {
  it('names the suggested dates and keeps the download honesty text', () => {
    const { risks, plans } = plansFor(policy, '2026-12-20');
    const reminders = expirationReminders(risks, [30, 7], '2026-12-20', rescueSuggestions(plans));
    // The 7-day reminder fires Dec 25: the Dec 23 break has already started by then.
    expect(reminders).toHaveLength(1);
    expect(reminders[0].date).toBe('2026-12-25');
    expect(reminders[0].description).toContain('Last day to use it: 2026-12-31. Suggested: take Dec 31 (1 PTO day).');
    expect(reminders[0].description).toContain('this calendar file does not update automatically');
  });
  it('leaves out breaks that start before the reminder fires', () => {
    const { risks, plans } = plansFor(policy, '2026-10-01');
    const suggestions = rescueSuggestions(plans);
    const [late] = expirationReminders(risks, [7], '2026-10-01', suggestions);
    const starts = plans.get(risks[0].id)!.breaks.map((brk) => brk.start);
    if (starts.every((start) => start < late.date)) expect(late.description).not.toContain('Suggested');
    const [early] = expirationReminders(risks, [60], '2026-10-01', suggestions);
    expect(early.description).toContain('Suggested: take');
  });
});
