import { rangeISO, mondayIndexedDow, monthsElapsed } from './dateUtils';
import { DEFAULT_WORK_WEEK } from './types';
import { demandFor } from '../data/demandIndex';
import type { Alternative, Break, BreakTag, ISODate, PeakCapInput, Scores, SolveInput, SolveResult, WorkWeek } from './types';

const VALUE_MULT = 1000;
const SENTINEL_START = '9999-12-31';
const HIGH_DEMAND_THRESHOLD = 1.25;
const LOW_DEMAND_THRESHOLD = 0.85;
const ALTERNATIVE_VALUE_TOLERANCE = 0.15;
const MAX_ALTERNATIVES_PER_BREAK = 2;
const DEFAULT_W = 30;
/**
 * How far a candidate starting on an ordinary WORKDAY (not already off) is allowed to
 * reach, in PTO-cost days - independent of maxCandidateCost/the user's real budget. This
 * is a search-breadth bound, not a truncation of what the user could spend: a workday
 * start's whole purpose is capturing "a handful of trailing workdays connecting to the
 * NEXT upcoming off period" (take Thursday+Friday for a long weekend); a genuinely long
 * vacation is still found with its full real reach via an off-day-anchored start (weekend
 * or holiday), which this bound does not touch. Without this, removing the old off-day-only
 * restriction (see buildCandidates' own comment on the bridge-finding bug it fixes) made
 * every one of a year's ~260 workdays its own candidate start reaching up to the full
 * budget forward, instead of just the ~104 off-days - a ~3.5x blowup that pushed full-year
 * solves from ~500ms to ~1.6-1.9s. 21 (three weeks) comfortably spans even an unusually
 * long holiday-free gap between off periods while keeping the search bounded - see
 * solve.test.ts's performance block, re-measured after this constant was introduced.
 */
const WORKDAY_START_REACH_CAP = 14;
/**
 * Fixed, w-INDEPENDENT weight on a candidate's length. This used to be `(100 - w)`, which
 * hit zero at w=100 and annihilated the days-off term entirely - every candidate's value
 * became purely about demand, so the DP's optimum was to take almost nothing (unspent
 * budget scored the same, 0, as a near-zero-value candidate). That was the root cause of
 * the "w=100 wastes most of the budget" bug: the solver wasn't broken, the objective was.
 * DAYS_OFF_WEIGHT never scales with w, so the days-off term is always active; w only scales
 * how heavily the demand term counts against it (see candidateValue). Budget-maximization
 * itself no longer depends on this value function at all - see betterCell's spent-first
 * ordering, which is the actual hard constraint. See NOTES.md.
 */
const DAYS_OFF_WEIGHT = 100;
/**
 * (meanDemand - 1) * this scale, rounded once at candidate-build time - the one controlled
 * division+round in the whole value path; everything downstream (candidateValue, the DP,
 * every comparison) is plain integer arithmetic.
 *
 * Calibrated empirically against DAYS_OFF_WEIGHT=100, not derived - see NOTES.md for the
 * comparison table across SCALE values. Now that spend and (for "Any") break count are
 * decided independently of w (betterCell's spent-first order, solveAny's two-phase split),
 * this constant only has to be large enough to actually move the TERTIARY choice - which
 * exact candidates fill an already-fixed (spend, count) structure - not large enough to
 * fight the days-off term for control of how much budget gets used at all.
 */
const DEMAND_DEVIATION_SCALE = 20;
/** How far past an exact break-count target (1-6) to search for the nearest achievable
 * count, before giving up. Generous relative to the target range, cheap relative to a
 * full budget-sized search. */
const EXACT_COUNT_SEARCH_CAP = 20;

interface Candidate {
  startIdx: number;
  endIdx: number;
  start: ISODate;
  end: ISODate;
  length: number;
  cost: number;
  cost1: number;
  cost2: number;
  overlapDayCount: number;
  demandSum: number;
  /** Integer: round((meanDemand - 1) * DEMAND_DEVIATION_SCALE). Negative = quieter than average. */
  demandDeviationScaled: number;
}

interface CellState {
  value: number;
  /** Total PTO cost spent to reach this cell. The PRIMARY key in betterCell - see there. */
  spent: number;
  breakCount: number;
  earliestStart: string | null;
}

const EMPTY_CELL: CellState = { value: 0, spent: 0, breakCount: 0, earliestStart: null };
/** Sentinel for "this (budget, count) combination cannot be reached at all", distinct from
 * EMPTY_CELL's "reached, with value 0". -Infinity propagates correctly through both the
 * addition in a take-transition and every comparison in betterCell, so it needs no special
 * casing beyond the one explicit reachability guard before a take-transition is considered. */
const UNREACHABLE: CellState = { value: -Infinity, spent: -1, breakCount: -1, earliestStart: null };

function isWorkingDow(iso: ISODate, workWeek: WorkWeek): boolean {
  return workWeek[mondayIndexedDow(iso)];
}

