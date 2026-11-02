import { solve } from '@daysoff/engine/solver/solve';
import { mondayIndexedDow, monthsElapsed, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { SolveInput, SolveResult } from '@daysoff/engine/solver/types';

export type PlanningStyle = 'balanced' | 'long-breaks' | 'more-breaks' | 'custom';

/** Presets remain visible/editable through the existing manual controls. */
export function planningStyleSettings(style: PlanningStyle): { w: number; breakCount: number } | undefined {
  if (style === 'balanced') return { w: 30, breakCount: 3 };
  if (style === 'long-breaks') return { w: 20, breakCount: 1 };
  if (style === 'more-breaks') return { w: 30, breakCount: 7 };
  return undefined;
}

export interface PtoDateValidation {
  valid: boolean;
  issue?: string;
  /** Unique, chronological working days that actually consume PTO. */
  ptoDays: string[];
  /** Working dates that cannot be funded after the preceding selected leave. A
   * consumer solve may make them unavailable and search again; they are not saved. */
  unavailableDates?: string[];
}

function validDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [year, month, day] = iso.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function earnedBy(input: SolveInput, date: string): number {
  return input.accrualPerMonth !== undefined
    ? Math.min(input.budget, monthsElapsed(input.rangeStart, date) * input.accrualPerMonth)
    : input.budget;
}

/** The legacy expiry solver treats carryover as an additional allocation. Consumer
 * balance inputs instead include those same days already. Reserve a bounded portion
 * for its post-expiry window so the two solver windows share one real allocation.
 * Validation below still checks the original balance and each actual spending date. */
function solverInputForConsumer(input: SolveInput): SolveInput {
  if (!input.expiryDate) return input;
  const totalEarned = earnedBy(input, input.rangeEnd);
  const earnedAtExpiry = earnedBy(input, input.expiryDate);
  // No day in this plan crosses the boundary, or the complete balance can carry:
  // there is no forfeiture constraint for the optimizer to split into two windows.
  if (input.expiryDate >= input.rangeEnd || (input.carryoverCap ?? 0) >= earnedAtExpiry) {
    return { ...input, expiryDate: undefined, carryoverCap: undefined };
  }
  const carryover = Math.min(input.carryoverCap ?? 0, earnedAtExpiry, totalEarned);
  return { ...input, budget: Math.max(0, totalEarned - carryover), carryoverCap: carryover };
}

/** Consumer budget checks are intentionally stricter than the legacy shared solver:
 * pinned days cannot overspend, carryover is unspent PTO (not a second allocation),
 * and accrual must exist on the day it is used, rather than a break's final day.
 * A caller supplies the actual dates being taken off, including any free days. */
export function validatePtoDates(input: SolveInput, dates: string[]): PtoDateValidation {
  const fail = (issue: string, ptoDays: string[] = []): PtoDateValidation => ({ valid: false, issue, ptoDays });
  if (!validDate(input.rangeStart) || !validDate(input.rangeEnd) || input.rangeEnd < input.rangeStart) {
    return fail('Choose a valid planning start and end date.');
  }
  if (!Number.isFinite(input.budget) || input.budget < 0) return fail('Enter a valid available PTO balance.');
  if (input.accrualPerMonth !== undefined && (!Number.isFinite(input.accrualPerMonth) || input.accrualPerMonth < 0)) {
    return fail('Enter a valid monthly accrual amount.');
  }
  if (input.expiryDate && !validDate(input.expiryDate)) return fail('Choose a valid expiration date.');
  if (input.carryoverCap !== undefined && (!Number.isFinite(input.carryoverCap) || input.carryoverCap < 0)) {
    return fail('Enter a valid carryover limit.');
  }

  const workWeek = input.workWeek ?? DEFAULT_WORK_WEEK;
  const off = new Set(input.offDays);
  const blackouts = new Set(input.blackouts ?? []);
  const allDates = [...new Set(dates)].sort();
  if (allDates.some((date) => !validDate(date) || date < input.rangeStart || date > input.rangeEnd)) {
    return fail('Every planned date must be inside the selected planning range.');
  }
  if (allDates.some((date) => blackouts.has(date))) return fail('A planned break conflicts with an unavailable day.');

  const costsPto = (date: string) => workWeek[mondayIndexedDow(date)] && !off.has(date);
  const ptoDays = allDates.filter(costsPto);
  const allDatesSet = new Set(allDates);
  const required = [...new Set(input.mustIncludeDays ?? [])].filter((date) => date >= input.rangeStart && date <= input.rangeEnd);
  if (required.some((date) => !validDate(date) || blackouts.has(date))) {
    return fail('A required date conflicts with an unavailable day.', ptoDays);
  }
  if (required.some((date) => costsPto(date) && !allDatesSet.has(date))) {
    return fail('The current constraints cannot include every required PTO date.', ptoDays);
  }
  if (ptoDays.length > input.budget) return fail('Required dates or the selected plan exceed your available PTO.', ptoDays);

  const cap = input.peakCap;
  if (cap?.enabled && ptoDays.filter((date) => date >= cap.startDate && date <= cap.endDate).length > cap.maxDays) {
    return fail('The selected dates exceed your PTO limit for the busy-season window.', ptoDays);
  }

  const accrualEnabled = input.accrualPerMonth !== undefined;
  let earned = accrualEnabled ? 0 : input.budget;
  let available = earned;
  let expired = false;
  for (const date of ptoDays) {
    // Reset is after the policy's last usable day. Accrual earned after that date
    // remains separate from the limited amount actually left to carry forward.
    if (input.expiryDate && !expired && date > input.expiryDate) {
      const atExpiry = earnedBy(input, input.expiryDate);
      available += Math.max(0, atExpiry - earned);
      earned = atExpiry;
      available = Math.min(available, input.carryoverCap ?? 0);
      expired = true;
    }
    const earnedNow = earnedBy(input, date);
    available += Math.max(0, earnedNow - earned);
    earned = earnedNow;
    if (available < 1 - 1e-9) {
      const futureDays = rangeISO(date, input.rangeEnd);
      const nextFundedDate = futureDays.find((future) => available + earnedBy(input, future) - earnedNow >= 1 - 1e-9);
      return { ...fail(expired
        ? `There is not enough carried or accrued PTO available on ${date}.`
        : `There is not enough accrued PTO available on ${date}.`, ptoDays),
        unavailableDates: futureDays.filter((future) => (!nextFundedDate || future < nextFundedDate) && costsPto(future)),
      };
    }
    available -= 1;
  }
  return { valid: true, ptoDays };
}

export interface ConsumerSolveOptions {
  minimumBreakDays?: number;
  style?: PlanningStyle;
}

function emptyResult(input: SolveInput): SolveResult {
  return {
    primary: [], alternatives: [], budgetSpent: 0, breakCountActual: 0,
    breakCountRequested: input.breakCount ?? 0, peakCapApplied: false,
  };
}

/** New consumer plans use the existing deterministic optimizer, then verify every
 * spending date. Invalid/infeasible constraints produce an explicit empty plan; they
 * never silently relax a minimum, remove a pinned date, or charge future accrual early.
 * Legacy URLs use solveLegacyConsumer() to retain every already-valid result. */
export function solveConsumer(input: SolveInput, options: ConsumerSolveOptions = {}): { result: SolveResult; issue?: string } {
  const minimum = options.minimumBreakDays ?? input.minimumBreakDays ?? 0;
  if (!Number.isInteger(minimum) || minimum < 0 || minimum > 60) {
    return { result: emptyResult(input), issue: 'Choose a minimum break length from 1 to 60 days, or no minimum.' };
  }
  const preset = options.style ? planningStyleSettings(options.style) : undefined;
  const plannedInput: SolveInput = { ...input, ...preset, minimumBreakDays: minimum };
  // Validate required dates before solving so a known impossible pinned budget never
  // enters the legacy solver's deliberately permissive synthetic-date path.
  const required = (input.mustIncludeDays ?? []).filter((date) => date >= input.rangeStart && date <= input.rangeEnd);
  const requiredCheck = validatePtoDates(plannedInput, required);
  if (!requiredCheck.valid) return { result: emptyResult(plannedInput), issue: requiredCheck.issue };
  const engineInput = solverInputForConsumer(plannedInput);
  let result = solve(engineInput);
  let check = validatePtoDates(plannedInput, result.primary.flatMap((brk) => brk.days));
  // The legacy solver checks accrual at a break's end. When that places an early
  // workday before it is funded, rule out that interval and let the same optimizer
  // find another placement. A bounded retry keeps live edits responsive, and the
  // final check below never presents an unsafe result if no placement is found.
  const retryBlackouts = new Set(engineInput.blackouts ?? []);
  const requiredSet = new Set(required);
  for (let retry = 0; !check.valid && check.unavailableDates && retry < 12; retry++) {
    const unavailable = check.unavailableDates.filter((date) => !requiredSet.has(date) && !retryBlackouts.has(date));
    if (unavailable.length === 0) break;
    for (const date of unavailable) retryBlackouts.add(date);
    result = solve({ ...engineInput, blackouts: [...retryBlackouts] });
    check = validatePtoDates(plannedInput, result.primary.flatMap((brk) => brk.days));
  }
  if (!check.valid) return { result: emptyResult(plannedInput), issue: check.issue };
  if (minimum > 1 && result.primary.some((brk) => brk.totalDaysOff < minimum)) {
    return {
      result: emptyResult(plannedInput),
      issue: `Your required dates cannot fit a ${minimum}-day minimum break within the current constraints. Reduce the minimum or adjust those dates.`,
    };
  }
  if (result.primary.length === 0 && minimum > 1 && input.budget >= 1) {
    return {
      result,
      issue: `No break of at least ${minimum} consecutive days fits your available PTO and dates. Try a shorter minimum or a wider date range.`,
    };
  }
  // Alternatives are individual substitutions, so validate the WHOLE replacement plan.
  // This preserves accrual, required dates, and policy caps across the other breaks.
  const alternatives = result.alternatives.filter((alternative) => {
    if (minimum > 1 && alternative.totalDaysOff < minimum) return false;
    const remaining = result.primary.filter((brk) => brk.start !== alternative.replaces.start || brk.end !== alternative.replaces.end);
    return validatePtoDates(plannedInput, [...remaining, alternative].flatMap((brk) => brk.days)).valid;
  });
  return { result: { ...result, alternatives } };
}

/** Compatibility preserves fully valid legacy plans exactly, including ordering
 * and manual controls. Unsafe alternatives are removed without changing a funded
 * primary; unsafe primary plans are repaired without new minimums or presets. */
export function solveLegacyConsumer(input: SolveInput): { result: SolveResult; issue?: string } {
  const result = solve(input);
  const check = validatePtoDates(input, result.primary.flatMap((brk) => brk.days));
  if (check.valid) {
    const alternatives = result.alternatives.filter((alternative) => {
      const remaining = result.primary.filter((brk) => brk.start !== alternative.replaces.start || brk.end !== alternative.replaces.end);
      return validatePtoDates(input, [...remaining, alternative].flatMap((brk) => brk.days)).valid;
    });
    return { result: alternatives.length === result.alternatives.length ? result : { ...result, alternatives } };
  }

  const corrected = solveConsumer(input, { minimumBreakDays: 0, style: 'custom' });
  // A retry may legitimately find no funded dates. Explain why the old plan could
  // not be retained even when the unconstrained solver's empty result is valid.
  return corrected.result.primary.length === 0
    ? { ...corrected, issue: corrected.issue ?? check.issue }
    : corrected;
}
