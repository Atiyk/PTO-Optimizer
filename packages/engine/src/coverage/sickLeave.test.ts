import { describe, expect, it } from 'vitest';
import { LABOR_US_CA, LABOR_US_CO, LABOR_US_NY_NYC, LABOR_US_WA } from '../../rulepacks/labor';
import { validatePolicy } from '../leave/policy';
import { projectBalance, type LedgerEntryInput } from '../leave/projection';
import { annualUseCheck, sickPolicyFromRule, weeklyHours } from './sickLeave';
import { rulesOf, type RulePack } from './types';

const rule = (pack: RulePack, id?: string) => rulesOf(pack, 'sick_accrual').find((r) => !id || r.id === id)!;
const START = '2026-01-05'; // a Monday
const member = (hours: { periodStart: string; periodEnd: string; hours: number }[]) => ({
  startDate: START,
  workWeek: [true, true, true, true, true, false, false] as const,
  hoursPerDay: 8,
  hoursWorked: hours,
});
const v = (policy: ReturnType<typeof sickPolicyFromRule>) => [{ effectiveFrom: '2026-01-01', policy }];
const at = (policy: ReturnType<typeof sickPolicyFromRule>, hours: ReturnType<typeof weeklyHours>, asOf: string, ledger: LedgerEntryInput[] = []) =>
  projectBalance({ policies: v(policy), member: { ...member(hours), workWeek: [...member(hours).workWeek] }, ledger, asOf });

const y26 = weeklyHours(START, 51, 40); // weeks ending 2026-01-11 … 2026-12-27: 2,040 h
const y27 = weeklyHours('2026-12-28', 52, 40);

