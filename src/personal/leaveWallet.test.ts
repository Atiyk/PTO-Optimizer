import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest } from './requestLedger';
import { legacyVacationBank, projectLeaveWallet, type LeaveBank } from './leaveWallet';

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
const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [] };
const approved = createPtoRequest(
  { start: '2027-01-20', end: '2027-01-21', status: 'approved' },
  calendar,
  'approved-trip',
)!;
const tentative = createPtoRequest(
  { start: '2027-02-03', end: '2027-02-03', status: 'requested' },
  calendar,
  'tentative-trip',
)!;

function sickBank(): LeaveBank {
  return {
    version: 1,
    id: 'sick',
    name: 'Sick leave',
    category: 'sick',
    policy: {
      ...policy,
      accrual: { kind: 'front-loaded', amount: 5, grantDate: '2027-01-01' },
      currentBalance: 5,
    },
    requestIds: [],
  };
}

describe('consumer unified leave wallet (pure canonical projection)', () => {
  it('projects two independent banks and assigns legacy requests only to vacation', () => {
    const snapshot = projectLeaveWallet([
      legacyVacationBank(policy, [approved, tentative]), sickBank(),
    ], '2027-02-15', [approved, tentative]);

    expect(snapshot?.bankCount).toBe(2);
    const vacation = snapshot?.banks[0];
    expect(vacation).toMatchObject({
      category: 'vacation',
      confirmedBalance: 10.5,
      tentativeBalance: 9.5,
      earned: 2.5,
      confirmedScheduled: 2,
      tentativeScheduled: 3,
      linkedRequestCount: 2,
    });
    expect(snapshot?.banks[1]).toMatchObject({
      category: 'sick',
      confirmedBalance: 5,
      tentativeBalance: 5,
      confirmedScheduled: 0,
      linkedRequestCount: 0,
    });
    expect(vacation?.events.some((event) => event.event.kind === 'accrual-credited')).toBe(true);
  });

  it('does not double-deduct a request already scheduled in policy plannedDays', () => {
    const withPolicyDate = { ...policy, plannedDays: ['2027-01-20'] };
    const snapshot = projectLeaveWallet([
      legacyVacationBank(withPolicyDate, [approved]),
    ], '2027-02-15', [approved]);
    expect(snapshot?.banks[0].confirmedBalance).toBe(10.5);
    expect(snapshot?.banks[0].confirmedScheduled).toBe(2);
  });

  it('rejects a request assigned to two banks rather than charging both', () => {
    const vacation = legacyVacationBank(policy, [approved]);
    const sick = { ...sickBank(), requestIds: [approved.id] };
    expect(projectLeaveWallet([vacation, sick], '2027-02-15', [approved])).toBeNull();
  });

  it('ignores unassigned request IDs rather than assigning them to every bank', () => {
    const vacation = legacyVacationBank(policy);
    const snapshot = projectLeaveWallet([vacation], '2027-02-15', [approved]);
    expect(snapshot?.banks[0].confirmedBalance).toBe(12.5);
    expect(snapshot?.banks[0].linkedRequestCount).toBe(0);
  });

  it('does not invent a cash balance for unlimited leave', () => {
    const unlimited = legacyVacationBank({
      ...policy,
      accrual: { kind: 'unlimited', expectedDaysPerYear: 20 },
    });
    expect(projectLeaveWallet([unlimited], '2027-02-15')?.banks[0]).toMatchObject({
      openingBalance: null,
      confirmedBalance: null,
      tentativeBalance: null,
    });
  });

  it('rejects malformed bank ownership and future forecast dates before computing', () => {
    const bank = legacyVacationBank(policy, [approved]);
    expect(projectLeaveWallet([{ ...bank, id: '../unsafe' }], '2027-02-15', [approved])).toBeNull();
    expect(projectLeaveWallet([bank, { ...bank, id: 'vacation' }], '2027-02-15', [approved])).toBeNull();
    expect(projectLeaveWallet([bank], '2026-12-31', [approved])).toBeNull();
    expect(projectLeaveWallet([bank], '2027-02-15', [approved, approved])).toBeNull();
  });
});
