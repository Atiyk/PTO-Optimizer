import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest, type PtoRequest } from '../personal/requestLedger';
import { buildDashboard, breakForRequestText } from './returningDashboard';
import { isQuietWindow } from '@daysoff/engine/calendar/requestDeadline';
import type { PlanSnapshot } from './useAppState';

const TODAY = '2026-11-14';
const CAL = { workWeek: DEFAULT_WORK_WEEK, offDays: [], rangeStart: '2026-01-01', rangeEnd: '2028-12-31' };
const req = (start: string, end: string, status: PtoRequest['status'], id: string, extra: { noticePeriodDays?: number } = {}) =>
  createPtoRequest({ start, end, status, ...extra }, CAL, id, '2026-10-01T00:00:00.000Z')!;

export const PLAN: PlanSnapshot = {
  country: 'US', subdivision: undefined, planningVersion: 2, planningStyle: 'balanced', minimumBreakDays: 3,
  employerCalendar: { version: 1, country: 'US', excluded: [], custom: [] },
  rangeStart: '2026-11-14', rangeEnd: '2027-11-13', budget: 15, w: 30,
  letSolverDecide: true, manualBreakCount: 3, weekStartOverride: 'auto', accrualEnabled: false,
  accrualPerMonth: 1.25, expiryEnabled: false, expiryDate: '', carryoverCap: 0,
  overlapDays: [], blackouts: [], workWeek: DEFAULT_WORK_WEEK, forced: {}, altFridayEnabled: false, altFridayStart: '',
  reserveDays: 0, applyTrackedRequests: false, reserveApprovedPto: false, unlimitedPto: false, noticePeriodDays: 14,
  peakCapEnabled: false, peakCapStart: '', peakCapEnd: '', peakCapMaxDays: 5,
  summary: { budgetSpent: 12, totalDaysOff: 31, breakCountActual: 2, travelPercentile: null },
  breaks: [
    // Thanksgiving week: Mon Nov 23 – Wed Nov 25 PTO, Sat Nov 21 – Sun Nov 29.
    { start: '2026-11-21', end: '2026-11-29', totalDaysOff: 9, ptoCost: 3, ptoDates: ['2026-11-23', '2026-11-24', '2026-11-25'] },
    { start: '2027-03-20', end: '2027-04-04', totalDaysOff: 16, ptoCost: 9, ptoDates: ['2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26', '2027-03-29', '2027-03-30', '2027-03-31', '2027-04-01'] },
  ],
};
const LATER_PLAN: PlanSnapshot = { ...PLAN, breaks: [PLAN.breaks![1]] };