function buildCandidates(
  days: ISODate[],
  isOff: boolean[],
  isBlackout: boolean[],
  overlapSet: Set<string>,
  expiryDate: ISODate | undefined,
  country: string | undefined,
  maxCandidateCost: number,
): Candidate[] {
  const n = days.length;
  const candidates: Candidate[] = [];

  /**
   * BUG FOUND IN PHASE 1: this loop used to only start a candidate at an index that was
   * ALREADY off (`if (!isOff[i]) continue`), then walk forward. That can express "a
   * holiday/weekend extends forward through the rest of the work week to the next off
   * period" (the classic bridge), but it can NEVER express the mirror case: a handful of
   * workdays immediately BEFORE an upcoming off period (take Thursday+Friday to connect to
   * the weekend). The only off-day endpoint reachable from a work-week's own start (Monday)
   * is the far end of that whole work week - every "stop partway through, at Thursday"
   * shape was structurally unreachable, because nothing ever started a span there.
   *
   * Confirmed empirically before this fix: a plain holiday-free 4-month stretch (dozens of
   * ordinary weekends, no special dates at all) at budget=6 found one 5-cost, 9-day bridge
   * (walking an entire work week into the next weekend) and then had nothing better to do
   * with its last PTO day than spend it as an isolated 1.0x single day - even though a
   * classic "take Thu+Fri for a 4-day weekend" (2 cost, 4 days off, 2.0x) is exactly the
   * kind of plan this tool exists to find. See NOTES.md and solve.test.ts's "a workday run
   * can end a work week short, bridging forward into the next off period" tests.
   *
   * Fix: start a candidate at EVERY day, not just off days. The inner loop (below) only
   * ever pushes a candidate when it reaches an off-day endpoint, so a start that never
   * reaches one within `maxCandidateCost` simply produces nothing - no correctness risk,
   * just more of the search space actually gets explored. A blackout day still can't start
   * a span (you can't spend PTO on a day you're barred from taking off).
   */
  for (let i = 0; i < n; i++) {
    if (isBlackout[i]) continue;
    // Only a workday start gets the tighter WORKDAY_START_REACH_CAP - an off-day anchor
    // (the original, already-correct long-bridge behavior) keeps its full real-budget reach.
    const startCap = isOff[i] ? maxCandidateCost : Math.min(maxCandidateCost, WORKDAY_START_REACH_CAP);
    let cost = 0;
    let cost1 = 0;
    let cost2 = 0;
    let overlapDayCount = 0;
    let demandSum = 0;
    for (let j = i; j < n; j++) {
      const dISO = days[j];
      // A blackout day is a hard stop: you must be at work that day, so no
      // candidate can bridge across it, not even by spending a PTO day on it.
      if (isBlackout[j]) break;
      if (!isOff[j]) {
        cost++;
        // Bounded by the user's own budget (and, since cost only counts workdays,
        // never more than the range could possibly hold either) - NOT a fixed constant.
        // A fixed cap here is exactly what silently prevented a single break from ever
        // spending more than that constant, regardless of how much budget the user had
        // available - see NOTES.md for the "15 PTO days spends only 10" bug this fixes.
        if (cost > startCap) break;
        if (!expiryDate || dISO <= expiryDate) cost1++;
        else cost2++;
      }
      if (overlapSet.has(dISO)) overlapDayCount++;
      demandSum += demandFor(dISO, country).value;
      const length = j - i + 1;
      if (isOff[j] && cost >= 1) {
        candidates.push({
          startIdx: i,
          endIdx: j,
          start: days[i],
          end: dISO,
          length,
          cost,
          cost1,
          cost2,
          overlapDayCount,
          demandSum,
          demandDeviationScaled: Math.round((demandSum / length - 1) * DEMAND_DEVIATION_SCALE),
        });
      }
    }
  }

  // Standalone single-day PTO: a day off on its own, not anchored to an existing off day.
  // Always a legitimate (if usually suboptimal) option now that shape is a count, not a length.
  for (let i = 0; i < n; i++) {
    if (isOff[i] || isBlackout[i]) continue;
    const dISO = days[i];
    const demand = demandFor(dISO, country).value;
    candidates.push({
      startIdx: i,
      endIdx: i,
      start: dISO,
      end: dISO,
      length: 1,
      cost: 1,
      cost1: !expiryDate || dISO <= expiryDate ? 1 : 0,
      cost2: expiryDate && dISO > expiryDate ? 1 : 0,
      overlapDayCount: overlapSet.has(dISO) ? 1 : 0,
      demandSum: demand,
      demandDeviationScaled: Math.round((demand - 1) * DEMAND_DEVIATION_SCALE),
    });
  }

  return candidates;
}

/**
 * value = DAYS_OFF_WEIGHT * length - w * demandDeviationScaled, both terms already
 * integers. DAYS_OFF_WEIGHT is fixed (never scaled by w), so the days-off term can never
 * be annihilated the way the old `(100 - w) * length` term was at w=100 - see
 * DAYS_OFF_WEIGHT's comment. w only scales how heavily the demand term counts against
 * that fixed weight.
 *
 * Despite the name, this is no longer the function that decides HOW MANY PTO days get
 * used or how many breaks result - see betterCell (spend is the primary, w-independent
 * key) and solveAny (break count, for the unconstrained position, is also decided before
 * w is consulted). candidateValue is now only the tertiary tiebreak: given an
 * already-fixed spend and break count, which exact candidates (which dates) fill it.
 * Scaled by VALUE_MULT and nudged by the overlap bonus exactly as before, so that small
 * tie-break signal never flips the main ordering.
 */
function candidateValue(w: number, c: Candidate): number {
  const weighted = DAYS_OFF_WEIGHT * c.length - w * c.demandDeviationScaled;
  return weighted * VALUE_MULT + c.overlapDayCount;
}

/** Index of the first candidate (1-based dp row) that is compatible (ends before this candidate starts). */
function findCompatiblePrefix(candidates: Candidate[], idx: number): number {
  const startIdx = candidates[idx].startIdx;
  // candidates sorted by endIdx ascending; find count of candidates with endIdx < startIdx
  let lo = 0;
  let hi = candidates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candidates[mid].endIdx < startIdx) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Lexicographic cell comparison: spent first, then value, then earliest start, then
 * fewest breaks. `spent` is compared BEFORE `value` and never involves w - that's the hard
 * budget-maximization constraint the bug report asked for, implemented structurally rather
 * than as a value-function penalty. Two cells reachable at the same (candidates-so-far,
 * budget-so-far) step always rank by how much budget they've actually used first; only
 * once that's tied does the w-weighted value get consulted at all. This is what guarantees
 * "spends the same number of PTO days at every w" without needing to separately verify it
 * empirically - it's true by construction, because the comparison that decides every
 * skip/take choice in the DP can't see w until spend is already decided.
 */
function betterCell(a: CellState, b: CellState): CellState {
  if (a.spent !== b.spent) return a.spent > b.spent ? a : b;
  if (a.value !== b.value) return a.value > b.value ? a : b;
  const aStart = a.earliestStart ?? SENTINEL_START;
  const bStart = b.earliestStart ?? SENTINEL_START;
  if (aStart !== bStart) return aStart < bStart ? a : b;
  if (a.breakCount !== b.breakCount) return a.breakCount < b.breakCount ? a : b;
  return a;
}

function accruedByDefault(budget: number): number {
  return budget;
}

function accruedBy(dateISO: ISODate, rangeStart: ISODate, budget: number, accrualPerMonth?: number): number {
  if (!accrualPerMonth) return accruedByDefault(budget);
  const months = monthsElapsed(rangeStart, dateISO);
  return Math.min(budget, months * accrualPerMonth);
}

/** Unconstrained-count DP (break-count slider position 0 / "Any"). Identical in spirit to
 * the project's original single-objective DP, just with the w-weighted value function. */