describe('hourly sick leave from imported hours (RC6, COVERAGE-SPEC §5 hand-verified)', () => {
  it('CA: 1 per 30, locked until day 90, 68 h by year end, carried, capped at 80 after 9 more weeks', () => {
    const p = sickPolicyFromRule(rule(LABOR_US_CA));
    expect(validatePolicy(p)).toEqual([]);
    const mar = at(p, y26, '2026-03-29');
    expect(mar.asOf).toMatchObject({ balance: 16, usable: 0, lockedUntil: '2026-04-04' });
    expect(at(p, y26, '2026-04-04').asOf).toMatchObject({ balance: 16, usable: 16, lockedUntil: null });
    expect(at(p, y26, '2026-12-31').asOf.balance).toBe(68);
    const both = [...y26, ...y27];
    expect(at(p, both, '2027-01-01').asOf.balance).toBe(68);
    expect(at(p, both, '2027-02-28').asOf.balance).toBe(80);
    const mar27 = at(p, both, '2027-03-31');
    expect(mar27.asOf.balance).toBe(80);
    const paused = mar27.timeline.find((e) => e.date === '2027-03-07')!;
    expect(paused.note).toContain('at cap');
    expect(mar27.timeline.find((e) => e.date === '2026-01-11')!.note).toBe('1 per 30 hours worked × 40 hours (2026-01-05 to 2026-01-11)');
  });

  it('CA frontloaded: 40 h each year, unused forfeited at year end, no carryover', () => {
    const p = sickPolicyFromRule(rule(LABOR_US_CA), { frontload: true });
    expect(at(p, [], '2026-06-01').asOf.balance).toBe(40);
    const used: LedgerEntryInput[] = [{ kind: 'usage', amount: -10, effectiveDate: '2026-06-02' }];
    const jan = at(p, [], '2027-01-01', used);
    expect(jan.asOf.balance).toBe(40);
    expect(jan.timeline.find((e) => e.kind === 'forfeiture')!.amount).toBe(-30);
  });

  it('NYC (100+ employees): 2,000 h earns 66.67 but caps at 56; 20 used → 36 carried; 2027 balance can reach 92 but only 56 can be used', () => {
    const p = sickPolicyFromRule(rule(LABOR_US_NY_NYC, 'nyc-sick-100'));
    const h26 = weeklyHours(START, 50, 40); // 2,000 h
    const used: LedgerEntryInput[] = [{ kind: 'usage', amount: -20, effectiveDate: '2026-06-01' }];
    const dec = at(p, h26, '2026-12-31', used);
    expect(dec.asOf.balance).toBe(36);
    expect(dec.timeline.some((e) => e.note.includes('annual accrual cap of 56 reached'))).toBe(true);
    const h27 = weeklyHours('2027-01-04', 50, 40);
    const end27 = at(p, [...h26, ...h27], '2027-12-31', used);
    expect(end27.asOf.balance).toBe(92);
    const cap = annualUseCheck(p, used, { start: '2027-01-01', end: '2027-12-31' }, 60);
    expect(cap).toEqual({ cap: 56, usedThisYear: 0, remaining: 56, fits: false });
    expect(annualUseCheck(p, used, { start: '2026-01-01', end: '2026-12-31' }, 36)).toEqual({ cap: 56, usedThisYear: 20, remaining: 36, fits: true });
  });

  it('NYC (5–99): caps at 40; a 100-hour carry is cut to 40', () => {
    const p = sickPolicyFromRule(rule(LABOR_US_NY_NYC, 'nyc-sick-5-99'));
    expect(at(p, y26, '2026-12-31').asOf.balance).toBe(40);
    expect(at(p, [...y26, ...weeklyHours('2027-01-04', 1, 30)], '2027-01-10').asOf.balance).toBe(41);
  });

  it('CO: 1 per 30 up to 48 a year, carry forward up to 48, usable as accrued', () => {
    const p = sickPolicyFromRule(rule(LABOR_US_CO));
    expect(at(p, y26, '2026-01-11').asOf).toMatchObject({ balance: 1.3333, usable: 1.3333 });
    expect(at(p, y26, '2026-12-31').asOf.balance).toBe(48);
    expect(at(p, [...y26, ...y27], '2027-01-01').asOf.balance).toBe(48);
  });

  it('WA: 1 per 40; usable from the 90th day after starting; carryover capped at 40', () => {
    const p = sickPolicyFromRule(rule(LABOR_US_WA));
    expect(at(p, y26, '2026-04-04').asOf).toMatchObject({ balance: 12, usable: 0, lockedUntil: '2026-04-05' });
    expect(at(p, y26, '2026-12-31').asOf.balance).toBe(51);
    const jan = at(p, [...y26, ...y27], '2027-01-01');
    expect(jan.asOf.balance).toBe(40);
    expect(jan.timeline.find((e) => e.kind === 'forfeiture')!.amount).toBe(-11);
  });

  it('cumulative rounding keeps a year exact for odd hours', () => {
    const p = sickPolicyFromRule(rule(LABOR_US_CO));
    const odd = Array.from({ length: 30 }, (_, i) => ({ ...weeklyHours(START, 30, 0)[i]!, hours: 7.25 }));
    expect(at(p, odd, '2026-12-31').asOf.balance).toBe(7.25); // 30 × 7.25 = 217.5 h / 30
  });

  it('validation catches bad new fields; MVP per-hour policies are unchanged (scheduled hours)', () => {
    const p = sickPolicyFromRule(rule(LABOR_US_CA));
    const bad = { ...p, annualUseCap: -1, accrual: { ...p.accrual, hoursPerUnit: 0 } } as typeof p;
    expect(validatePolicy(bad)).toEqual(['accrual.hoursPerUnit must be > 0', 'annualUseCap must be a number ≥ 0']);
    const scheduled = { ...p, waitingPeriod: null, accrual: { method: 'per_hour_worked' as const, ratePerHour: 0.05, payPeriod: 'monthly' as const } };
    const proj = at(scheduled, y26, '2026-01-31');
    expect(proj.timeline[0]!.note).toContain('scheduled hours');
  });

  it('a frontload option is required to frontload', () => {
    expect(() => sickPolicyFromRule({ ...rule(LABOR_US_WA) }, { frontload: true })).toThrow(/no frontloading/);
  });
});