describe('returning dashboard model (P3)', () => {
  it('shows nothing to someone with nothing saved', () => {
    expect(buildDashboard({ requests: [], plans: [], today: TODAY })).toBeNull();
    // Only finished or past requests: nothing to come back to.
    expect(buildDashboard({ requests: [req('2026-10-01', '2026-10-02', 'approved', 'past'), req('2026-12-01', '2026-12-01', 'rejected', 'no')], plans: [], today: TODAY })).toBeNull();
  });

  it('plan with no requests: next break from the plan, its request-by date, copy the request first', () => {
    const model = buildDashboard({ requests: [], plans: [LATER_PLAN], today: TODAY })!;
    expect(model.state).toBe('next-break');
    expect(model.next).toMatchObject({ start: '2027-03-20', end: '2027-04-04', totalDaysOff: 16, ptoDays: 9, status: 'in-plan' });
    // The notice counts back from the first working day off, Mon Mar 22: Mon Mar 8.
    expect(model.next!.submitBy?.date).toBe('2027-03-08');
    expect(model.action).toBe('copy-request');
    expect(model.pto).toEqual({ available: 15, planned: 12, unplanned: 3 });
    expect(model.reminder).toBeUndefined();
    expect(model.planLink!.href.startsWith('/pto?')).toBe(true);
    // Once the text is copied, the next step is marking it requested.
    expect(buildDashboard({ requests: [], plans: [LATER_PLAN], today: TODAY, copied: true })!.action).toBe('mark-requested');
  });

  it('requested: the next step is marking it approved, and no request-by reminder', () => {
    const requested = req('2027-03-20', '2027-04-04', 'requested', 'r1');
    const model = buildDashboard({ requests: [requested], plans: [LATER_PLAN], today: TODAY })!;
    expect(model.next).toMatchObject({ status: 'requested', request: requested });
    expect(model.action).toBe('mark-approved');
    expect(model.pto?.requested).toBe(requested.ptoDays);
    expect(model.reminder).toBeUndefined();
  });

  it('approved: open the plan; the PTO line counts approved days in the plan', () => {
    const approved = req('2027-03-20', '2027-04-04', 'approved', 'a1');
    const model = buildDashboard({ requests: [approved], plans: [LATER_PLAN], today: TODAY })!;
    expect(model.next?.status).toBe('approved');
    expect(model.action).toBe('open-plan');
    expect(model.pto).toEqual({ available: 15, planned: 12, approved: approved.ptoDays, unplanned: 3 });
  });

  it('a tracked request without a saved plan opens in My PTO', () => {
    const model = buildDashboard({ requests: [req('2027-03-22', '2027-03-26', 'approved', 'a1')], plans: [], today: TODAY })!;
    expect(model.action).toBe('open-tracker');
    expect(model.pto).toEqual({ approved: 5 });
  });

  it('deadline soon: one reminder when the request-by date is within 14 days', () => {
    // Thanksgiving break: 14 days before Mon Nov 23 is Mon Nov 9, already passed on Nov 14.
    const passed = buildDashboard({ requests: [], plans: [PLAN], today: TODAY })!;
    expect(passed.next?.start).toBe('2026-11-21');
    expect(passed.reminder).toEqual({ kind: 'notice-passed', date: '2026-11-09', noticePeriodDays: 14, noticeUnit: 'calendar' });

    const soon = buildDashboard({ requests: [], plans: [LATER_PLAN], today: '2027-02-25' })!;
    expect(soon.reminder).toEqual({ kind: 'request-by-soon', date: '2027-03-08', days: 11 });
    expect(buildDashboard({ requests: [], plans: [LATER_PLAN], today: '2027-02-18' })!.reminder).toBeUndefined();
  });

  it('expiry: a reminder only when the person entered an expiry within 60 days', () => {
    const withExpiry = { ...LATER_PLAN, expiryEnabled: true, expiryDate: '2026-12-31' };
    expect(buildDashboard({ requests: [], plans: [withExpiry], today: TODAY })!.reminder).toEqual({ kind: 'expiry-soon', date: '2026-12-31', days: 47 });
    expect(buildDashboard({ requests: [], plans: [{ ...withExpiry, expiryDate: '2027-06-30' }], today: TODAY })!.reminder).toBeUndefined();
  });

  it('at most one reminder: the request-by date wins over expiry', () => {
    const both = { ...PLAN, expiryEnabled: true, expiryDate: '2026-12-31' };
    expect(buildDashboard({ requests: [], plans: [both], today: TODAY })!.reminder?.kind).toBe('notice-passed');
  });

  it('past breaks only: says so and opens the plan, with no next break', () => {
    const past = { ...PLAN, rangeStart: '2026-01-01', rangeEnd: '2026-10-31', breaks: [{ start: '2026-05-23', end: '2026-05-31', totalDaysOff: 9, ptoCost: 4, ptoDates: ['2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29'] }] };
    const model = buildDashboard({ requests: [], plans: [past], today: TODAY })!;
    expect(model.state).toBe('past-only');
    expect(model.next).toBeUndefined();
    expect(model.action).toBe('open-plan');
    expect(model.reminder).toBeUndefined();
  });

  it('an older saved plan without stored breaks still opens, from its summary', () => {
    const { breaks: _breaks, ...old } = PLAN;
    const model = buildDashboard({ requests: [], plans: [old], today: TODAY })!;
    expect(model.state).toBe('plan-only');
    expect(model.action).toBe('open-plan');
  });

  it('a break already rejected in My PTO does not come back as a plan break', () => {
    const model = buildDashboard({ requests: [req('2027-03-20', '2027-04-04', 'rejected', 'x')], plans: [LATER_PLAN], today: TODAY })!;
    expect(model.state).toBe('plan-only');
  });

  it('omits figures the app does not have (accrual, unlimited PTO)', () => {
    expect(buildDashboard({ requests: [], plans: [{ ...LATER_PLAN, accrualEnabled: true }], today: TODAY })!.pto).toEqual({ planned: 12 });
    expect(buildDashboard({ requests: [], plans: [{ ...LATER_PLAN, unlimitedPto: true }], today: TODAY })!.pto).toBeUndefined();
  });

  it('writes request text without claiming a quieter travel period', () => {
    const model = buildDashboard({ requests: [], plans: [LATER_PLAN], today: TODAY })!;
    const brk = breakForRequestText(model.next!);
    expect(brk.ptoCost).toBe(9);
    expect(isQuietWindow(brk)).toBe(false);
  });
});