function solveSingleWindow(candidates: Candidate[], input: SolveInput, budgetMax: number, w: number): Candidate[] {
  const m = candidates.length;
  const dp: CellState[][] = Array.from({ length: m + 1 }, () => new Array(budgetMax + 1).fill(EMPTY_CELL));
  const choice: ('skip' | 'take')[][] = Array.from({ length: m + 1 }, () => new Array(budgetMax + 1).fill('skip'));

  for (let i = 1; i <= m; i++) {
    const c = candidates[i - 1];
    const pRow = findCompatiblePrefix(candidates, i - 1);
    const value = candidateValue(w, c);
    const accrued = input.accrualPerMonth
      ? accruedBy(c.end, input.rangeStart, input.budget, input.accrualPerMonth)
      : budgetMax;
    for (let b = 0; b <= budgetMax; b++) {
      const skipState = dp[i - 1][b];
      let takeState: CellState | null = null;
      if (c.cost <= b) {
        let allowed = true;
        if (input.accrualPerMonth) {
          if (b > accrued) allowed = false;
        }
        if (allowed) {
          const prior = dp[pRow][b - c.cost];
          takeState = {
            value: prior.value + value,
            spent: prior.spent + c.cost,
            breakCount: prior.breakCount + 1,
            earliestStart: prior.breakCount === 0 ? c.start : prior.earliestStart,
          };
        }
      }
      if (takeState) {
        const best = betterCell(skipState, takeState);
        dp[i][b] = best;
        choice[i][b] = best === takeState ? 'take' : 'skip';
      } else {
        dp[i][b] = skipState;
        choice[i][b] = 'skip';
      }
    }
  }

  let bestB = 0;
  let best = dp[m][0];
  for (let b = 1; b <= budgetMax; b++) {
    const cand = dp[m][b];
    const winner = betterCell(best, cand);
    if (winner === cand && winner !== best) {
      best = cand;
      bestB = b;
    }
  }

  const chosen: Candidate[] = [];
  let i = m;
  let b = bestB;
  while (i > 0) {
    if (choice[i][b] === 'take') {
      const c = candidates[i - 1];
      chosen.push(c);
      const pRow = findCompatiblePrefix(candidates, i - 1);
      b -= c.cost;
      i = pRow;
    } else {
      i -= 1;
    }
  }
  chosen.reverse();
  return chosen;
}

interface CountDPTable {
  dp: CellState[][][];
  choice: ('skip' | 'take')[][][];
  m: number;
  cMax: number;
}

/**
 * dp[i][b][c] = best value using exactly c breaks and at most b budget from the first i
 * candidates. The budget dimension keeps its existing "at most" semantics (final answer
 * takes max over b <= budgetMax, same as the unconstrained DP); the count dimension is
 * EXACT, which is why its base row only seeds (b, 0) as reachable - (b, c>0) at i=0 is
 * genuinely impossible (0 candidates can't produce any breaks) and must stay UNREACHABLE,
 * not fall back to EMPTY_CELL, or "exactly c" would silently degrade into "at most c".
 */
function buildCountDP(candidates: Candidate[], input: SolveInput, budgetMax: number, w: number, cMax: number): CountDPTable {
  const m = candidates.length;
  const minimumCost = candidates.reduce((minimum, candidate) => Math.min(minimum, candidate.cost), Infinity);
  const dp: CellState[][][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: budgetMax + 1 }, () =>
      Array.from({ length: cMax + 1 }, (_, c) => (i === 0 && c === 0 ? EMPTY_CELL : UNREACHABLE)),
    ),
  );
  const choice: ('skip' | 'take')[][][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: budgetMax + 1 }, () => new Array(cMax + 1).fill('skip')),
  );

  for (let i = 1; i <= m; i++) {
    const c = candidates[i - 1];
    const pRow = findCompatiblePrefix(candidates, i - 1);
    const value = candidateValue(w, c);
    const accrued = input.accrualPerMonth
      ? accruedBy(c.end, input.rangeStart, input.budget, input.accrualPerMonth)
      : budgetMax;
    for (let b = 0; b <= budgetMax; b++) {
      // A break costs at least minimumCost, so larger counts cannot be reached at
      // this budget. Their prefilled UNREACHABLE/skip cells already have the answer.
      const reachableCount = Math.min(cMax, Math.floor(b / minimumCost));
      for (let cnt = 0; cnt <= reachableCount; cnt++) {
        const skipState = dp[i - 1][b][cnt];
        let takeState: CellState | null = null;
        if (cnt >= 1 && c.cost <= b) {
          const prior = dp[pRow][b - c.cost][cnt - 1];
          let allowed = prior.value !== -Infinity;
          if (allowed && input.accrualPerMonth) {
            if (b > accrued) allowed = false;
          }
          if (allowed) {
            takeState = {
              value: prior.value + value,
              spent: prior.spent + c.cost,
              breakCount: cnt,
              earliestStart: prior.breakCount === 0 ? c.start : prior.earliestStart,
            };
          }
        }
        if (takeState) {
          const best = betterCell(skipState, takeState);
          dp[i][b][cnt] = best;
          choice[i][b][cnt] = best === takeState ? 'take' : 'skip';
        } else {
          dp[i][b][cnt] = skipState;
          choice[i][b][cnt] = 'skip';
        }
      }
    }
  }

  return { dp, choice, m, cMax };
}

function reconstructCountDP(candidates: Candidate[], table: CountDPTable, startB: number, startC: number): Candidate[] {
  const { choice, m } = table;
  const chosen: Candidate[] = [];
  let i = m;
  let b = startB;
  let cnt = startC;
  while (i > 0) {
    if (choice[i][b][cnt] === 'take') {
      const c = candidates[i - 1];
      chosen.push(c);
      const pRow = findCompatiblePrefix(candidates, i - 1);
      b -= c.cost;
      cnt -= 1;
      i = pRow;
    } else {
      i -= 1;
    }
  }
  chosen.reverse();
  return chosen;
}

/** Best (b) for an exact count `cnt`, or null if that count is unreachable at any budget. */
function bestForExactCount(table: CountDPTable, budgetMax: number, cnt: number): { b: number; cell: CellState } | null {
  let bestB = -1;
  let best: CellState = UNREACHABLE;
  for (let b = 0; b <= budgetMax; b++) {
    const cell = table.dp[table.m][b][cnt];
    if (cell.value === -Infinity) continue;
    const winner = betterCell(best, cell);
    if (winner === cell && winner !== best) {
      best = cell;
      bestB = b;
    }
  }
  return bestB === -1 ? null : { b: bestB, cell: best };
}

