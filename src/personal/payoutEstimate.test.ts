import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest } from './requestLedger';
import { estimateDeparturePayout, type DeparturePayoutInput } from './payoutEstimate';

const base: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8,
  accrual: { kind: 'per-pay-period', amount: 1.25, frequency: 'monthly', payDateAnchor: '2027-01-15' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'all' },
  negativeBalanceAllowance: 0, payoutOnLeaving: 'not-sure',
  currentBalance: 5, balanceAsOf: '2027-01-01', plannedDays: [],
};
const input: DeparturePayoutInput = {
  departureDate: '2027-01-14', workJurisdiction: 'US-NY', currency: 'USD',
  pay: { kind: 'hourly', hourlyRate: 30 },
  lines: [{ category: 'vacation', policy: base, companyRule: { kind: 'pays-all' } }],
};
const withInput = (patch: Partial<DeparturePayoutInput>) => estimateDeparturePayout({ ...input, ...patch });
const line = (result: ReturnType<typeof estimateDeparturePayout>) => result!.lines[0];
const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [] };
function approved(id: string, start: string, end = start) {
  return createPtoRequest({ start, end, status: 'approved' }, calendar, id)!;
}

describe('consumer departure payout: company-policy assumptions only', () => {
  it('calculates a gross hourly payout without claiming a legal entitlement', () => {
    const result = withInput({})!;
    expect(line(result)).toMatchObject({
      category: 'vacation', projectedBalance: 5, unusedUnits: 5, unusedHours: 40,
      payableUnits: 5, payableHours: 40, companyGrossCents: 120000, status: 'estimated',
    });
    expect(result.totalCompanyGrossCents).toBe(120000);
    expect(result.legal).toEqual({ status: 'not-verified', mandatoryGrossCents: null, comparisonCents: null });
    expect(line(result).legal.mandatoryGrossCents).toBeNull();
  });

  it('reuses exact pay-date accrual rather than inventing daily pro-rating', () => {
    expect(line(withInput({ departureDate: '2027-01-14' })).projectedBalance).toBe(5);
    const after = line(withInput({ departureDate: '2027-01-15' }));
    expect(after.projectedBalance).toBe(6.25);
    expect(after.forecast.accrued).toBe(1.25);
    expect(after.companyGrossCents).toBe(150000);
  });

  it('uses an explicit annual-hours divisor, not a hidden 2080-hour assumption', () => {
    const result = withInput({
      pay: { kind: 'annual', annualSalary: 100000, annualWorkHours: 2000 },
      lines: [{ category: 'vacation', policy: { ...base, currentBalance: 6 }, companyRule: { kind: 'pays-all' } }],
    })!;
    expect(result.hourlyRate).toBe(50);
    expect(result.totalCompanyGrossCents).toBe(240000);
    expect(withInput({ pay: { kind: 'annual', annualSalary: 100000, annualWorkHours: 2080 } })!.hourlyRate).not.toBe(50);
  });

  it('honors pays-all, pays-none, capped, and unknown employer assumptions', () => {
    expect(line(withInput({ lines: [{ category: 'vacation', policy: base, companyRule: { kind: 'pays-none' } }] })).companyGrossCents).toBe(0);
    const capped = line(withInput({ lines: [{ category: 'vacation', policy: base, companyRule: { kind: 'pays-up-to', cap: 2.5 } }] }));
    expect(capped.payableUnits).toBe(2.5);
    expect(capped.companyGrossCents).toBe(60000);
    const unknown = withInput({ lines: [{ category: 'vacation', policy: base, companyRule: { kind: 'unknown' } }] })!;
    expect(line(unknown).status).toBe('company-rule-unknown');
    expect(line(unknown).companyGrossCents).toBeNull();
    expect(unknown.totalCompanyGrossCents).toBeNull();
    expect(unknown.knownCompanyGrossCents).toBe(0);
  });

  it('keeps hours as native policy units and converts to gross cents only once', () => {
    const hoursPolicy = { ...base, unit: 'hours' as const, hoursPerDay: 7.5, currentBalance: 12 };
    const result = withInput({
      pay: { kind: 'hourly', hourlyRate: 22.5 },
      lines: [{ category: 'vacation', policy: hoursPolicy, companyRule: { kind: 'pays-up-to', cap: 5.5 } }],
    })!;
    expect(line(result)).toMatchObject({
      unit: 'hours', unusedUnits: 12, unusedHours: 12, payableUnits: 5.5,
      payableHours: 5.5, companyGrossCents: 12375,
    });
  });

  it('deduplicates approved requests and never recharges dates already in the starting balance', () => {
    const policy = { ...base, balanceAsOf: '2027-01-05', plannedDays: ['2027-01-04', '2027-01-05', '2027-01-07'] };
    const result = withInput({
      departureDate: '2027-01-14',
      lines: [{ category: 'vacation', policy, companyRule: { kind: 'pays-all' },
        requests: [approved('a', '2027-01-04', '2027-01-07'), approved('b', '2027-01-07')] }],
    })!;
    expect(line(result).forecast.scheduled).toBe(2);
    expect(line(result).projectedBalance).toBe(3);
    expect(line(result).companyGrossCents).toBe(72000);
  });

  it('does not count requested, canceled, or rejected leave as confirmed deductions', () => {
    const a = approved('a', '2027-01-06');
    const result = withInput({ lines: [{ category: 'vacation', policy: base, companyRule: { kind: 'pays-all' },
      requests: [{ ...a, status: 'requested' }, { ...a, id: 'b', status: 'canceled' }, { ...a, id: 'c', status: 'rejected' }] }] })!;
    expect(line(result).forecast.scheduled).toBe(0);
    expect(line(result).projectedBalance).toBe(5);
  });

  it('uses existing reset and carryover logic without adding a second accrual engine', () => {
    const policy = { ...base, balanceAsOf: '2026-12-31', currentBalance: 9,
      carryover: { mode: 'capped' as const, cap: 3 } };
    const result = withInput({ departureDate: '2027-01-01',
      lines: [{ category: 'vacation', policy, companyRule: { kind: 'pays-all' } }] })!;
    expect(line(result).forecast.expired).toBe(6);
    expect(line(result).projectedBalance).toBe(3);
    expect(line(result).companyGrossCents).toBe(72000);
  });

  it('does not create a cash balance for unlimited PTO even if the company scenario says pays all', () => {
    const unlimited = { ...base, accrual: { kind: 'unlimited' as const, expectedDaysPerYear: 20 } };
    const result = withInput({ lines: [{ category: 'vacation', policy: unlimited, companyRule: { kind: 'pays-all' } }] })!;
    expect(line(result).status).toBe('unsupported-unlimited');
    expect(line(result).companyGrossCents).toBeNull();
    expect(result.totalCompanyGrossCents).toBeNull();
  });

  it('never treats sick leave as payable by default and keeps category totals separate', () => {
    const result = withInput({ lines: [
      { category: 'vacation', policy: base, companyRule: { kind: 'pays-all' } },
      { category: 'sick', policy: { ...base, currentBalance: 10, payoutOnLeaving: 'pays' },
        companyRule: { kind: 'unknown' } },
    ] })!;
    expect(result.knownCompanyGrossCents).toBe(120000);
    expect(result.totalCompanyGrossCents).toBeNull();
    expect(result.unresolvedCategories).toEqual(['sick']);
    expect(result.lines[1].companyGrossCents).toBeNull();
  });

  it('aggregates separate, explicitly scoped categories only when each is resolved', () => {
    const result = withInput({ lines: [
      { category: 'vacation', policy: base, companyRule: { kind: 'pays-all' } },
      { category: 'personal', policy: { ...base, currentBalance: 2 }, companyRule: { kind: 'pays-up-to', cap: 1 } },
    ] })!;
    expect(result.totalCompanyGrossCents).toBe(144000);
    expect(result.unresolvedCategories).toEqual([]);
  });

  it('does not invent money for a negative balance or leave beyond available balance', () => {
    const policy = { ...base, currentBalance: 1, plannedDays: ['2027-01-06', '2027-01-07'] };
    const result = withInput({ lines: [{ category: 'vacation', policy, companyRule: { kind: 'pays-all' } }] })!;
    expect(line(result).unusedUnits).toBe(0);
    expect(line(result).companyGrossCents).toBe(0);
    expect(line(result).forecast.unfunded).toBe(1);
    expect(result.warnings.some((warning) => warning.includes('exceeds available'))).toBe(true);
  });

  it('rounds monetary results to gross cents at the final multiplication', () => {
    const result = withInput({ pay: { kind: 'hourly', hourlyRate: 0.005 },
      lines: [{ category: 'vacation', policy: { ...base, unit: 'hours', currentBalance: 1 }, companyRule: { kind: 'pays-all' } }] })!;
    expect(line(result).companyGrossCents).toBe(1);
  });

  it('rejects invalid dates, missing salary assumptions, malformed units, and duplicate categories', () => {
    expect(withInput({ departureDate: '2027-02-30' })).toBeNull();
    expect(withInput({ departureDate: '2026-12-31' })).toBeNull();
    expect(withInput({ currency: 'usd' })).toBeNull();
    expect(withInput({ pay: { kind: 'annual', annualSalary: 100000, annualWorkHours: 0 } })).toBeNull();
    expect(withInput({ pay: { kind: 'hourly', hourlyRate: Infinity } })).toBeNull();
    expect(withInput({ lines: [{ category: 'vacation', policy: base, companyRule: { kind: 'pays-up-to', cap: -1 } }] })).toBeNull();
    expect(withInput({ lines: [
      { category: 'vacation', policy: base, companyRule: { kind: 'pays-all' } },
      { category: 'vacation', policy: base, companyRule: { kind: 'pays-all' } },
    ] })).toBeNull();
    expect(withInput({ lines: [] })).toBeNull();
    expect(withInput({ lines: [{ category: 'vacation', policy: { ...base, hoursPerDay: 0 }, companyRule: { kind: 'pays-all' } }] })).toBeNull();
  });

  it('rejects malformed local data without throwing or leaking private ledger fields', () => {
    expect(estimateDeparturePayout({ ...input, pay: null } as unknown as DeparturePayoutInput)).toBeNull();
    expect(estimateDeparturePayout({ ...input, lines: [{ category: 'vacation', policy: {
      ...base, planYear: { kind: 'unexpected' }, plannedDays: [],
    }, companyRule: { kind: 'pays-all' } }] } as unknown as DeparturePayoutInput)).toBeNull();
    expect(estimateDeparturePayout({ ...input, lines: [{ category: 'vacation', policy: base,
      companyRule: { kind: 'pays-all' }, requests: [{ status: 'approved', ptoDates: null }] }] } as unknown as DeparturePayoutInput)).toBeNull();
  });

  it('never applies voluntary/involuntary separation rules without verified jurisdiction evidence', () => {
    const voluntary = withInput({ separation: 'voluntary' })!;
    const involuntary = withInput({ separation: 'involuntary' })!;
    expect(voluntary.totalCompanyGrossCents).toBe(involuntary.totalCompanyGrossCents);
    expect(voluntary.legal).toEqual(involuntary.legal);
    expect(voluntary.warnings.some((warning) => warning.includes('not been verified'))).toBe(true);
  });
});
