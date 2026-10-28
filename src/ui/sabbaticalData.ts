import { addDays, mondayIndexedDow } from '../solver/dateUtils';
import { isOffDay, daysBetween } from './landingData';
import { DEFAULT_WORK_WEEK, type WorkWeek } from '../solver/types';
import { demandFor } from '../data/demandIndex';
import type { Holiday } from '../data/holidays';

// Same thresholds solve.ts's HIGH_DEMAND_THRESHOLD/LOW_DEMAND_THRESHOLD and
// requestDeadline.ts's CONTESTED/QUIET_DEMAND_THRESHOLD use - kept as separate local
// constants rather than importing those private ones, since this is a distinct,
// placement-level concept that happens to use the same numbers (see requestDeadline.ts's
// own comment for why that file does the same thing).
const PEAK_DEMAND_THRESHOLD = 1.25;
const QUIET_DEMAND_THRESHOLD = 0.85;

export interface SabbaticalPlacement {
  start: string;
  /** The core block's own last day, before any PTO extension. */
  coreEnd: string;
  lengthDays: number;
  /** Public holidays whose date falls inside the core block, by name (possibly empty). */
  holidayNames: string[];
  /** Total away-days for this placement WITH the user's current PTO budget - Phase 3's
   * fix for the headline/card mismatch (K3a): ranking and display both use the same
   * number the hero shows for the selected placement, not a separate 0-PTO figure. */
  totalAwayDays: number;
  /** Mean travel-demand tag for the core block, from the same demand index solve.ts's
   * breaks use - null when neither clearly peak nor clearly quiet. */
  travelTag: 'peak travel' | 'quiet travel' | null;
  /** The actual PTO-extended range (core block + whichever side(s) absorbed PTO/free
   * days) - what selecting this card drives the hero and calendar to. */
  extendedStart: string;
  extendedEnd: string;
  /** How many of the user's PTO days land before/after the core block - "3 before, 2
   * after" (3B). */
  ptoBefore: number;
  ptoAfter: number;
  /** The same per-PTO-day marginal curve extendSabbatical returns, carried through so
   * Sabbatical.tsx's "what each added day buys" section never needs its own second
   * extendSabbatical call (which would risk computing a different number than the one
   * that drove this placement's own totalAwayDays). */
  marginal: { ptoUsed: number; awayDays: number }[];
}

function countWorkingDays(start: string, end: string, holidaySet: ReadonlySet<string>, workWeek: WorkWeek): number {
  let count = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!isOffDay(d, holidaySet, workWeek)) count++;
  }
  return count;
}

function travelTagFor(start: string, end: string, countryCode: string | undefined): SabbaticalPlacement['travelTag'] {
  let sum = 0;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    sum += demandFor(d, countryCode).value;
    n++;
  }
  const mean = n > 0 ? sum / n : 1;
  if (mean >= PEAK_DEMAND_THRESHOLD) return 'peak travel';
  if (mean <= QUIET_DEMAND_THRESHOLD) return 'quiet travel';
  return null;
}

/**
 * Extends `[start, end]` outward using up to `ptoToAdd` PTO days, always taking a free
 * (already-off) day before spending a PTO day on a working one, and - once PTO must be
 * spent - preferring whichever side's next working-day run is shorter (reaches its next
 * free day soonest). On a tie, prefers the RIGHT (after) side (3B) - near-term PTO stays
 * unspent unless the left side genuinely buys more. This greedy is optimal for this
 * problem shape: each side is an independent, monotonically-ordered sequence of
 * free/costed days, so always taking the cheapest available next day across both
 * sequences can never do worse than any other spending order.
 *
 * `minStart`, when given, is a hard floor the left edge may never cross - even with PTO
 * budget still unspent (3B/K3b: extension used to be able to walk left past both
 * eligibility and the real calendar date "today", landing partly in the past). Atiyk's
 * call: PTO is allowed to land before `eligibleFrom` (it's ordinary PTO), so callers pass
 * today's real date here, not eligibleFrom.
 */
export function extendSabbatical(
  start: string,
  end: string,
  ptoToAdd: number,
  holidaySet: ReadonlySet<string>,
  workWeek: WorkWeek = DEFAULT_WORK_WEEK,
  minStart?: string,
  maxLookahead = 400,
): { start: string; end: string; marginal: { ptoUsed: number; awayDays: number }[] } {
  let left = start;
  let right = end;
  let ptoUsed = 0;
  const totalDays = () => daysBetween(left, right) + 1;
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

  /** Absorbs every immediately-adjacent free day on both sides, spending no budget,
   * until neither side has one left - run once before the baseline is recorded (so the
   * 0-PTO baseline reflects the block's TRUE natural extent, 3C/K3c) and again after each
   * paid day (so a day that unlocks a free day right next to it gets credit for both). */
  function mergeFree(): void {
    for (let i = 0; i < maxLookahead; i++) {
      const leftNext = addDays(left, -1);
      const leftBlocked = minStart !== undefined && leftNext < minStart;
      const rightNext = addDays(right, 1);
      let moved = false;
      if (!leftBlocked && free(leftNext)) {
        left = leftNext;
        moved = true;
      }
      if (free(rightNext)) {
        right = rightNext;
        moved = true;
      }
      if (!moved) break;
    }
  }

  mergeFree();
  const marginal: { ptoUsed: number; awayDays: number }[] = [{ ptoUsed: 0, awayDays: totalDays() }];

  for (let i = 0; i < maxLookahead; i++) {
    if (ptoUsed >= ptoToAdd) break;
    const leftNext = addDays(left, -1);
    const leftBlocked = minStart !== undefined && leftNext < minStart;
    const leftCost = leftBlocked ? Infinity : runCost(left, -1);
    const rightCost = runCost(right, 1);
    if (rightCost <= leftCost) right = addDays(right, 1);
    else left = leftNext;
    ptoUsed++;
    mergeFree();
    marginal.push({ ptoUsed, awayDays: totalDays() });
  }

  return { start: left, end: right, marginal };
}