/**
 * Break-count slider position 0 ("Any"). Two-phase, so that w can only ever decide WHERE
 * breaks land, never HOW MANY breaks or how much budget gets used - both of those must be
 * identical across every w on the same input (see NOTES.md for the "w=100 wastes most of
 * the budget" bug this replaces, and betterCell's spent-first comment for the budget half
 * of the fix).
 *
 * Phase 1 finds the canonical break count by running the ordinary unconstrained DP with w
 * forced to 0. At w=0, candidateValue is pure `DAYS_OFF_WEIGHT * length` - no demand term
 * at all - so this phase answers only "how many breaks, structurally, best spend this
 * budget", and that answer is w-independent by construction (nothing here ever reads the
 * caller's real w).
 *
 * Phase 2 takes that exact count as a hard constraint and re-solves with the REAL w, using
 * the same spend-maximizing count-DP the explicit break-count slider positions already use
 * (buildCountDP). Because phase 1's count is guaranteed achievable - it's where phase 1
 * itself landed - this never needs solveExactCount's nearest-achievable fallback search.
 */
function solveAny(candidates: Candidate[], input: SolveInput, budgetMax: number, w: number): Candidate[] {
  const structural = solveSingleWindow(candidates, input, budgetMax, 0);
  const targetCount = structural.length;
  if (targetCount === 0 || w === 0) return structural;

  // Once the exact count is known, a candidate must leave enough budget for every
  // other break. Removing only mathematically impossible candidates saves DP rows
  // without changing any value or tie-breaking comparison.
  const eligible = candidatesForCount(candidates, budgetMax, targetCount);
  const table = buildCountDP(eligible, input, budgetMax, w, targetCount);
  const found = bestForExactCount(table, budgetMax, targetCount);
  if (!found) return structural; // defensive: phase 1 already proved this count is reachable
  return reconstructCountDP(eligible, table, found.b, targetCount);
}

function candidatesForCount(candidates: Candidate[], budgetMax: number, count: number): Candidate[] {
  if (count <= 1) return candidates;
  const minimumCost = candidates.reduce((minimum, candidate) => Math.min(minimum, candidate.cost), Infinity);
  const maximumCost = budgetMax - (count - 1) * minimumCost;
  return candidates.filter((candidate) => candidate.cost <= maximumCost);
}

function solveExactCount(
  candidates: Candidate[],
  input: SolveInput,
  budgetMax: number,
  w: number,
  target: number,
): { chosen: Candidate[]; achieved: number } {
  // cMax bounds the table, which can legitimately be smaller than `target` itself (e.g.
  // target=6 but only budget for 2 breaks) - so the nearest-achievable search below must
  // scan every reachable count in [0, cMax] and rank by distance from target, not expand
  // outward from target, which would never reach anything when target > cMax to begin with.
  // Count feasibility is downward-closed: taking a subset of a feasible schedule
  // cannot increase spend or break the accrual ceiling. If target is unreachable,
  // no larger count can be reachable either. Avoid building unused larger counts.
  const cMax = Math.min(target, EXACT_COUNT_SEARCH_CAP, budgetMax, candidates.length);
  const table = buildCountDP(candidates, input, budgetMax, w, cMax);

  let bestCnt = -1;
  let bestDistance = Infinity;
  for (let cnt = 0; cnt <= cMax; cnt++) {
    if (!bestForExactCount(table, budgetMax, cnt)) continue;
    const distance = Math.abs(cnt - target);
    if (distance < bestDistance || (distance === bestDistance && cnt < bestCnt)) {
      bestDistance = distance;
      bestCnt = cnt;
    }
  }
  if (bestCnt === -1) return { chosen: [], achieved: 0 };
  const found = bestForExactCount(table, budgetMax, bestCnt)!;
  return { chosen: reconstructCountDP(candidates, table, found.b, bestCnt), achieved: bestCnt };
}

function solveMaxCount(
  candidates: Candidate[],
  input: SolveInput,
  budgetMax: number,
  w: number,
): { chosen: Candidate[]; achieved: number } {
  let eligible = candidates;
  const minimumCost = candidates.reduce((minimum, candidate) => Math.min(minimum, candidate.cost), Infinity);
  let cMax = Math.min(Math.floor(budgetMax / minimumCost), candidates.length);

  const lastCostOneStart = new Map<number, number>();
  for (const candidate of candidates) {
    if (candidate.cost === 1) lastCostOneStart.set(candidate.endIdx, Math.max(lastCostOneStart.get(candidate.endIdx) ?? -1, candidate.startIdx));
  }
  const hasCostOneSuffixes = candidates.every((candidate) => candidate.cost === 1 || (lastCostOneStart.get(candidate.endIdx) ?? -1) >= candidate.startIdx);
  if (hasCostOneSuffixes) {
    // Every candidate can be replaced by a contained cost-1 suffix with the same
    // end date. This holds for the legacy candidate set; verify it explicitly so
    // minimum-length constraints automatically keep the general DP when needed.
    // A suffix cannot hurt compatibility or accrual, so the maximum COUNT is the
    // earliest-finish schedule of cost-1 spans.
    // The ordinary value DP below still selects the final plan and tie-breaks; it
    // may use more expensive spans when fewer than budgetMax breaks are feasible.
    let count = 0;
    let lastEnd = -1;
    for (const candidate of candidates) {
      if (count >= budgetMax) break;
      if (candidate.cost !== 1 || candidate.startIdx <= lastEnd) continue;
      if (input.accrualPerMonth && count + 1 > accruedBy(candidate.end, input.rangeStart, input.budget, input.accrualPerMonth)) continue;
      count++;
      lastEnd = candidate.endIdx;
    }
    cMax = count;
    eligible = candidatesForCount(candidates, budgetMax, count);
  }

  const table = buildCountDP(eligible, input, budgetMax, w, cMax);

  for (let cnt = cMax; cnt >= 0; cnt--) {
    const found = bestForExactCount(table, budgetMax, cnt);
    if (found) {
      return { chosen: reconstructCountDP(eligible, table, found.b, cnt), achieved: cnt };
    }
  }
  return { chosen: [], achieved: 0 };
}

