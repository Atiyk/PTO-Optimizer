import { describe, expect, it } from 'vitest';
import type { TimeOffPolicy } from '../policy/model';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { generateAlerts } from '../policy/alerts';
import { projectBalance } from '../policy/projection';
import { generateReminderICS } from '../ui/icsExport';
import { createPtoRequest } from './requestLedger';
import { expirationReminders, expirationRisks } from './expiration';

const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, accrual: { kind: 'front-loaded', amount: 0, grantDate: '2026-01-01' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'capped', cap: 5 }, negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure', currentBalance: 12, balanceAsOf: '2026-10-01', plannedDays: [],
};

describe('expiration guard and calendar reminders', () => {
  it('warns only about the portion beyond the entered carryover limit', () => {
    expect(expirationRisks(policy, 'US', [], '2026-11-02')[0]).toMatchObject({ daysAtStake: 7, deadline: '2026-12-31', expirationDate: '2027-01-01', kind: 'forfeiture' });
    expect(expirationRisks({ ...policy, carryover: { mode: 'all' } }, 'US', [], '2026-11-02')).toEqual([]);
  });
  it('approved future leave reduces forfeiture while tentative leave remains separate', () => {
    const entry = createPtoRequest({ start: '2026-12-14', end: '2026-12-16', status: 'approved' }, { workWeek: DEFAULT_WORK_WEEK, offDays: [] }, 'one')!;
    expect(expirationRisks(policy, 'US', [entry], '2026-11-02')[0].daysAtStake).toBe(4);
    const params = new URLSearchParams(expirationRisks(policy, 'US', [entry], '2026-11-02')[0].ptoHref.split('?')[1]);
    expect(params.get('b')).toBe('4');
    expect(params.get('rv')).toBe('0');
    expect(params.get('bo')).toBe('2026-12-14,2026-12-15,2026-12-16');
    expect(expirationRisks(policy, 'US', [{ ...entry, status: 'requested' }], '2026-11-02')[0].daysAtStake).toBe(7);
  });
  it('uses the entered carried-day deadline inclusively, matching the policy projection', () => {
    const carried = { ...policy, currentBalance: 5, carryover: { mode: 'all' as const, useByDate: '2027-03-31' } };
    expect(expirationRisks(carried, 'US', [], '2026-11-02')[0]).toMatchObject({ kind: 'carryover', deadline: '2027-03-31', daysAtStake: 5 });
    expect(new URLSearchParams(expirationRisks(carried, 'US', [], '2026-11-02')[0].ptoHref.split('?')[1]).get('s')).toBe('2027-01-01');
  });
  it('warns about an existing carried portion without falsely expiring the entire current balance', () => {
    const existing = { ...policy, currentBalance: 12, currentCarriedBalance: 3, balanceAsOf: '2027-02-01', carryover: { mode: 'all' as const, useByDate: '2027-03-31' } };
    expect(expirationRisks(existing, 'US', [], '2027-02-01')[0]).toMatchObject({ kind: 'carryover', daysAtStake: 3, deadline: '2027-03-31' });
  });
  it('does not offer future front-loaded PTO before its actual grant date', () => {
    const futureGrant = { ...policy, currentBalance: 0, accrual: { kind: 'front-loaded' as const, amount: 10, grantDate: '2026-12-01' }, carryover: { mode: 'none' as const } };
    const risk = expirationRisks(futureGrant, 'US', [], '2026-11-02')[0];
    const params = new URLSearchParams(risk.ptoHref.split('?')[1]);
    expect(params.get('s')).toBe('2026-12-01');
    expect(params.get('b')).toBe('10');
    expect(params.has('ac')).toBe(false);
  });
  it('avoids suggesting a fractional day as a whole-day plan', () => {
    const fractional = { ...policy, currentBalance: 0.5, carryover: { mode: 'none' as const } };
    expect(expirationRisks(fractional, 'US', [], '2026-11-02')[0]).toMatchObject({ daysAtStake: 0.5, canPlan: false, planningBudget: 0 });
  });
  it('does not offer expiring PTO before a waiting period permits using it', () => {
    const waiting = { ...policy, balanceAsOf: '2026-11-02', waitingPeriodDays: 90 };
    expect(expirationRisks(waiting, 'US', [], '2026-11-02')[0]).toMatchObject({ canPlan: false, planningBudget: 0 });
    const shorterWait = { ...waiting, waitingPeriodDays: 14 };
    expect(new URLSearchParams(expirationRisks(shorterWait, 'US', [], '2026-11-02')[0].ptoHref.split('?')[1]).get('s')).toBe('2026-11-16');
  });
  it('converts native-hour alerts into day budgets without overallocating a fraction', () => {
    const hours = { ...policy, unit: 'hours' as const, currentBalance: 60, carryover: { mode: 'capped' as const, cap: 20 } };
    const alerts = generateAlerts(hours, projectBalance(hours, '2027-01-02').events, '2026-11-02', 'US');
    expect(alerts[0].text).toBe('You could lose 40 hours on 2027-01-01.');
    expect(alerts[0].daysAtStake).toBe(5);
    expect(new URLSearchParams(alerts[0].ptoHref.split('?')[1]).get('b')).toBe('5');
  });
  it('converts biweekly hour accrual to monthly day accrual for optimizer handoff', () => {
    const hours = { ...policy, unit: 'hours' as const, accrual: { kind: 'per-pay-period' as const, amount: 8, frequency: 'biweekly' as const, payDateAnchor: '2026-10-02' } };
    const alerts = generateAlerts(hours, [{ kind: 'forfeited', date: '2027-01-01', amount: 40 }], '2026-11-02', 'US');
    expect(Number(new URLSearchParams(alerts[0].ptoHref.split('?')[1]).get('am'))).toBeCloseTo(26 / 12, 10);
  });
  it('creates 60/30/7-day reminders before expiration and omits reminders already in the past', () => {
    const risks = expirationRisks(policy, 'US', [], '2026-10-01');
    expect(expirationReminders(risks, [60, 30, 7], '2026-10-01').map((r) => r.date)).toEqual(['2026-11-02', '2026-12-02', '2026-12-25']);
    expect(expirationReminders(risks, [60, 30, 7], '2026-12-10').map((r) => r.date)).toEqual(['2026-12-25']);
  });
  it('writes all-day ICS events with display alarms and exclusive next-day ends', () => {
    const reminders = expirationReminders(expirationRisks(policy, 'US', [], '2026-10-01'), [7], '2026-10-01');
    const ics = generateReminderICS(reminders, new Date('2026-10-01T12:00:00Z'));
    expect(ics).toContain('DTSTART;VALUE=DATE:20261225\r\nDTEND;VALUE=DATE:20261226');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:PT0S');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
  it('escapes reminder text, deduplicates IDs and drops invalid calendar dates', () => {
    const reminder = { id: 'safe', date: '2027-01-01', title: 'PTO, reminder; text\nnew', description: 'One\\two' };
    const ics = generateReminderICS([reminder, reminder, { ...reminder, id: 'bad', date: '2027-02-30' }], new Date('2026-10-01T12:00:00Z'));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('SUMMARY:PTO\\, reminder\\; text\\nnew');
    expect(ics).toContain('DESCRIPTION:One\\\\two');
  });
});
