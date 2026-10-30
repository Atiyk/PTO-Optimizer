import type { ISODate } from '../solver/types';

/**
 * The leave policy model (docs/teams/SPEC.md §3). Pure data: the engine interprets it,
 * nothing else does. Amounts are in `unit` (days or hours).
 */
export type AccrualMethod = 'front_loaded' | 'per_pay_period' | 'per_hour_worked' | 'unlimited';
export type PayPeriod = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
export type LeaveUnit = 'days' | 'hours';

export type PlanYear =
  | { type: 'calendar' }
  | { type: 'anniversary' }
  /** Plan year starts every year on this month/day. */
  | { type: 'custom'; month: number; day: number };

export type Carryover =
  | { type: 'none' }
  | { type: 'all'; useBy?: MonthDay }
  | { type: 'upTo'; max: number; useBy?: MonthDay };

/** A month/day inside the new plan year by which carried-over leave must be used. */
export interface MonthDay {
  month: number;
  day: number;
}

export interface LeavePolicy {
  unit: LeaveUnit;
  accrual:
    | { method: 'front_loaded'; annualAllowance: number; proRateFirstYear?: boolean }
    | { method: 'per_pay_period'; annualAllowance: number; payPeriod: PayPeriod }
    | { method: 'per_hour_worked'; ratePerHour: number; payPeriod: PayPeriod }
    | { method: 'unlimited' };
  planYear: PlanYear;
  /** Maximum balance. Accrual pauses at the cap and resumes once usage brings it below. */
  accrualCap?: number | null;
  carryover: Carryover;
  /** Days after the start date before leave accrues (`no_accrual`) or can be used (`locked`). */
  waitingPeriod?: { days: number; mode: 'no_accrual' | 'locked' } | null;
  /** How far below zero a request may take the balance. 0 = not at all. */
  negativeAllowance?: number;
}

/** A policy and the date it applies from. Later versions apply going forward only. */
export interface PolicyVersion {
  id?: string;
  effectiveFrom: ISODate;
  policy: LeavePolicy;
}

export const PERIODS_PER_YEAR: Record<PayPeriod, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

/** Validates shape and ranges; returns human-readable problems (empty = valid). */
export function validatePolicy(p: LeavePolicy): string[] {
  const errs: string[] = [];
  const nonNeg = (v: unknown, name: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errs.push(`${name} must be a number ≥ 0`);
  };
  if (p.unit !== 'days' && p.unit !== 'hours') errs.push('unit must be "days" or "hours"');
  const a = p.accrual;
  switch (a.method) {
    case 'front_loaded':
      nonNeg(a.annualAllowance, 'accrual.annualAllowance');
      break;
    case 'per_pay_period':
      nonNeg(a.annualAllowance, 'accrual.annualAllowance');
      if (!(a.payPeriod in PERIODS_PER_YEAR)) errs.push('accrual.payPeriod is not a known pay period');
      break;
    case 'per_hour_worked':
      nonNeg(a.ratePerHour, 'accrual.ratePerHour');
      if (!(a.payPeriod in PERIODS_PER_YEAR)) errs.push('accrual.payPeriod is not a known pay period');
      break;
    case 'unlimited':
      break;
    default:
      errs.push('accrual.method is not a known method');
  }
  if (p.planYear.type === 'custom' && !isValidMonthDay(p.planYear)) errs.push('planYear month/day is not a valid date');
  if (p.accrualCap != null) nonNeg(p.accrualCap, 'accrualCap');
  if (p.carryover.type === 'upTo') nonNeg(p.carryover.max, 'carryover.max');
  if (p.carryover.type !== 'none' && p.carryover.useBy && !isValidMonthDay(p.carryover.useBy)) {
    errs.push('carryover.useBy month/day is not a valid date');
  }
  if (p.waitingPeriod) nonNeg(p.waitingPeriod.days, 'waitingPeriod.days');
  if (p.negativeAllowance != null) nonNeg(p.negativeAllowance, 'negativeAllowance');
  return errs;
}

function isValidMonthDay({ month, day }: MonthDay): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) return false;
  // Feb 29 is allowed (it clamps to Feb 28 in non-leap years).
  return day <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}
