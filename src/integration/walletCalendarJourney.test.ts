import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest } from '../personal/requestLedger';
import { legacyVacationBank, projectLeaveWallet } from '../personal/leaveWallet';
import { projectWalletTimeline, selectWalletBalancesAsOf } from '../personal/leaveWalletTimeline';
import { buildIntegratedCalendarEvidence } from './calendarEvidence';
import { jointWindowFeasibility } from '../personal/recurringAvailability';

const basePolicy: TimeOffPolicy = {
  unit: 'days',
  hoursPerDay: 8,
  currentBalance: 1,
  balanceAsOf: '2027-01-01',
  accrual: { kind: 'per-pay-period', amount: 1.25, frequency: 'monthly', payDateAnchor: '2027-01-15' },
  planYear: { kind: 'calendar' },
  carryover: { mode: 'all' },
  negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure',
  plannedDays: [],
};
const workCalendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [] };
const schedule = { kind: 'weekly' as const, weekly: DEFAULT_WORK_WEEK };

describe('integration: independent wallet funding and family calendars', () => {
  it('keeps approved debits, tentative requests, sick leave and partner budgets independent', () => {
    const approved = createPtoRequest(
      { start: '2027-01-20', end: '2027-01-20', status: 'approved', note: 'PRIVATE APPOINTMENT' },
      workCalendar, 'approved',
    )!;
    const pending = createPtoRequest(
      { start: '2027-01-22', end: '2027-01-22', status: 'requested', note: 'PRIVATE PLAN' },
      workCalendar, 'pending',
    )!;
    const vacation = legacyVacationBank(basePolicy, [approved, pending]);
    const sick = {
      ...legacyVacationBank({ ...basePolicy, currentBalance: 30, payoutOnLeaving: 'doesnt' as const }),
      id: 'sick', category: 'sick' as const, name: 'Sick leave',
    };
    const other = { ...legacyVacationBank(basePolicy), id: 'other', name: 'Second adult vacation' };
    const wallet = projectLeaveWallet([vacation, sick], '2027-01-22', [approved, pending])!;
    const otherWallet = projectLeaveWallet([other], '2027-01-22')!;
    expect(wallet).not.toBeNull();
    expect(wallet.banks[0]).toMatchObject({
      confirmedBalance: 1.25, tentativeBalance: 0.25, confirmedScheduled: 1, tentativeScheduled: 2,
    });
    expect(wallet.banks[1].confirmedBalance).toBe(31.25);
    expect(otherWallet.banks[0].confirmedBalance).toBe(2.25);

    const timeline = projectWalletTimeline([vacation], '2027-01-22', [approved, pending])!;
    expect(selectWalletBalancesAsOf(timeline, '2027-01-22')?.[0])
      .toMatchObject({ confirmedBalance: 1.25, tentativeBalance: 0.25 });

    const a = buildIntegratedCalendarEvidence({
      start: '2027-01-20', end: '2027-01-22', schedule,
      approvedOffDays: ['2027-01-20'], employerOffDays: ['2027-01-21'],
      schoolOffDays: ['2027-01-21'], calendarPartial: false,
    }, [{
      source: 'ics', completeness: 'complete',
      events: [{ start: '2027-01-22', end: '2027-01-22', blocking: 'review', title: 'PRIVATE CALENDAR TITLE' } as never],
    }])!;
    const b = buildIntegratedCalendarEvidence({
      start: '2027-01-20', end: '2027-01-22', schedule,
      employerOffDays: ['2027-01-20'], calendarPartial: false,
    }, [])!;
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const joint = jointWindowFeasibility(
      a.availability, b.availability,
      Math.floor(wallet.banks[0].confirmedBalance!), Math.floor(otherWallet.banks[0].confirmedBalance!),
    );
    expect(joint).toMatchObject({
      possible: true, ptoDaysA: 1, ptoDaysB: 2, hardBlockDates: [],
      reviewDates: ['2027-01-22'], partial: false,
    });
    expect(a.constraints.dates).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2027-01-20', provenance: 'approved-leave', severity: 'context' }),
      expect.objectContaining({ date: '2027-01-21', provenance: 'school-closure', severity: 'context' }),
    ]));
    // A tentative reservation is not yet an approved day off or an extra available PTO budget.
    expect(jointWindowFeasibility(a.availability, b.availability, 0, 2)?.possible).toBe(false);
    expect(JSON.stringify(wallet) + JSON.stringify(a) + JSON.stringify(joint))
      .not.toMatch(/PRIVATE APPOINTMENT|PRIVATE PLAN|PRIVATE CALENDAR TITLE/);
  });

  it('never treats an explicit hard calendar blackout as merely advisory', () => {
    const a = buildIntegratedCalendarEvidence({
      start: '2027-01-20', end: '2027-01-22', schedule,
      hardBlockDays: ['2027-01-22'], calendarPartial: false,
    }, [])!;
    const b = buildIntegratedCalendarEvidence({
      start: '2027-01-20', end: '2027-01-22', schedule, calendarPartial: false,
    }, [])!;
    expect(jointWindowFeasibility(a.availability, b.availability, 10, 10))
      .toMatchObject({ possible: false, hardBlockDates: ['2027-01-22'] });
  });
});
