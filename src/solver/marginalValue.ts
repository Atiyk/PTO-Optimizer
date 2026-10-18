import { mondayIndexedDow, rangeISO } from './dateUtils';
import { DEFAULT_WORK_WEEK } from './types';
import type { Break, ISODate, SolveInput, WorkWeek } from './types';

export interface MarginalValue {
  /** Extra days off gained by spending one PTO day here, net of what the current plan already counts. */
  deltaDays: number;
  ptoCost: number;
  multiplier: number;
}

function isWorkingDow(iso: ISODate, workWeek: WorkWeek): boolean {
  return workWeek[mondayIndexedDow(iso)];
}

/**
 * For every eligible workday in range, computes the marginal value of spending a single
 * PTO day there: (total qualifying days off with this day added) minus (total qualifying
 * days off in the current plan) - never the raw length of the run the day would sit in,
 * since that double-counts days the plan already gets for free. A day adjacent to an
 * already-suggested day is worth only the days it newly adds.
 *
 * Pure, no React. Call once per solve() and cache the result; this is O(n) over the
 * range and not meant to be recomputed on every mouseover.
 */
export function computeMarginalValues(input: SolveInput, primary: Break[]): Map<ISODate, MarginalValue> {
  const workWeek = input.workWeek ?? DEFAULT_WORK_WEEK;
  const days = rangeISO(input.rangeStart, input.rangeEnd);
  const n = days.length;
  const result = new Map<ISODate, MarginalValue>();
  if (n === 0) return result;

  const offSet = new Set(input.offDays ?? []);
  const blackoutSet = new Set(input.blackouts ?? []);

  // Baseline off: weekend or holiday; blackout always forces work, same as the solver.
  const baseOff: boolean[] = days.map((d) => {
    if (blackoutSet.has(d)) return false;
    if (!isWorkingDow(d, workWeek)) return true;
    if (offSet.has(d)) return true;
    return false;
  });

  const chosenSet = new Set<string>();
  for (const b of primary) for (const d of b.days) chosenSet.add(d);

  // A day already counted as part of the plan's qualifying off-time (new PTO spend, not baseline).
  const isSuggested: boolean[] = days.map((d, i) => !baseOff[i] && chosenSet.has(d));
  // "Off under the current plan" - baseline off, or already suggested.
  const currentOff: boolean[] = baseOff.map((off, i) => off || isSuggested[i]);

  for (let i = 0; i < n; i++) {
    const d = days[i];
    if (blackoutSet.has(d)) continue; // never eligible
    if (currentOff[i]) continue; // already off or already suggested - nothing to gain by hovering

    let leftLen = 0;
    let leftQualifies = false;
    for (let j = i - 1; j >= 0 && currentOff[j]; j--) {
      leftLen++;
      if (isSuggested[j]) leftQualifies = true;
    }

    let rightLen = 0;
    let rightQualifies = false;
    for (let j = i + 1; j < n && currentOff[j]; j++) {
      rightLen++;
      if (isSuggested[j]) rightQualifies = true;
    }

    const newRunLength = leftLen + 1 + rightLen;
    const alreadyCounted = (leftQualifies ? leftLen : 0) + (rightQualifies ? rightLen : 0);
    const deltaDays = newRunLength - alreadyCounted;
    const ptoCost = 1;

    result.set(d, { deltaDays, ptoCost, multiplier: deltaDays / ptoCost });
  }

  return result;
}

/** Convenience single-day lookup. Prefer computeMarginalValues + a cached Map for repeated reads. */
export function marginalValue(day: ISODate, input: SolveInput, primary: Break[]): MarginalValue | null {
  return computeMarginalValues(input, primary).get(day) ?? null;
}
