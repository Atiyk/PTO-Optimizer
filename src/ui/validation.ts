import { isValidISODate } from './urlState';
import { isValidWorkWeek, type WorkWeek } from '@daysoff/engine/solver/types';
/** More PTO days than exist in a decade - the solver itself handles any budget without a
 * fixed cap (see NOTES.md Phase 11/12), so this isn't a technical limit, just the line past
 * which a typed value is clearly not a real annual PTO balance (a stray extra digit, a
 * paste gone wrong) and deserves a message instead of silently "working". */
const MAX_REASONABLE_BUDGET = 3650;

/** Bound untrusted links before building a calendar or a solver candidate table. */
export function isSupportedPlanningRange(start: string, end: string): boolean {
  if (!isValidISODate(start) || !isValidISODate(end) || end < start) return false;
  const years = Number(end.slice(0, 4)) - Number(start.slice(0, 4));
  return years < 10 || (years === 10 && end.slice(5) <= start.slice(5));
}

export interface ValidationInputs {
  rangeStart: string;
  rangeEnd: string;
  budget: number;
  expiryEnabled: boolean;
  expiryDate: string;
  workWeek?: WorkWeek;
}

/**
 * Pure validation, same pattern as dayCategory.ts/alternativeForDate.ts: extracted so the
 * exact rules are directly unit-testable. Returns every issue found, not just the first -
 * several can be true at once (e.g. a negative budget AND an inverted date range from the
 * same bad paste), and the UI shows all of them rather than hiding all-but-one.
 */
export function validateInputs({ rangeStart, rangeEnd, budget, expiryEnabled, expiryDate, workWeek }: ValidationInputs): string[] {
  const issues: string[] = [];

  if (!isValidISODate(rangeStart) || !isValidISODate(rangeEnd)) issues.push('Choose valid planning start and end dates.');
  if (isValidISODate(rangeStart) && isValidISODate(rangeEnd) && rangeEnd >= rangeStart && !isSupportedPlanningRange(rangeStart, rangeEnd)) issues.push('Choose a planning window of ten years or less.');
  if (!Number.isFinite(budget)) issues.push('Enter a valid PTO balance.');
  if (workWeek !== undefined && !isValidWorkWeek(workWeek)) issues.push('Choose at least one working day each week.');
  if (rangeEnd < rangeStart) {
    issues.push('End date is before the start date.');
  }
  if (budget < 0) {
    issues.push("PTO days available can't be negative.");
  } else if (budget > MAX_REASONABLE_BUDGET) {
    issues.push(`${budget} PTO days is far beyond a realistic annual allotment.`);
  }
  if (expiryEnabled && rangeEnd >= rangeStart && (expiryDate < rangeStart || expiryDate > rangeEnd)) {
    issues.push('Expiry date is outside the selected date range.');
  }

  return issues;
}
