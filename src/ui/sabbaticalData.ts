import { addDays, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { isOffDay, daysBetween } from './landingData';
import { DEFAULT_WORK_WEEK, type WorkWeek } from '@daysoff/engine/solver/types';

export interface SabbaticalPlacement {
  start: string;
  /** The core block's own last day, before any PTO extension. */
  coreEnd: string;
  lengthDays: number;
  /** Public holidays whose date falls inside the core block. */
  holidaysInside: number;
  /** Away-days for this placement with zero added PTO - weekends/holidays immediately
   * adjacent to the block are already included for free. */
  naturalAwayDays: number;
  /** A short, human label for why this placement is good - "quiet travel", "includes X", etc. */
  note: string;
}

/**
 * Extends `[start, end]` outward using up to `ptoToAdd` PTO days, always taking a free
 * (already-off) day before spending a PTO day on a working one, and - once PTO must be
 * spent - preferring whichever side's next working-day run is shorter (reaches its next
 * free day soonest), so a PTO day is never spent extending through a long stretch of
 * ordinary workdays when the other side would unlock a free day sooner. This greedy is
 * optimal for this problem shape: each side is an independent, monotonically-ordered
 * sequence of free/costed days, so always taking the cheapest available next day across
 * both sequences can never do worse than any other spending order.
 */
export function extendSabbatical(
  start: string,
  end: string,
  ptoToAdd: number,
  holidaySet: ReadonlySet<string>,
  workWeek: WorkWeek = DEFAULT_WORK_WEEK,
  maxLookahead = 400,
): { start: string; end: string; marginal: { ptoUsed: number; awayDays: number }[] } {
  let left = start;
  let right = end;
  let ptoUsed = 0;
  const totalDays = () => daysBetween(left, right) + 1;
  const marginal: { ptoUsed: number; awayDays: number }[] = [{ ptoUsed: 0, awayDays: totalDays() }];

  const free = (iso: string) => isOffDay(iso, holidaySet, workWeek);

  /** How many consecutive working (non-free) days sit immediately beyond `edge`, in
   * `direction`, before the first free day - the PTO cost to "break through" to it. */
  function runCost(edge: string, direction: 1 | -1): number {
    let d = edge;
    let cost = 0;
    for (let i = 0; i < maxLookahead; i++) {
      d = addDays(d, direction);
      if (free(d)) return cost;
      cost++;
    }
    return cost;
  }

  for (let i = 0; i < maxLookahead; i++) {
    const leftNext = addDays(left, -1);
    const rightNext = addDays(right, 1);
    const leftFree = free(leftNext);
    const rightFree = free(rightNext);
    if (leftFree || rightFree) {
      if (leftFree) left = leftNext;
      if (rightFree) right = rightNext;
      continue; // free extensions never cost budget or need a new marginal point
    }
    if (ptoUsed >= ptoToAdd) break;
    const leftCost = runCost(left, -1);
    const rightCost = runCost(right, 1);
    if (leftCost <= rightCost) left = leftNext;
    else right = rightNext;
    ptoUsed++;
    marginal.push({ ptoUsed, awayDays: totalDays() });
  }

  return { start: left, end: right, marginal };
}

/**
 * Ranks candidate sabbatical placements (one per Monday in the eligible window - a coarser
 * sample than every single day, since sabbaticals are realistically scheduled on week
 * boundaries anyway) by natural away-days plus holidays caught inside, and returns the top
 * three distinct ones.
 */
export function bestPlacements(
  eligibleFrom: string,
  eligibleTo: string,
  lengthWeeks: number,
  holidaySet: ReadonlySet<string>,
  workWeek: WorkWeek = DEFAULT_WORK_WEEK,
): SabbaticalPlacement[] {
  const lengthDays = lengthWeeks * 7;
  const candidates: SabbaticalPlacement[] = [];
  let d = eligibleFrom;
  // Walk to the first Monday at or after eligibleFrom.
  while (mondayIndexedDow(d) !== 0) d = addDays(d, 1);

  const lastPossibleStart = addDays(eligibleTo, -(lengthDays - 1));
  while (d <= lastPossibleStart) {
    const coreEnd = addDays(d, lengthDays - 1);
    let holidaysInside = 0;
    for (let x = d; x <= coreEnd; x = addDays(x, 1)) {
      if (holidaySet.has(x)) holidaysInside++;
    }
    const extended = extendSabbatical(d, coreEnd, 0, holidaySet, workWeek);
    const naturalAwayDays = daysBetween(extended.start, extended.end) + 1;
    const note = holidaysInside > 0 ? `includes ${holidaysInside} public holiday${holidaysInside === 1 ? '' : 's'}` : 'no holidays inside';
    candidates.push({ start: d, coreEnd, lengthDays, holidaysInside, naturalAwayDays, note });
    d = addDays(d, 7);
  }

  candidates.sort((a, b) => b.naturalAwayDays + b.holidaysInside * 2 - (a.naturalAwayDays + a.holidaysInside * 2));
  return candidates.slice(0, 3);
}