/**
 * budget1 (pre-expiry) and budget2 (post-expiry: carryover + any accrual earned after
 * expiry) ceilings for the dual-window path. Pulled out of solveDualWindow so the SAME
 * numbers can be used to size the candidate-enumeration cap before any candidates are
 * built - budget2Max can legitimately exceed the plain annual `input.budget` whenever
 * carryoverCap (or post-expiry accrual) adds room beyond it, so capping enumeration at
 * `input.budget` alone would silently exclude a candidate that spends, say, 5 pre-expiry
 * + 15 carried-over days even though 20 total is genuinely affordable. See NOTES.md.
 */
function dualWindowBudgets(input: SolveInput, expiryDate: ISODate): { budget1Max: number; budget2Max: number } {
  const carryoverCap = input.carryoverCap ?? 0;
  const budget1Max = Math.max(
    0,
    Math.floor(accruedBy(expiryDate, input.rangeStart, input.budget, input.accrualPerMonth)),
  );
  const accruedAtEnd = accruedBy(input.rangeEnd, input.rangeStart, input.budget, input.accrualPerMonth);
  const accruedAtExpiry = accruedBy(expiryDate, input.rangeStart, input.budget, input.accrualPerMonth);
  const budget2Max = Math.max(
    0,
    Math.floor(carryoverCap + (input.accrualPerMonth ? Math.max(0, accruedAtEnd - accruedAtExpiry) : 0)),
  );
  return { budget1Max, budget2Max };
}

/**
 * Dual-window (expiry/carryover) solve. Break count here is a simple upper-bound cap, not
 * the full exact-target-with-fallback or true-maximise semantics the single-window path
 * gets - seeNOTES.md for why a full 4D (b1, b2, count) DP was judged disproportionate scope
 * against an advanced, secondary feature.
 */
function solveDualWindow(candidates: Candidate[], input: SolveInput, w: number, breakCountCap: number | null): Candidate[] {
  const expiryDate = input.expiryDate as ISODate;
  const carryoverCap = input.carryoverCap ?? 0;
  const { budget1Max, budget2Max } = dualWindowBudgets(input, expiryDate);
  const accruedAtExpiry = accruedBy(expiryDate, input.rangeStart, input.budget, input.accrualPerMonth);

  function window2BudgetAt(dateISO: ISODate): number {
    if (!input.accrualPerMonth) return carryoverCap;
    const accruedNow = accruedBy(dateISO, input.rangeStart, input.budget, input.accrualPerMonth);
    return carryoverCap + Math.max(0, accruedNow - accruedAtExpiry);
  }

  const m = candidates.length;
  const dp: CellState[][][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: budget1Max + 1 }, () => new Array(budget2Max + 1).fill(EMPTY_CELL)),
  );
  const choice: ('skip' | 'take')[][][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: budget1Max + 1 }, () => new Array(budget2Max + 1).fill('skip')),
  );

  for (let i = 1; i <= m; i++) {
    const c = candidates[i - 1];
    const pRow = findCompatiblePrefix(candidates, i - 1);
    for (let b1 = 0; b1 <= budget1Max; b1++) {
      for (let b2 = 0; b2 <= budget2Max; b2++) {
        const skipState = dp[i - 1][b1][b2];
        let takeState: CellState | null = null;
        if (c.cost1 <= b1 && c.cost2 <= b2) {
          let allowed = true;
          if (input.accrualPerMonth) {
            const ref1 = c.end <= expiryDate ? c.end : expiryDate;
            const accrued1 = accruedBy(ref1, input.rangeStart, input.budget, input.accrualPerMonth);
            if (b1 > accrued1) allowed = false;
            if (c.cost2 > 0) {
              const budget2AtEnd = window2BudgetAt(c.end);
              if (b2 > budget2AtEnd) allowed = false;
            }
          }
          const prior = dp[pRow][b1 - c.cost1][b2 - c.cost2];
          if (breakCountCap !== null && prior.breakCount + 1 > breakCountCap) allowed = false;
          if (allowed) {
            takeState = {
              value: prior.value + candidateValue(w, c),
              spent: prior.spent + c.cost1 + c.cost2,
              breakCount: prior.breakCount + 1,
              earliestStart: prior.breakCount === 0 ? c.start : prior.earliestStart,
            };
          }
        }
        if (takeState) {
          const best = betterCell(skipState, takeState);
          dp[i][b1][b2] = best;
          choice[i][b1][b2] = best === takeState ? 'take' : 'skip';
        } else {
          dp[i][b1][b2] = skipState;
          choice[i][b1][b2] = 'skip';
        }
      }
    }
  }

  let bestB1 = 0;
  let bestB2 = 0;
  let best = dp[m][0][0];
  for (let b1 = 0; b1 <= budget1Max; b1++) {
    for (let b2 = 0; b2 <= budget2Max; b2++) {
      if (b1 === 0 && b2 === 0) continue;
      const cand = dp[m][b1][b2];
      const winner = betterCell(best, cand);
      if (winner === cand && winner !== best) {
        best = cand;
        bestB1 = b1;
        bestB2 = b2;
      } else if (winner === cand && winner === best) {
        if (b1 + b2 < bestB1 + bestB2) {
          bestB1 = b1;
          bestB2 = b2;
        }
      }
    }
  }

  const chosen: Candidate[] = [];
  let i = m;
  let b1 = bestB1;
  let b2 = bestB2;
  while (i > 0) {
    if (choice[i][b1][b2] === 'take') {
      const c = candidates[i - 1];
      chosen.push(c);
      const pRow = findCompatiblePrefix(candidates, i - 1);
      b1 -= c.cost1;
      b2 -= c.cost2;
      i = pRow;
    } else {
      i -= 1;
    }
  }
  chosen.reverse();
  return chosen;
}

