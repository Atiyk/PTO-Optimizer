import { addDays } from '../solver/dateUtils';
import type { ISODate } from '../solver/types';
import { fromUnits, toUnits } from '../ledger/fixedPoint';
import type { LeavePolicy, PlanYear } from '../leave/policy';
import type { LedgerEntryInput } from '../leave/projection';
import type { RuleOf } from './types';

/*
 * Hourly sick leave (C4) on the EXISTING policy model: a pack's `sick_accrual` rule becomes
 * an ordinary `LeavePolicy` that `projectBalance` interprets (per_hour_worked with imported
 * hours, or front_loaded). Nothing here keeps its own balance.
 */

export interface SickPolicyOptions {
  /** Use the pack's frontloading option instead of accrual. */
  frontload?: boolean;
  planYear?: PlanYear;
}

export function sickPolicyFromRule(rule: RuleOf<'sick_accrual'>, opts: SickPolicyOptions = {}): LeavePolicy {
  const planYear = opts.planYear ?? { type: 'calendar' };
  const waitingPeriod = rule.usableFromDay && rule.usableFromDay > 1 ? { days: rule.usableFromDay - 1, mode: 'locked' as const } : null;
  if (opts.frontload) {
    if (rule.frontloadHours == null) throw new Error(`${rule.id} has no frontloading option`);
    return {
      unit: 'hours',
      accrual: { method: 'front_loaded', annualAllowance: rule.frontloadHours, proRateFirstYear: false },
      planYear,
      carryover: { type: 'none' },
      waitingPeriod,
      annualUseCap: rule.annualUseCap ?? null,
    };
  }
  if (!rule.hoursPerUnit) throw new Error(`${rule.id} has no accrual rate`);
  const co = rule.carryoverMax;
  return {
    unit: 'hours',
    accrual: {
      method: 'per_hour_worked',
      ratePerHour: 1 / rule.hoursPerUnit,
      hoursPerUnit: rule.hoursPerUnit,
      payPeriod: 'weekly',
      hoursSource: 'imported',
      annualAccrualCap: rule.annualAccrualCap ?? null,
    },
    planYear,
    accrualCap: rule.balanceCap ?? null,
    // Unknown carryover (needs verification) keeps everything: the employee-favourable reading.
    carryover: co == null || co === 'all' ? { type: 'all' } : { type: 'upTo', max: co },
    waitingPeriod,
    annualUseCap: rule.annualUseCap ?? null,
  };
}

export interface UseCapCheck {
  cap: number | null;
  usedThisYear: number;
  remaining: number | null;
  /** Whether `requested` more hours fit under the cap. */
  fits: boolean;
}

/** Annual use cap: usage rows in [yearStart, yearEnd] against the policy's cap. */
export function annualUseCheck(
  policy: Pick<LeavePolicy, 'annualUseCap'>,
  ledger: readonly LedgerEntryInput[],
  year: { start: ISODate; end: ISODate },
  requested: number,
): UseCapCheck {
  const used = ledger
    .filter((e) => e.kind === 'usage' && e.effectiveDate >= year.start && e.effectiveDate <= year.end)
    .reduce((u, e) => u - toUnits(e.amount), 0);
  const cap = policy.annualUseCap ?? null;
  if (cap == null) return { cap: null, usedThisYear: fromUnits(used), remaining: null, fits: true };
  const remaining = toUnits(cap) - used;
  return { cap, usedThisYear: fromUnits(used), remaining: fromUnits(remaining), fits: toUnits(requested) <= remaining };
}

/** Weekly imported-hours rows (Monday–Sunday) helper, for tests and demo seeds. */
export function weeklyHours(firstMonday: ISODate, weeks: number, hours: number): { periodStart: ISODate; periodEnd: ISODate; hours: number }[] {
  return Array.from({ length: weeks }, (_, i) => ({ periodStart: addDays(firstMonday, 7 * i), periodEnd: addDays(firstMonday, 7 * i + 6), hours }));
}
