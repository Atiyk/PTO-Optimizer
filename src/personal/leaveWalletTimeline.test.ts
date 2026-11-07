import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest } from './requestLedger';
import { legacyVacationBank, type LeaveBank } from './leaveWallet';
import { projectWalletTimeline, selectWalletBalancesAsOf, selectWalletNextEvents } from './leaveWalletTimeline';

const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, currentBalance: 10, balanceAsOf: '2027-01-01',
  accrual: { kind: 'per-pay-period', amount: 1.25, frequency: 'monthly', payDateAnchor: '2027-01-15' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'all' },
  negativeBalanceAllowance: 0, payoutOnLeaving: 'not-sure', plannedDays: [],
};
const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [] };
const approved = createPtoRequest({ start: '2027-01-20', end: '2027-01-21', status: 'approved' }, calendar, 'approved')!;
const pending = createPtoRequest({ start: '2027-02-03', end: '2027-02-03', status: 'requested' }, calendar, 'pending')!;

describe('wallet timeline canonical selectors', () => {
  it('provides fractional accrual and separate confirmed/tentative balances by date', () => {
    const result = projectWalletTimeline([legacyVacationBank(policy, [approved, pending])], '2027-02-15', [approved, pending]);
    expect(result?.points.find((point) => point.date === '2027-02-15')).toMatchObject({
      confirmedBalance: 10.5, tentativeBalance: 9.5, tentativeAdditionalDebit: 1,
    });
    expect(result?.events.filter((event) => event.category === 'earned').map((event) => event.amount)).toEqual([1.25, 1.25]);
    expect(result?.events.filter((event) => event.category === 'approved-debit')).toHaveLength(2);
    expect(result?.nextEvents.vacation?.effectiveDate).toBe('2027-01-15');
  });

  it('does not double-debit overlapping approved requests or preexisting planned days', () => {
    const overlap = createPtoRequest({ start: '2027-01-21', end: '2027-01-21', status: 'approved' }, calendar, 'overlap')!;
    const bank = legacyVacationBank({ ...policy, plannedDays: ['2027-01-20'] }, [approved, overlap]);
    const result = projectWalletTimeline([bank], '2027-02-15', [approved, overlap]);
    expect(result?.events.filter((event) => event.category === 'approved-debit')).toHaveLength(2);
    expect(result?.points.at(-1)?.confirmedBalance).toBe(10.5);
  });

  it('keeps sick and vacation separate and never assigns sick payout rights', () => {
    const sick: LeaveBank = {
      ...legacyVacationBank({ ...policy, currentBalance: 4, payoutOnLeaving: 'doesnt' }),
      id: 'sick', name: 'Sick', category: 'sick', requestIds: [],
    };
    const result = projectWalletTimeline([legacyVacationBank(policy), sick], '2027-01-15');
    expect(result?.points.filter((point) => point.date === '2027-01-15')).toHaveLength(2);
    expect(sick.policy.payoutOnLeaving).toBe('doesnt');
    expect(result?.events.filter((event) => event.category === 'opening')).toHaveLength(2);
  });

  it('rejects malformed dates and conflicting request ownership', () => {
    const bank = legacyVacationBank(policy, [approved]);
    expect(projectWalletTimeline([bank], '2027-02-30', [approved])).toBeNull();
    expect(projectWalletTimeline([bank, { ...bank, id: 'second' }], '2027-02-15', [approved])).toBeNull();
  });
});

describe('exact-date wallet selectors', () => {
  it('selects only the requested day without summing separate banks', () => {
    const sick: LeaveBank = {
      ...legacyVacationBank({ ...policy, currentBalance: 4, payoutOnLeaving: 'doesnt' }),
      id: 'sick', name: 'Sick', category: 'sick', requestIds: [],
    };
    const timeline = projectWalletTimeline([legacyVacationBank(policy, [approved, pending]), sick], '2027-02-15', [approved, pending])!;
    const asOf = selectWalletBalancesAsOf(timeline, '2027-02-15')!;
    expect(asOf).toHaveLength(2);
    expect(asOf.find((point) => point.bankId === 'vacation')).toMatchObject({
      confirmedBalance: 10.5, tentativeBalance: 9.5,
    });
    expect(asOf.find((point) => point.bankId === 'sick')?.confirmedBalance).toBe(6.5);
    expect(selectWalletBalancesAsOf(timeline, '2027-02-16')).toBeNull();
    expect(selectWalletBalancesAsOf(timeline, '2027-02-30')).toBeNull();
    expect(selectWalletBalancesAsOf(timeline, '2027-2-15')).toBeNull();
    expect(selectWalletBalancesAsOf(timeline, '2027-02-00')).toBeNull();
    asOf[0].confirmedBalance = -999;
    expect(selectWalletBalancesAsOf(timeline, '2027-02-15')?.[0].confirmedBalance).not.toBe(-999);
  });

  it('indexes reserved JavaScript property names without prototype mutation or lost events', () => {
    const reserved = ['__proto__', 'constructor', 'toString'];
    const banks: LeaveBank[] = reserved.map((id) => ({
      ...legacyVacationBank(policy), id, name: id, requestIds: [],
    }));
    const timeline = projectWalletTimeline(banks, '2027-02-15');
    expect(timeline).not.toBeNull();
    expect(Object.getPrototypeOf(timeline!.nextEvents)).toBeNull();
    expect(Object.keys(timeline!.nextEvents).sort()).toEqual([...reserved].sort());
    for (const id of reserved) {
      expect(Object.hasOwn(timeline!.nextEvents, id)).toBe(true);
      expect(timeline!.nextEvents[id]?.effectiveDate).toBe('2027-01-15');
    }
    const next = selectWalletNextEvents(timeline!, '2027-01-15');
    expect(next).not.toBeNull();
    if (next === null) throw new Error('Expected next wallet events for reserved bank IDs');
    expect(Object.getPrototypeOf(next)).toBeNull();
    for (const id of reserved) {
      expect(Object.hasOwn(next, id)).toBe(true);
      expect(next![id]?.effectiveDate).toBe('2027-02-15');
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('finds next actual canonical event after an arbitrary as-of date', () => {
    const timeline = projectWalletTimeline([legacyVacationBank(policy, [approved])], '2027-02-15', [approved])!;
    expect(selectWalletNextEvents(timeline, '2027-01-01')?.vacation?.effectiveDate).toBe('2027-01-15');
    expect(selectWalletNextEvents(timeline, '2027-01-15')?.vacation?.effectiveDate).toBe('2027-01-20');
    expect(selectWalletNextEvents(timeline, '2027-02-15')?.vacation).toBeNull();
    expect(selectWalletNextEvents(timeline, '2027-02-30')).toBeNull();
    expect(selectWalletNextEvents(timeline, '2027-02-00')).toBeNull();
    expect(selectWalletNextEvents(timeline, '2027-1-15')).toBeNull();
  });
});