function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * 3D/K3e: the calendar used to render from `selected.start` (the core block's own start),
 * so PTO days extending the trip BACKWARD never appeared at all, and a trip crossing a
 * month boundary only ever showed the first month. This returns the range that actually
 * covers the whole trip (`extendedStart`..`extendedEnd`) plus one full calendar month of
 * context on either side, using only `addDays` - `addDays(firstOfMonth(x), 31)` always
 * lands somewhere inside the NEXT month regardless of the current month's length (31 is
 * the longest a month ever is), and `firstOfMonth` of that normalizes it back to that
 * month's own first day.
 */
export function paddedCalendarRange(extendedStart: string, extendedEnd: string): { start: string; end: string } {
  const start = firstOfMonth(addDays(firstOfMonth(extendedStart), -1));
  const nextMonthFirst = firstOfMonth(addDays(firstOfMonth(extendedEnd), 31));
  const afterNextMonthFirst = firstOfMonth(addDays(nextMonthFirst, 31));
  const end = addDays(afterNextMonthFirst, -1);
  return { start, end };
}

function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** The one-line differentiator for a placement card - "41 days away · includes Christmas
 * and New Year's Day · peak travel" - every clause computed from real data, never a fixed
 * label (3A). Clauses with nothing to say (no holidays inside, no clear travel signal)
 * are simply omitted rather than padded with a generic "no holidays inside" repeated on
 * every card - see bestPlacements' `anyHolidayInAnyCandidate` for the ONE place that case
 * is actually said, once, at the top. */
export function placementNote(p: SabbaticalPlacement): string {
  const clauses = [`${p.totalAwayDays} days away`];
  if (p.holidayNames.length > 0) clauses.push(`includes ${joinNames(p.holidayNames)}`);
  if (p.travelTag) clauses.push(p.travelTag);
  return clauses.join(' · ');
}

export interface BestPlacementsResult {
  placements: SabbaticalPlacement[];
  /** True if ANY candidate in the full search window (not just the top 3 shown) has a
   * holiday inside its core block - false means every window in the next year is
   * genuinely holiday-free, which is worth saying once rather than three times (3A). */
  anyHolidayInAnyCandidate: boolean;
}

/**
 * Ranks candidate sabbatical placements (one per Monday in the eligible window) by TOTAL
 * away-days INCLUDING the user's current PTO budget (3A/3B - ranking used to use the
 * 0-PTO "natural" total, which is why the cards used to disagree with the hero), then
 * picks the best, then the best whose core block doesn't overlap it, then the next -
 * never padding with near-duplicate, overlapping windows.
 */
export function bestPlacements(
  eligibleFrom: string,
  eligibleTo: string,
  lengthWeeks: number,
  ptoToAdd: number,
  holidays: Holiday[],
  countryCode: string | undefined,
  workWeek: WorkWeek = DEFAULT_WORK_WEEK,
  minStart?: string,
): BestPlacementsResult {
  const holidaySet = new Set(holidays.map((h) => h.date));
  const lengthDays = lengthWeeks * 7;
  const candidates: SabbaticalPlacement[] = [];
  let d = eligibleFrom;
  // Walk to the first Monday at or after eligibleFrom.
  while (mondayIndexedDow(d) !== 0) d = addDays(d, 1);

  const lastPossibleStart = addDays(eligibleTo, -(lengthDays - 1));
  while (d <= lastPossibleStart) {
    const coreEnd = addDays(d, lengthDays - 1);
    const holidayNames: string[] = [];
    for (let x = d; x <= coreEnd; x = addDays(x, 1)) {
      const match = holidays.find((h) => h.date === x);
      if (match) holidayNames.push(match.name);
    }

    const extended = extendSabbatical(d, coreEnd, ptoToAdd, holidaySet, workWeek, minStart);
    const totalAwayDays = daysBetween(extended.start, extended.end) + 1;
    const ptoBefore = extended.start < d ? countWorkingDays(extended.start, addDays(d, -1), holidaySet, workWeek) : 0;
    const ptoAfter = extended.end > coreEnd ? countWorkingDays(addDays(coreEnd, 1), extended.end, holidaySet, workWeek) : 0;

    candidates.push({
      start: d,
      coreEnd,
      lengthDays,
      holidayNames,
      totalAwayDays,
      travelTag: travelTagFor(d, coreEnd, countryCode),
      extendedStart: extended.start,
      extendedEnd: extended.end,
      ptoBefore,
      ptoAfter,
      marginal: extended.marginal,
    });
    d = addDays(d, 7);
  }

  const anyHolidayInAnyCandidate = candidates.some((c) => c.holidayNames.length > 0);

  candidates.sort((a, b) => b.totalAwayDays - a.totalAwayDays || b.holidayNames.length - a.holidayNames.length);

  // Diversity (3A): the chosen placements' core blocks must not overlap each other. Best
  // first, then the best that doesn't overlap any already-chosen one, then the next - if
  // fewer than three non-overlapping windows exist in the whole search, show fewer.
  const chosen: SabbaticalPlacement[] = [];
  for (const c of candidates) {
    if (chosen.every((p) => c.coreEnd < p.start || c.start > p.coreEnd)) {
      chosen.push(c);
      if (chosen.length === 3) break;
    }
  }

  return { placements: chosen, anyHolidayInAnyCandidate };
}