function roundMultiplier(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * BUG FOUND: a candidate whose own travel demand happens to be low/high still got tagged
 * "Low travel demand"/"Peak travel" even at w=0, where candidateValue's demand term is
 * multiplied by w and is therefore exactly zero - travel demand had NO influence on which
 * candidate was picked. A day showing up at w=0 only ever does so because of
 * budget-maximization (see buildCandidates/betterCell), never because it's quiet or busy,
 * so labelling it "chosen for low travel demand" at w=0 asserts a causal reason that
 * provably wasn't a factor at all. Confirmed empirically: at w=0 with "maximise break
 * count" and a budget exceeding the number of 1-cost bridges available, the leftover
 * standalone single day the optimizer was forced to spend on still carried the
 * "Low travel demand" tag purely because its own TSA number happened to be low - nothing
 * about why it was chosen. Gated to w > 0: the tag (and "Estimated", its non-US
 * equivalent) now only appears when demand could plausibly have been a real factor in the
 * choice, not just a true-but-irrelevant fact about the date.
 */
function demandTag(c: Candidate, estimated: boolean, w: number): BreakTag | null {
  if (w === 0) return null;
  const mean = c.demandSum / c.length;
  const high = mean >= HIGH_DEMAND_THRESHOLD;
  const low = mean <= LOW_DEMAND_THRESHOLD;
  if (!high && !low) return null;
  if (estimated) return 'Estimated';
  return high ? 'Peak travel' : 'Low travel demand';
}

function toBreak(c: Candidate, overlapSet: Set<string>, estimated: boolean, w: number): Break {
  const days = rangeISO(c.start, c.end);
  const tags: BreakTag[] = [];
  const tag = demandTag(c, estimated, w);
  if (tag) tags.push(tag);
  if (c.overlapDayCount > 0 && days.some((d) => overlapSet.has(d))) tags.push('Overlaps');
  return {
    id: `${c.start}|${c.end}`,
    start: c.start,
    end: c.end,
    days,
    totalDaysOff: c.length,
    ptoCost: c.cost,
    multiplier: roundMultiplier(c.length / c.cost),
    tags,
    meanDemand: roundMultiplier(c.demandSum / c.length),
  };
}

function candidatesOverlap(a: Candidate, b: Candidate): boolean {
  return a.startIdx <= b.endIdx && b.startIdx <= a.endIdx;
}

/**
 * MAX_ALTERNATIVES_PER_BREAK (2) is a hard cap per primary break, enforced by the final
 * `slice` below - verified directly in solve.test.ts ("never more than
 * MAX_ALTERNATIVES_PER_BREAK per break"). "Keep the 2 closest in value" means closest to
 * the PRIMARY's own value, not simply the 2 highest-value candidates in the tolerance
 * window - sorting by raw value descending (the previous implementation) would prefer a
 * candidate markedly ABOVE primaryValue over one much closer but slightly below it, which
 * isn't "closest." Sorting by |value - primaryValue| ascending is.
 */
export function findAlternatives(primary: Candidate, otherPrimary: Candidate[], allCandidates: Candidate[], w: number): Candidate[] {
  const primaryValue = candidateValue(w, primary);
  const tolerance = Math.max(Math.abs(primaryValue), 1) * ALTERNATIVE_VALUE_TOLERANCE;

  const pool = allCandidates.filter((c) => {
    if (c === primary) return false;
    if (c.cost !== primary.cost) return false;
    if (Math.abs(candidateValue(w, c) - primaryValue) > tolerance) return false;
    return !otherPrimary.some((o) => candidatesOverlap(c, o));
  });

  pool.sort((a, b) => {
    const da = Math.abs(candidateValue(w, a) - primaryValue);
    const db = Math.abs(candidateValue(w, b) - primaryValue);
    if (da !== db) return da - db;
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    return a.end < b.end ? -1 : 1;
  });

  return pool.slice(0, MAX_ALTERNATIVES_PER_BREAK);
}

function solveCore(input: SolveInput): SolveResult {
  const workWeek = input.workWeek ?? DEFAULT_WORK_WEEK;
  const w = Math.max(0, Math.min(100, Math.round(input.w ?? DEFAULT_W)));
  const breakCountRequested = Math.max(0, Math.min(7, Math.round(input.breakCount ?? 0)));
  const days = rangeISO(input.rangeStart, input.rangeEnd);
  const n = days.length;
  if (n === 0)
    return { primary: [], alternatives: [], breakCountRequested, breakCountActual: 0, budgetSpent: 0, peakCapApplied: false };

  const offSet = new Set(input.offDays ?? []);
  const blackoutSet = new Set(input.blackouts ?? []);
  const overlapSet = new Set(input.overlapDays ?? []);
  const estimated = input.country !== 'US';

  const isOff: boolean[] = days.map((d) => {
    if (blackoutSet.has(d)) return false;
    if (!isWorkingDow(d, workWeek)) return true;
    if (offSet.has(d)) return true;
    return false;
  });
  const isBlackout: boolean[] = days.map((d) => blackoutSet.has(d));

  /**
   * A pinned day that's a genuine workday has a real cost (1 PTO day) that must be spent
   * no matter what the optimizer would otherwise choose - unlike offDays, pinning was
   * previously implemented by injecting the date straight into offDays, which made it FREE
   * and only coincidentally present when some other candidate's span happened to cross it.
   * Confirmed empirically: at breakCount=1 ("all in one") and breakCount=7 ("as many as
   * possible"), an isolated pinned day was silently dropped from the result entirely - see
   * NOTES.md. Fixed by reserving its cost up front (shrinking the budget the optimizer gets
   * to play with) and then guaranteeing its presence in the final `chosen` set below,
   * rather than hoping the optimization happens to produce it.
   */
  const mustIncludeForcedCost = new Set(
    (input.mustIncludeDays ?? []).filter(
      (d) => days.includes(d) && isWorkingDow(d, workWeek) && !offSet.has(d) && !blackoutSet.has(d),
    ),
  );
  const reservedBudget = mustIncludeForcedCost.size;
  const effectiveInput: SolveInput = reservedBudget > 0 ? { ...input, budget: Math.max(0, (input.budget ?? 0) - reservedBudget) } : input;

  const budgetMax = Math.max(0, Math.floor(effectiveInput.budget ?? 0));
  // Never more than the user could ever spend, and never more than the range could ever
  // hold (cost only counts workdays, which can't exceed the day count) - see
  // buildCandidates's own comment for why this must not be a fixed constant. With an
  // expiry date, a single candidate's total cost is cost1+cost2 split across BOTH
  // windows, and budget2 (carryover) can push the real ceiling above the plain annual
  // `input.budget` - capping at budgetMax alone there would reintroduce the exact same
  // class of bug this phase fixed, just scoped to the dual-window path instead of a
  // literal constant.
  const totalBudgetCeiling = input.expiryDate
    ? (() => {
        const { budget1Max, budget2Max } = dualWindowBudgets(effectiveInput, input.expiryDate as ISODate);
        return budget1Max + budget2Max;
      })()
    : budgetMax;
  const maxCandidateCost = Math.min(totalBudgetCeiling, n);

  const candidates = buildCandidates(days, isOff, isBlackout, overlapSet, input.expiryDate, input.country, maxCandidateCost);
  candidates.sort((a, b) => a.endIdx - b.endIdx || a.startIdx - b.startIdx);
  if (candidates.length === 0)
    return { primary: [], alternatives: [], breakCountRequested, breakCountActual: 0, budgetSpent: 0, peakCapApplied: false };

  let chosen: Candidate[];
  let breakCountActual: number;

  if (input.expiryDate) {
    const cap = breakCountRequested === 0 || breakCountRequested === 7 ? null : breakCountRequested;
    chosen = solveDualWindow(candidates, effectiveInput, w, cap);
    breakCountActual = chosen.length;
  } else if (breakCountRequested === 0) {
    chosen = solveAny(candidates, effectiveInput, budgetMax, w);
    breakCountActual = chosen.length;
  } else if (breakCountRequested === 7) {
    const result = solveMaxCount(candidates, effectiveInput, budgetMax, w);
    chosen = result.chosen;
    breakCountActual = result.achieved;
  } else {
    const result = solveExactCount(candidates, effectiveInput, budgetMax, w, breakCountRequested);
    chosen = result.chosen;
    breakCountActual = result.achieved;
  }

  // Guarantee every pinned workday is actually present - the optimization above never had
  // a mechanism to force a specific date in, only to afford it (reservedBudget). Anything
  // already absorbed into a chosen candidate's span needs nothing further; anything the
  // optimizer didn't happen to reach becomes its own 1-day candidate, spending its reserved
  // cost. This can push breakCountActual above what breakCount requested - correct, not a
  // bug: the same precedent as solveExactCount's own nearest-achievable fallback elsewhere
  // in this file, applied to a harder constraint (the day MUST be in the plan) than a soft
  // target (a break count).
  if (mustIncludeForcedCost.size > 0) {
    for (const d of mustIncludeForcedCost) {
      const alreadyCovered = chosen.some((c) => d >= c.start && d <= c.end);
      if (alreadyCovered) continue;
      const demand = demandFor(d, input.country).value;
      chosen.push({
        startIdx: -1, // synthetic: not a real index into `days`/`candidates`, never looked up by index
        endIdx: -1,
        start: d,
        end: d,
        length: 1,
        cost: 1,
        cost1: !input.expiryDate || d <= (input.expiryDate as ISODate) ? 1 : 0,
        cost2: input.expiryDate && d > (input.expiryDate as ISODate) ? 1 : 0,
        overlapDayCount: overlapSet.has(d) ? 1 : 0,
        demandSum: demand,
        demandDeviationScaled: Math.round((demand - 1) * DEMAND_DEVIATION_SCALE),
      });
    }
    chosen.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    breakCountActual = chosen.length;
  }

  const primary = chosen.map((c) => toBreak(c, overlapSet, estimated, w));

  const alternatives: Alternative[] = [];
  for (const p of chosen) {
    const otherPrimary = chosen.filter((c) => c !== p);
    const alts = findAlternatives(p, otherPrimary, candidates, w);
    for (const alt of alts) {
      alternatives.push({
        ...toBreak(alt, overlapSet, estimated, w),
        replaces: { start: p.start, end: p.end },
      });
    }
  }

  // The DP's own "spent" field already tracks this per-candidate-set internally, but it's
  // simplest to just re-sum the final chosen set here rather than thread an extra return
  // value out of three different solve* functions with three different DP shapes.
  const budgetSpent = chosen.reduce((s, c) => s + (input.expiryDate ? c.cost1 + c.cost2 : c.cost), 0);

  return { primary, alternatives, breakCountRequested, breakCountActual, budgetSpent, peakCapApplied: false };
}

const MAX_PEAK_CAP_ITERATIONS = 50;

/** PTO-cost days (not free weekends/holidays) that a set of breaks spends inside
 * [windowStart, windowEnd] - the same "is this day actually costing a PTO day" logic
 * solveCore itself uses (isOff), recomputed here from the plain offDays/workWeek inputs
 * since Break only carries its full day span, not a per-day free/cost flag. */
function peakSpendInWindow(
  breaks: Break[],
  offSet: Set<string>,
  workWeek: WorkWeek,
  windowStart: ISODate,
  windowEnd: ISODate,
): number {
  let spent = 0;
  for (const b of breaks) {
    for (const d of b.days) {
      if (d < windowStart || d > windowEnd) continue;
      if (!isWorkingDow(d, workWeek)) continue; // weekend - free, not PTO spend
      if (offSet.has(d)) continue; // holiday - free, not PTO spend
      spent++;
    }
  }
  return spent;
}

/**
 * Phase 5.1: enforces a peak-window PTO cap by repeatedly blacking out the single
 * PTO-cost day, within the window, belonging to the LOWEST-multiplier break still
 * crossing it, then re-solving from scratch - never touching a day the user has
 * explicitly pinned (mustIncludeDays), since a hard user request outranks a soft employer
 * policy default. Bounded by MAX_PEAK_CAP_ITERATIONS, generous relative to how many
 * distinct breaks could realistically overlap one window. This is NOT a joint optimum
 * (a true one would need a peak-budget DP dimension) - see PeakCapInput's own comment for
 * why that scope was deliberately not taken on for a secondary, opt-in constraint.
 */
function enforcePeakCap(input: SolveInput, peakCap: PeakCapInput, initial: SolveResult): SolveResult {
  if (!peakCap.enabled || peakCap.maxDays < 0 || peakCap.startDate > peakCap.endDate) {
    return { ...initial, peakCapApplied: false };
  }

  const offSet = new Set(input.offDays ?? []);
  const workWeek = input.workWeek ?? DEFAULT_WORK_WEEK;
  const pinned = new Set(input.mustIncludeDays ?? []);
  const blackouts = new Set(input.blackouts ?? []);

  let result = initial;
  let applied = false;

  for (let iter = 0; iter < MAX_PEAK_CAP_ITERATIONS; iter++) {
    const spent = peakSpendInWindow(result.primary, offSet, workWeek, peakCap.startDate, peakCap.endDate);
    if (spent <= peakCap.maxDays) break;

    const inWindow = result.primary.filter((b) =>
      b.days.some(
        (d) => d >= peakCap.startDate && d <= peakCap.endDate && isWorkingDow(d, workWeek) && !offSet.has(d) && !pinned.has(d),
      ),
    );
    if (inWindow.length === 0) break; // every remaining in-window PTO day is pinned - cap can't be honoured further

    inWindow.sort((a, b) => a.multiplier - b.multiplier || (a.start < b.start ? -1 : 1));
    const worst = inWindow[0];
    let removedAny = false;
    for (const d of worst.days) {
      if (d >= peakCap.startDate && d <= peakCap.endDate && isWorkingDow(d, workWeek) && !offSet.has(d) && !pinned.has(d)) {
        blackouts.add(d);
        removedAny = true;
      }
    }
    if (!removedAny) break; // defensive: inWindow's own filter guarantees this, kept for safety

    applied = true;
    result = solveCore({ ...input, blackouts: Array.from(blackouts) });
  }

  return { ...result, peakCapApplied: applied };
}

export function solve(input: SolveInput): SolveResult {
  const result = solveCore(input);
  if (!input.peakCap) return result;
  return enforcePeakCap(input, input.peakCap, result);
}

/** w values sampled to build the "achievable plans at this budget and break count"
 * distribution for the efficiency percentile. Six points plus the caller's exact w (added
 * below) keeps this cheap - each solve() is well under budget relative to the 1000ms
 * performance ceiling - while still covering the full 0-100 range. */
const SCORE_W_SWEEP = [0, 20, 40, 60, 80, 100];

/**
 * Standard inclusive percentile rank: the % of a real distribution my plan is at least as
 * good as. `higherIsBetter` controls the direction, and is the ONLY thing that differs
 * between the two scores below - get this flag wrong for travel and the percentile
 * silently inverts (quiet plans would score low instead of high) while still looking like
 * a plausible number, which is why it's named for the thing it controls rather than left
 * as a bare boolean at the call site. No scaling or transform: this is a plain count-based
 * rank against the actual sampled values.
 *
 * INCLUSIVE, not strict: a value tied with the rest of the distribution counts as "not
 * beaten" in my favor, not excluded. This matters a lot here specifically, because the
 * efficiency distribution is a small sweep of w values (solve.ts's SCORE_W_SWEEP) that
 * frequently tie - Phase 6/7 deliberately made spend and plan structure flat across wide
 * ranges of w, so the TRUE maximum is often shared by most of the sample. A strict "count
 * how many I strictly beat" formula scored a plan tied for the maximum as beating only the
 * one or two points that happened to be worse, producing a misleadingly low percentile
 * (e.g. 14th) for a plan that was, in fact, the best achievable - see NOTES.md for the
 * full writeup of this bug. When my value genuinely IS the max of the distribution, this
 * formula always returns exactly 100, regardless of how many ties or how many points are
 * strictly worse, which is the correct, standard reading of "percentile rank."
 */
function percentileBetterThan(distribution: number[], value: number, higherIsBetter: boolean): number {
  if (distribution.length === 0) return 50;
  const notBetterCount = distribution.filter((d) => (higherIsBetter ? d <= value : d >= value)).length;
  return Math.round((notBetterCount / distribution.length) * 100);
}

/** Mean demand per non-overlapping 7-day chunk of the range - "all weeks in the selected
 * date range", real data, no transform. */
function weeklyMeanDemands(days: ISODate[], country: string | undefined): number[] {
  const weeks: number[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    const mean = chunk.reduce((s, d) => s + demandFor(d, country).value, 0) / chunk.length;
    weeks.push(mean);
  }
  return weeks;
}

/**
 * Efficiency and Travel percentiles for the summary strip - the percentile IS the score,
 * not an indexed number with a percentile attached to it. Recomputed from the same
 * SolveInput and SolveResult the caller already has - no caching beyond whatever the
 * caller memoizes.
 *
 * EFFICIENCY: the chosen plan's days-off-per-PTO-day ratio, ranked against a sweep of
 * plans actually solvable at this exact (budget, breakCount) pair, varying only w - the
 * one other solver dimension - since the spec scopes this to "achievable plans at the
 * same budget and break count". Higher ratio = higher percentile = better.
 *
 * TRAVEL: the chosen plan's mean demand, ranked against the mean demand of every real
 * calendar week in the selected range - "all weeks in the selected date range". This is
 * where the direction inverts and is easy to get backwards: LOW raw demand is the GOOD
 * outcome, so the percentile must count how many weeks are BUSIER than the plan (not
 * quieter), or a quiet plan would silently get a LOW percentile instead of a high one -
 * `percentileBetterThan(..., higherIsBetter: false)` is exactly that count. See
 * `solve.test.ts`'s "verify the inversion" test, which hand-computes an expected
 * percentile from a known weekly distribution specifically to catch this mistake.
 */
export function computeScores(input: SolveInput, result: SolveResult): Scores | null {
  if (result.primary.length === 0 || result.budgetSpent === 0) return null;

  const days = rangeISO(input.rangeStart, input.rangeEnd);
  if (days.length === 0) return null;

  const totalDaysOff = result.primary.reduce((s, b) => s + b.totalDaysOff, 0);
  const planEfficiency = totalDaysOff / result.budgetSpent;
  const planMeanDemand = result.primary.reduce((s, b) => s + b.meanDemand, 0) / result.primary.length;

  const currentW = Math.max(0, Math.min(100, Math.round(input.w ?? DEFAULT_W)));
  const sweepWs = Array.from(new Set([...SCORE_W_SWEEP, currentW]));
  const achievableEfficiencies: number[] = [];
  for (const sweepW of sweepWs) {
    const r = sweepW === currentW ? result : solve({ ...input, w: sweepW });
    if (r.primary.length === 0 || r.budgetSpent === 0) continue;
    const d = r.primary.reduce((s, b) => s + b.totalDaysOff, 0);
    achievableEfficiencies.push(d / r.budgetSpent);
  }
  const efficiencyPercentile = percentileBetterThan(achievableEfficiencies, planEfficiency, true);

  const weeklyDemands = weeklyMeanDemands(days, input.country);
  const travelPercentile = percentileBetterThan(weeklyDemands, planMeanDemand, false);

  return {
    efficiency: { percentile: efficiencyPercentile },
    travel: { percentile: travelPercentile },
  };
}
