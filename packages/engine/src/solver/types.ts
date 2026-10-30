export type ISODate = string; // YYYY-MM-DD, UTC calendar date

/** Index 0 = Monday ... index 6 = Sunday. true = normally a working day. */
export type WorkWeek = [boolean, boolean, boolean, boolean, boolean, boolean, boolean];

export const DEFAULT_WORK_WEEK: WorkWeek = [true, true, true, true, true, false, false];

export interface SolveInput {
  /** Days already off for free: public holidays, company holidays, already-booked PTO. */
  offDays: ISODate[];
  rangeStart: ISODate;
  rangeEnd: ISODate;
  /** Total PTO days available over the whole range (annual allotment). */
  budget: number;
  /** If set, PTO accrues over time instead of being available all at once. */
  accrualPerMonth?: number;
  /** If set, unused PTO accrued before this date is forfeited beyond carryoverCap. */
  expiryDate?: ISODate;
  /** Max days that can carry over past expiryDate. Defaults to 0. */
  carryoverCap?: number;
  /** Days that can never be chosen as PTO, even if they would otherwise be off. */
  blackouts?: ISODate[];
  /**
   * Days the user has explicitly pinned: must appear in the plan, at real PTO cost (unlike
   * offDays, which are free). A day here that's already a weekend/holiday/in offDays costs
   * nothing extra (it was already free); a day here that's a genuine workday is guaranteed
   * to appear in `primary`, spending 1 PTO day, regardless of w or breakCount - see solve()'s
   * own comment for how this is enforced.
   */
  mustIncludeDays?: ISODate[];
  /** Days someone else is off; chosen breaks overlapping these get a bonus + tag. */
  overlapDays?: ISODate[];
  workWeek?: WorkWeek;
  /** ISO country code driving which demand index is used for travel-demand tags. Non-US falls back to a generic estimate. */
  country?: string;
  /**
   * Optimisation weighting, 0-100 integer, step 10. 0 = maximise days off, ignore travel
   * demand. 100 = minimise travel demand, accept fewer days off. Defaults to 30.
   */
  w?: number;
  /**
   * Break-count slider position, 0-7 integer. 0 = unconstrained (solver picks freely).
   * 1-6 = target exactly that many breaks (falls back to the nearest achievable count if
   * the exact target is infeasible). 7 = maximise the count of separate breaks, uncapped.
   * Defaults to 0.
   */
  breakCount?: number;
  /** Phase 5.1: an optional employer policy cap on PTO spend within one window (e.g. "no
   * more than 5 days between Jun 1 and Aug 31"). Off unless `enabled` - see solve.ts's
   * enforcePeakCap for how this is applied (a bounded blackout-and-retry loop around the
   * ordinary solve, not a new DP dimension - deliberately scoped the same way
   * solveDualWindow's own comment scopes expiry/carryover, for the same reason: a secondary,
   * opt-in constraint doesn't justify the cost/risk of widening the core DP). */
  peakCap?: PeakCapInput;
}

export interface PeakCapInput {
  enabled: boolean;
  startDate: ISODate;
  endDate: ISODate;
  /** Max PTO days (not calendar days) that may be spent inside [startDate, endDate]. */
  maxDays: number;
}

export type BreakTag = 'Peak travel' | 'Low travel demand' | 'Estimated' | 'Overlaps';

export interface Break {
  /** Stable identity for a break within one solve() result: `${start}|${end}`. */
  id: string;
  start: ISODate;
  end: ISODate;
  days: ISODate[];
  totalDaysOff: number;
  ptoCost: number;
  multiplier: number;
  tags: BreakTag[];
  /** Mean demand-index value across the break's span (1.0 = average day). For the feedback strip. */
  meanDemand: number;
}

export interface Alternative extends Break {
  /** Identifies the primary break this alternative could replace. */
  replaces: { start: ISODate; end: ISODate };
}

export interface SolveResult {
  primary: Break[];
  alternatives: Alternative[];
  /** The break-count slider position that was requested (0-7). */
  breakCountRequested: number;
  /**
   * The break count the plan actually has. Equal to breakCountRequested unless that
   * exact target (1-6) was infeasible, in which case this is the nearest achievable count.
   */
  breakCountActual: number;
  /**
   * Total PTO days the plan actually spends. Always the maximum spendable amount for the
   * current (w, breakCount) structure - w and breakCount never leave budget on the table
   * that a valid plan could have used. Compare against SolveInput.budget: when lower, no
   * candidate could absorb the remainder.
   */
  budgetSpent: number;
  /** Phase 5.1: true only when a peakCap was both enabled AND actually reduced spend inside
   * its window below what the unconstrained plan would have spent there - never true just
   * because peakCap was configured if the natural plan was already under the cap. */
  peakCapApplied: boolean;
}

/** The percentile IS the score - not an indexed number with a percentile attached. 0-100,
 * a plain rank against the real distribution it's compared to (see computeScores in
 * solve.ts for what that distribution is, per score). No scaling or transform. */
export interface ScoreValue {
  percentile: number;
}

export interface Scores {
  /** Days off gained per PTO day spent. Higher is better. */
  efficiency: ScoreValue;
  /** Mean travel demand across chosen breaks. LOWER is better - always show the percentile
   * alongside it, since the direction inverts the usual "higher is better" reading. */
  travel: ScoreValue;
}
