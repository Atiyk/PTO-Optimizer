/**
 * Structured, non-blocking notes about planner inputs. The solver entry points never
 * silently replace an invalid value: when a value is adjusted, the adjustment and its
 * reason are returned here so the UI can say so.
 */
import { COUNTRIES } from '@daysoff/engine/data/countries';
import { isoToSerial } from '@daysoff/engine/solver/dateUtils';

export type InputIssueField = 'budget' | 'country' | 'range';

export interface InputIssue {
  field: InputIssueField;
  message: string;
}

/** A balance can't exceed the days in a year; above this a typed value is a typo. */
export const MAX_PLANNABLE_BUDGET = 365;

/** Parse a `b` value. Missing/unreadable values use the fallback without a note (that is
 * the normal "no balance in the link" case); negative values become 0 and values above
 * MAX_PLANNABLE_BUDGET are clamped, each with a note. */
export function parseBudgetParam(raw: string | null, fallback: number): { budget: number; issue?: InputIssue } {
  if (raw === null || raw.trim() === '') return { budget: fallback };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return { budget: fallback };
  if (parsed < 0) {
    return { budget: 0, issue: { field: 'budget', message: "PTO can't be negative — showing 0 until you change it." } };
  }
  if (parsed > MAX_PLANNABLE_BUDGET) {
    return {
      budget: MAX_PLANNABLE_BUDGET,
      issue: { field: 'budget', message: `${parsed} PTO days is more than a year has, so the plan uses ${MAX_PLANNABLE_BUDGET}. Change the balance if that's not right.` },
    };
  }
  return { budget: parsed };
}

export function isKnownCountry(code: string | undefined): boolean {
  return !!code && COUNTRIES.some((entry) => entry.code === code);
}

/** Live notes for the current inputs (country, range, balance vs. working days). */
export function planInputIssues(state: { country: string; rangeStart: string; rangeEnd: string; budget: number; workingDaysInRange?: number }): InputIssue[] {
  const issues: InputIssue[] = [];
  if (!isKnownCountry(state.country)) {
    const code = /^[A-Za-z]{2}$/.test(state.country) ? state.country.toUpperCase() : 'this country';
    issues.push({ field: 'country', message: `No holiday data for ${code} — plan uses weekends only.` });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(state.rangeStart) && /^\d{4}-\d{2}-\d{2}$/.test(state.rangeEnd)
    && isoToSerial(state.rangeEnd) - isoToSerial(state.rangeStart) + 1 > 366) {
    issues.push({ field: 'range', message: 'Your dates cover more than a year. Your PTO balance is treated as one pool across the whole range, not a new allowance each year.' });
  }
  if (state.workingDaysInRange !== undefined && Number.isFinite(state.budget) && state.budget > state.workingDaysInRange) {
    issues.push({
      field: 'budget',
      message: `Your dates have only ${state.workingDaysInRange} working ${state.workingDaysInRange === 1 ? 'day' : 'days'}, so at most ${state.workingDaysInRange} of your ${state.budget} PTO days can be planned.`,
    });
  }
  return issues;
}
