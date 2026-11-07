import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest } from './requestLedger';
import { legacyVacationBank, type LeaveBank } from './leaveWallet';
import { projectWalletTimeline } from './leaveWalletTimeline';

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
