import type { ISODate } from '../solver/types';
import { addDays, isoToSerial, monthsElapsed, parseISO } from '../solver/dateUtils';

/**
 * The shared policy model (Feature 1, Stage 2A) — pure TS, no React/DOM. /policy and /pto
 * both describe a user's time-off policy in terms of this model; /pto's own flat-annual
 * fields (urlState.ts's ac/am/ex/xd/cc) are one projection of it (see toLegacySolverFields
 * below and docs/specs/feature1-time-off-policy.md section 2).
 */

export type PolicyUnit = 'days' | 'hours';

export type AccrualMethod =
  | { kind: 'front-loaded'; amount: number; grantDate: ISODate }
  | { kind: 'per-pay-period'; amount: number; frequency: 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly'; payDateAnchor: ISODate }
  | { kind: 'per-hour-worked'; rate: number; typicalWeeklyHours: number }
  | { kind: 'unlimited'; expectedDaysPerYear: number };

export type PlanYear =
  | { kind: 'calendar' }
  | { kind: 'anniversary'; startDate: ISODate }
  | { kind: 'custom'; resetDate: ISODate };

export interface CarryoverRule {
  mode: 'none' | 'all' | 'capped';
  /** Only meaningful when mode === 'capped'. */
  cap?: number;
  /** Optional deadline for the carried-over portion, distinct from the reset date itself
   * (e.g. "use carried days by Mar 31" when the plan year resets Jan 1). */
  useByDate?: ISODate;
}

export interface TimeOffPolicy {
  unit: PolicyUnit;
  /** Only meaningful when unit === 'hours'; used to translate to/from whole days for display. */
  hoursPerDay: number;
  accrual: AccrualMethod;
  planYear: PlanYear;
  /** Max balance; accrual that would exceed it is lost until the balance drops again. */
  accrualCap?: number;
  carryover: CarryoverRule;
  /** Days of employment before accrued time can be used. Measured from the anniversary
   * plan year's startDate when one exists, otherwise from balanceAsOf (see projection.ts). */
  waitingPeriodDays?: number;
  /** 0 = balance can never go negative. >0 = may be borrowed down to -N. */
  negativeBalanceAllowance: number;
  /** Display-only per P4 — never a legal claim about what an employer must do. */
  payoutOnLeaving: 'pays' | 'doesnt' | 'not-sure';
  currentBalance: number;
  balanceAsOf: ISODate;
  /** Reuses DateListEditor on the /policy page. */
  plannedDays: ISODate[];
}

/** One calendar-year occurrence of the plan year's reset date, for the year containing `near`. */
function resetDateInYearOf(planYear: PlanYear, near: ISODate): ISODate {
  const { y } = parseISO(near);
  if (planYear.kind === 'calendar') return `${y}-01-01`;
  if (planYear.kind === 'custom') {
    const { m, d } = parseISO(planYear.resetDate);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const { m, d } = parseISO(planYear.startDate);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Every reset date in (from, through], in order. A policy resets once a year on the same
 * month/day as its anchor (calendar: Jan 1; anniversary: the start date's month/day; custom:
 * the chosen reset date's month/day). */
export function resetDatesInRange(planYear: PlanYear, from: ISODate, through: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const { y: fromYear } = parseISO(from);
  const { y: throughYear } = parseISO(through);
  for (let y = fromYear; y <= throughYear + 1; y++) {
    const candidate = resetDateInYearOf(planYear, `${y}-06-15`);
    if (candidate > from && candidate <= through) out.push(candidate);
  }
  return out.sort();
}

/** The waiting-period end date, per the convention documented on `waitingPeriodDays`. */
export function waitingPeriodEnd(policy: TimeOffPolicy): ISODate | undefined {
  if (!policy.waitingPeriodDays) return undefined;
  const from = policy.planYear.kind === 'anniversary' ? policy.planYear.startDate : policy.balanceAsOf;
  return addDays(from, policy.waitingPeriodDays);
}

/** Pay dates for a per-pay-period accrual method, in (from, through]. Semi-monthly pays on
 * the 1st and 16th of each month regardless of anchor day (a common real-world convention);
 * the other frequencies step forward from payDateAnchor in fixed-day increments. */
export function payDatesInRange(
  accrual: Extract<AccrualMethod, { kind: 'per-pay-period' }>,
  from: ISODate,
  through: ISODate,
): ISODate[] {
  const out: ISODate[] = [];
  if (accrual.frequency === 'semi-monthly') {
    const { y: fy } = parseISO(from);
    const { y: ty } = parseISO(through);
    for (let y = fy; y <= ty; y++) {
      for (let m = 1; m <= 12; m++) {
        for (const day of [1, 16]) {
          const d = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          if (d > from && d <= through) out.push(d);
        }
      }
    }
    return out.sort();
  }
  const stepDays = accrual.frequency === 'weekly' ? 7 : accrual.frequency === 'biweekly' ? 14 : 0;
  if (stepDays > 0) {
    let d = accrual.payDateAnchor;
    // Fast-forward to the first anchor-aligned date after `from`.
    if (d <= from) {
      const periodsToSkip = Math.floor((isoToSerial(from) - isoToSerial(d)) / stepDays) + 1;
      d = addDays(d, periodsToSkip * stepDays);
    }
    while (d <= through) {
      if (d > from) out.push(d);
      d = addDays(d, stepDays);
    }
    return out;
  }
  // monthly: same day-of-month as the anchor, each month.
  const { d: anchorDay } = parseISO(accrual.payDateAnchor);
  const months = monthsElapsed(accrual.payDateAnchor, through) + 1;
  let cursor = accrual.payDateAnchor;
  for (let i = 0; i <= months; i++) {
    const { y, m } = parseISO(cursor);
    const candidate = `${y}-${String(m).padStart(2, '0')}-${String(anchorDay).padStart(2, '0')}`;
    if (candidate > from && candidate <= through) out.push(candidate);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    cursor = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  }
  return out.sort();
}

/**
 * Today's /pto equivalent of a policy, for interop (Stage 2A). Returns undefined fields for
 * anything /pto's flat-annual model has no way to represent (anniversary plan years, hours,
 * waiting periods, negative balances) — callers fall back to /pto's own defaults for those,
 * which is exactly what keeps pre-existing /pto links unaffected by this feature.
 */
export function toLegacySolverFields(
  policy: TimeOffPolicy,
  // Accepted for signature stability with future plan-year-aware conversions (e.g.
  // anniversary years, where the equivalent accrual window depends on where rangeStart
  // falls) — not yet needed by any case handled today.
  _rangeStart: ISODate,
): { budget: number; accrualPerMonth?: number; expiryDate?: ISODate; carryoverCap?: number } {
  // /pto's `budget` is a CAP the balance accrues toward, independent of the accrual rate
  // (a user can set accrualPerMonth=1.25 with budget=20 even though 1.25*12=15 — the extra
  // headroom is real: a starting balance, a mid-year bump, etc.). So when the policy states
  // an explicit accrualCap, that IS /pto's budget; only fall back to deriving a figure from
  // the accrual method itself (amount * periods/year) when no cap was given at all — found
  // this distinction while actually wiring /pto onto this function (see useAppState.ts);
  // the earlier version of this function always derived budget from the accrual amount,
  // which silently discarded the cap whenever the two weren't equal.
  const derivedBudget =
    policy.accrual.kind === 'front-loaded'
      ? policy.accrual.amount
      : policy.accrual.kind === 'per-pay-period'
        ? policy.accrual.amount * periodsPerYear(policy.accrual.frequency)
        : policy.accrual.kind === 'per-hour-worked'
          ? (policy.accrual.rate * policy.accrual.typicalWeeklyHours * 52) / policy.hoursPerDay
          : policy.accrual.expectedDaysPerYear;
  const budget = policy.accrualCap ?? derivedBudget;

  const accrualPerMonth =
    policy.accrual.kind === 'per-pay-period'
      ? (policy.accrual.amount * periodsPerYear(policy.accrual.frequency)) / 12
      : policy.accrual.kind === 'per-hour-worked'
        ? (policy.accrual.rate * policy.accrual.typicalWeeklyHours * 52) / 12 / policy.hoursPerDay
        : undefined;

  const expiryDate = policy.planYear.kind === 'custom' ? policy.planYear.resetDate : undefined;
  const carryoverCap = policy.carryover.mode === 'capped' ? policy.carryover.cap : policy.carryover.mode === 'all' ? undefined : 0;

  return { budget, accrualPerMonth, expiryDate, carryoverCap };
}

/**
 * The reverse direction (Stage 2A follow-through, PR-B): builds the TimeOffPolicy shape
 * that today's flat /pto accrual fields (urlState.ts's ac/am/ex/xd/cc, read into
 * useAppState.ts's accrualEnabled/accrualPerMonth/expiryEnabled/expiryDate/carryoverCap)
 * already describe, so useAppState.ts can route its solver-input construction through this
 * shared model instead of its own parallel ternary logic. `budget` becomes the policy's
 * `accrualCap` (not the accrual amount — see the comment on `derivedBudget` above), so
 * `toLegacySolverFields(policyFromLegacyPtoState(...), rangeStart).budget` always equals
 * the `budget` passed in here, for every combination of these fields. Verified by
 * `src/ui/pto-policy-regression.test.ts`.
 */
export function policyFromLegacyPtoState(fields: {
  budget: number;
  accrualEnabled: boolean;
  accrualPerMonth: number;
  expiryEnabled: boolean;
  expiryDate?: ISODate;
  carryoverCap: number;
  rangeStart: ISODate;
}): TimeOffPolicy {
  return {
    unit: 'days',
    hoursPerDay: 8,
    accrual: fields.accrualEnabled
      ? { kind: 'per-pay-period', amount: fields.accrualPerMonth, frequency: 'monthly', payDateAnchor: fields.rangeStart }
      : { kind: 'front-loaded', amount: fields.budget, grantDate: fields.rangeStart },
    accrualCap: fields.budget,
    planYear: fields.expiryEnabled && fields.expiryDate ? { kind: 'custom', resetDate: fields.expiryDate } : { kind: 'calendar' },
    carryover: fields.expiryEnabled ? { mode: 'capped', cap: fields.carryoverCap } : { mode: 'none' },
    negativeBalanceAllowance: 0,
    payoutOnLeaving: 'not-sure',
    currentBalance: fields.budget,
    balanceAsOf: fields.rangeStart,
    plannedDays: [],
  };
}

function periodsPerYear(frequency: 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly'): number {
  switch (frequency) {
    case 'weekly': return 52;
    case 'biweekly': return 26;
    case 'semi-monthly': return 24;
    case 'monthly': return 12;
  }
}
