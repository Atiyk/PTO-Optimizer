import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { isoToSerial, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { validCalendarDate } from '../personal/employerCalendar';
import { solveConsumer, validatePtoDates } from './optimizer';
import type { ConstraintSet } from './constraintRecommendationAdapter';

/** Every entry describes a WHOLE funded plan, not a fragment of a solver result. */
export type PortfolioObjective = 'longest-break' | 'most-getaways' | 'balanced' | 'constraint-fit';
export interface PortfolioBreak {
  start: string;
  end: string;
  calendarDays: number;
  ptoDays: number;
}
export interface CanonicalPortfolio {
  objective: PortfolioObjective;
  breaks: PortfolioBreak[];
  getawayCount: number;
  longestBreakDays: number;
  totalCalendarDays: number;
  ptoDays: number;
  budgetRemaining: number;
  /** Dates inside a selected break with no PTO cost: holidays, approved leave OR nonwork shifts. */
  freeCalendarDates: string[];
  reviewDates: string[];
  partialCalendarEvidence: boolean;
  /** No legacy 2025 US TSA day-key data is used in portfolio optimisation. */
  travelSignal: 'not-used';
  explanation: string;
}
export type PortfolioShortfallKind =
  | 'no-feasible-plan'
  | 'no-pto-days'
  | 'unavailable-dates'
  | 'one-plan-found'
  | 'shared-objective-winners'
  | 'incomplete-calendar'
  | 'bounded-search';

export interface CanonicalPortfolioReport {
  portfolios: CanonicalPortfolio[];
  feasiblePlanCount: number;
  /** True when the bounded search skipped engine alternatives it found. */
  searchLimited?: boolean;
  shortfalls: Array<{ kind: PortfolioShortfallKind; message: string }>;
}

interface Candidate extends Omit<CanonicalPortfolio, 'objective' | 'explanation'> {
  key: string;
}
const MAX_RANGE_DAYS = 1096;
const MAX_BUDGET = 1096;
const MAX_CALENDAR_EVENTS = 10000;
const MAX_FEASIBILITY_RETRIES = 2;
const MAX_PLAN_REPLACEMENTS = 24;
// Reserve the getaway optimum first; other labels must never inherit a runner-up plan.
const objectives: PortfolioObjective[] = ['most-getaways', 'longest-break', 'balanced', 'constraint-fit'];

/** A displayed getaway is continuous calendar time: adjacent solver fragments count once.
 * Genuinely overlapping fragments are rejected, not silently double charged. */
export function normalizePortfolioBreaks(breaks: readonly PortfolioBreak[]): PortfolioBreak[] | null {
  if (!Array.isArray(breaks) || breaks.length > MAX_RANGE_DAYS) return null;
  const ordered = [...breaks].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const normalized: PortfolioBreak[] = [];
  for (const brk of ordered) {
    if (!brk || !validCalendarDate(brk.start) || !validCalendarDate(brk.end)
      || brk.start > brk.end || !Number.isInteger(brk.calendarDays)
      || brk.calendarDays !== isoToSerial(brk.end) - isoToSerial(brk.start) + 1
      || !Number.isInteger(brk.ptoDays) || brk.ptoDays < 0 || brk.ptoDays > brk.calendarDays) return null;
    const previous = normalized[normalized.length - 1];
    if (previous) {
      const gap = isoToSerial(brk.start) - isoToSerial(previous.end);
      if (gap <= 0) return null;
      if (gap === 1) {
        previous.end = brk.end;
        previous.calendarDays += brk.calendarDays;
        previous.ptoDays += brk.ptoDays;
        continue;
      }
    }
    normalized.push({ ...brk });
  }
  return normalized;
}

export interface PortfolioOptions {
  /** First day permitted by an explicitly established employer notice policy. */
  earliestNoticeDate?: string;
  /** Pure, bounded WHOLE candidate test before per-objective selection, never after winners. */
  candidateEligible?: (candidate: Readonly<Omit<CanonicalPortfolio, 'objective' | 'explanation'>>) => boolean;
  /** At most three smaller PTO budget probes; candidates are repriced under the original budget. */
  additionalSearchBudgets?: readonly number[];
}

type PortfolioMetrics = Pick<CanonicalPortfolio,
  'getawayCount' | 'longestBreakDays' | 'totalCalendarDays' | 'ptoDays' | 'reviewDates'>;

/** Negative => A is preferable. Primary objective dimensions are compared
 * lexicographically; no amount of secondary days can overpower one more getaway. */
export function comparePortfolioMetrics(
  a: PortfolioMetrics, b: PortfolioMetrics, objective: PortfolioObjective,
): number {
  const terms = (c: PortfolioMetrics): number[] => {
    switch (objective) {
      case 'most-getaways':
        return [c.getawayCount, c.totalCalendarDays, -c.reviewDates.length, -c.ptoDays];
      case 'longest-break':
        return [c.longestBreakDays, c.totalCalendarDays, -c.reviewDates.length, -c.ptoDays];
      case 'balanced':
        return [c.totalCalendarDays * 10 + c.getawayCount * 20 - c.ptoDays - c.reviewDates.length * 5,
          c.getawayCount, c.totalCalendarDays, -c.ptoDays];
      case 'constraint-fit':
        return [-c.reviewDates.length, c.totalCalendarDays, -c.ptoDays, c.getawayCount];
    }
  };
  const left = terms(a);
  const right = terms(b);
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return right[i] - left[i];
  }
  return 0;
}

/**
 * Generate distinct, feasible multi-break portfolios with the unmodified consumer solver.
 * Hard calendar exclusions are passed BEFORE every solve. Soft conflicts affect only
 * candidate ranking. Travel w=0 is intentional: legacy day-key TSA observations from
 * 2025 cannot substantiate future weekday-level travel rankings.
 *
 * This API is strictly day-only. Callers with hourly/fractional wallet balances must
 * convert with their actual policy and shift schedule before invoking; no rounding.
 * Null = invalid input; [] = valid input but no independently feasible portfolios.
 */
export function selectCanonicalPortfolios(input: SolveInput, constraints: ConstraintSet, options: PortfolioOptions = {}): CanonicalPortfolio[] | null {
  return analyzeCanonicalPortfolios(input, constraints, options)?.portfolios ?? null;
}

/** Search diagnostics describe the candidates we found within a bounded search. */
export function analyzeCanonicalPortfolios(input: SolveInput, constraints: ConstraintSet, options: PortfolioOptions = {}): CanonicalPortfolioReport | null {
  if (!input || !constraints || !Array.isArray(constraints.dates)
    || constraints.dates.length > MAX_CALENDAR_EVENTS
    || !Array.isArray(constraints.missingSources)
    || !Array.isArray(input.offDays) || !Array.isArray(input.blackouts ?? [])
    || !Array.isArray(input.mustIncludeDays ?? [])
    || (options.earliestNoticeDate !== undefined && !validCalendarDate(options.earliestNoticeDate))
    || (options.candidateEligible !== undefined && typeof options.candidateEligible !== 'function')
    || (options.additionalSearchBudgets !== undefined && (
      !Array.isArray(options.additionalSearchBudgets)
      || options.additionalSearchBudgets.length > 3
      || !options.additionalSearchBudgets.every(n => Number.isInteger(n) && n >= 0 && n <= input.budget)
    ))
    || !Number.isInteger(input.budget) || input.budget < 0 || input.budget > MAX_BUDGET
    || !validCalendarDate(input.rangeStart) || !validCalendarDate(input.rangeEnd)
    || input.rangeEnd < input.rangeStart
    || isoToSerial(input.rangeEnd) - isoToSerial(input.rangeStart) >= MAX_RANGE_DAYS
    || ![...input.offDays, ...(input.blackouts ?? []), ...(input.mustIncludeDays ?? [])].every(validCalendarDate)
    || !constraints.dates.every(d => d && validCalendarDate(d.date)
      && ['hard-block', 'review-needed', 'context'].includes(d.severity))) return null;
  const workWeek = input.workWeek ?? DEFAULT_WORK_WEEK;
  if (!Array.isArray(workWeek) || workWeek.length !== 7
    || !workWeek.every(day => typeof day === 'boolean') || !workWeek.some(Boolean)) return null;

  const noticeExcluded = options.earliestNoticeDate
    ? rangeISO(input.rangeStart, input.rangeEnd).filter(date => date < options.earliestNoticeDate!) : [];
  const hard = [...new Set([...(input.blackouts ?? []), ...noticeExcluded,
    ...constraints.dates.filter(d => d.severity === 'hard-block').map(d => d.date)])].sort();
  const hardSet = new Set(hard);
  const review = new Set(constraints.dates.filter(d => d.severity === 'review-needed').map(d => d.date));
  const off = new Set(input.offDays);
  const canonicalInput: SolveInput = { ...input, blackouts: hard, w: 0 };
  const partialCalendarEvidence = Boolean(constraints.partial || constraints.missingSources.length);
  const shortfalls: CanonicalPortfolioReport['shortfalls'] = partialCalendarEvidence
    ? [{ kind: 'incomplete-calendar', message: 'Holiday data for these dates is missing or incomplete, so these plans may change. Check the dates before booking.' }]
    : [];
  if (!validatePtoDates(canonicalInput, input.mustIncludeDays ?? []).valid) {
    return { portfolios: [], feasiblePlanCount: 0, shortfalls: [
      ...shortfalls,
      { kind: 'no-feasible-plan', message: 'Required dates cannot be funded or conflict with an unavailable date.' },
    ] };
  }

  const candidates = new Map<string, Candidate>();
  const profiles = [...new Set([1, 7, input.breakCount ?? 3, 3])];
  function addPlan(breaks: readonly { start: string; end: string; totalDaysOff: number; ptoCost: number }[]): void {
    if (!breaks.length || breaks.length > 1096) return;
    const ordered = [...breaks].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
    const segments: PortfolioBreak[] = [];
    const selectedDates: string[] = [];
    let previousEnd = '';
    for (const brk of ordered) {
      if (!validCalendarDate(brk.start) || !validCalendarDate(brk.end)
        || brk.start > brk.end || brk.start <= previousEnd
        || brk.start < input.rangeStart || brk.end > input.rangeEnd) return;
      const dates = rangeISO(brk.start, brk.end);
      if (!dates.length || dates.length > MAX_RANGE_DAYS || dates.some(d => hardSet.has(d))) return;
      const cost = dates.filter(d => workWeek[mondayIndexedDow(d)] && !off.has(d)).length;
      if (dates.length !== brk.totalDaysOff || cost !== brk.ptoCost) return;
      segments.push({ start: brk.start, end: brk.end, calendarDays: dates.length, ptoDays: cost });
      selectedDates.push(...dates);
      previousEnd = brk.end;
    }
    const plan = normalizePortfolioBreaks(segments);
    if (!plan) return;
    const check = validatePtoDates(canonicalInput, selectedDates);
    if (!check.valid) return;
    const ptoDays = plan.reduce((total, brk) => total + brk.ptoDays, 0);
    if (ptoDays !== check.ptoDays.length || ptoDays > input.budget) return;
    const key = plan.map(brk => brk.start + '/' + brk.end).join('|');
    if (candidates.has(key)) return;
    const selected = new Set(selectedDates);
    candidates.set(key, {
      key, breaks: plan, getawayCount: plan.length,
      longestBreakDays: Math.max(...plan.map(brk => brk.calendarDays)),
      totalCalendarDays: plan.reduce((total, brk) => total + brk.calendarDays, 0),
      ptoDays, budgetRemaining: input.budget - ptoDays,
      freeCalendarDates: selectedDates.filter(d => !workWeek[mondayIndexedDow(d)] || off.has(d)),
      reviewDates: [...review].filter(d => selected.has(d)).sort(),
      partialCalendarEvidence,
      travelSignal: 'not-used',
    });
  }

  // Include bounded, lower-budget search passes for partner funding without
  // modifying the legacy default call's solver work or altering its objective labels.
  let searchLimited = false;
  const searchBudgets = [...new Set([input.budget, ...(options.additionalSearchBudgets ?? [])])];
  function search(searchBudget: number, count: number, excluded = hard): void {
    const { result } = solveConsumer({
      ...canonicalInput, budget: searchBudget, breakCount: count, blackouts: excluded,
    });
    addPlan(result.primary);
    if (result.alternatives.length > MAX_PLAN_REPLACEMENTS) searchLimited = true;
    // Each engine alternative replaces a break inside its original funded plan.
    for (const replacement of result.alternatives.slice(0, MAX_PLAN_REPLACEMENTS)) {
      const remaining = result.primary.filter(brk =>
        brk.start !== replacement.replaces.start || brk.end !== replacement.replaces.end);
      addPlan([...remaining, replacement]);
    }
  }
  for (const searchBudget of searchBudgets) {
    for (const count of profiles) {
      if (Number.isInteger(count) && count >= 0 && count <= 7) search(searchBudget, count);
    }
  }

  // Filter before selecting objective winners. A caller's whole-plan test may
  // eliminate the best-looking placements, so retain rejected candidates as
  // deterministic anchors for a bounded second search.
  const feasible: Candidate[] = [];
  const rejected: Candidate[] = [];
  const evaluated = new Set<string>();
  function evaluateCandidates(): boolean {
    for (const candidate of candidates.values()) {
      if (evaluated.has(candidate.key)) continue;
      evaluated.add(candidate.key);
      if (!options.candidateEligible) { feasible.push(candidate); continue; }
      let allowed: unknown;
      try {
        allowed = options.candidateEligible({
          ...candidate, breaks: candidate.breaks.map(brk => ({ ...brk })),
          freeCalendarDates: [...candidate.freeCalendarDates],
          reviewDates: [...candidate.reviewDates],
        });
      } catch {
        return false;
      }
      if (typeof allowed !== 'boolean') return false;
      (allowed ? feasible : rejected).push(candidate);
    }
    return true;
  }
  if (!evaluateCandidates()) return null;
  if (feasible.length === 0 && rejected.length > 0) {
    const required = new Set(input.mustIncludeDays ?? []);
    const retryBudget = Math.min(...searchBudgets);
    const anchors = [...new Set(rejected.flatMap(candidate =>
      candidate.breaks.map(brk => brk.start).filter(date => !required.has(date))))];
    const preferredCount = input.breakCount ?? 3;
    const retryCount = Number.isInteger(preferredCount) && preferredCount >= 0 && preferredCount <= 7 ? preferredCount : 3;
    for (const anchor of anchors.slice(0, MAX_FEASIBILITY_RETRIES)) {
      search(retryBudget, retryCount, [...hard, anchor]);
      if (!evaluateCandidates()) return null;
    }
  }
  const output: CanonicalPortfolio[] = [];
  const used = new Set<string>();
  let sharedWinner = false;
  for (const objective of objectives) {
    const eligible = objective === 'most-getaways'
      ? feasible.filter(candidate => candidate.getawayCount >= 2) : feasible;
    const ranked = [...eligible].sort((a, b) => comparePortfolioMetrics(a, b, objective)
      || a.ptoDays - b.ptoDays || a.key.localeCompare(b.key));
    // A label describes this objective's actual optimum, not the next unused plan.
    // When optima collide, omit the duplicate objective rather than mislabel a runner-up.
    const chosen = ranked[0];
    if (!chosen) continue;
    if (used.has(chosen.key)) { sharedWinner = true; continue; }
    used.add(chosen.key);
    const { key: _key, ...facts } = chosen;
    // A portfolio is a scenario, so different objectives may share dates; only
    // duplicate WHOLE plans are omitted. No private calendar text enters output.
    const reasons: Record<PortfolioObjective, string> = {
      'most-getaways': 'Prioritizes the number of separate getaways.',
      'longest-break': 'Prioritizes the longest uninterrupted break.',
      'balanced': 'Balances calendar days and the number of breaks.',
      'constraint-fit': 'Prioritizes fewer dates needing review.',
    };
    output.push({
      ...facts, objective,
      explanation: 'Best plan found for this objective. ' + reasons[objective] + ' ' + facts.getawayCount + ' separate break(s), ' + facts.totalCalendarDays
        + ' calendar days off using ' + facts.ptoDays + ' PTO days; '
        + facts.reviewDates.length + ' advisory date(s) need review. '
        + 'Travel demand did not influence this recommendation.',
    });
  }
  if (output.length < 3) {
    if (feasible.length === 0) {
      // Separate a zero balance and blocked dates from other infeasibility. The unblocked
      // probe is one bounded solve and only answers "would any break fit without them?".
      const blockedOnly = input.budget > 0 && hard.length > 0
        && solveConsumer({ ...canonicalInput, blackouts: [], breakCount: 1 }).result.primary.length > 0;
      if (input.budget === 0) {
        shortfalls.push({ kind: 'no-pto-days', message: 'You have 0 PTO days to plan with, so there are no plans to compare.' });
      } else if (blockedOnly) {
        shortfalls.push({ kind: 'unavailable-dates', message: 'Your ruled-out dates leave no room for a break in this date range.' });
      } else {
        shortfalls.push({ kind: 'no-feasible-plan', message: 'No plan fits your PTO days and dates.' });
      }
    } else if (feasible.length === 1) {
      shortfalls.push({ kind: 'one-plan-found', message: 'Only one plan fits these settings, so there is nothing to compare it with.' });
    } else if (sharedWinner) {
      shortfalls.push({ kind: 'shared-objective-winners', message: 'Some goals lead to the same plan, so it appears only once.' });
    }
    if (searchLimited && feasible.length > 0) {
      shortfalls.push({ kind: 'bounded-search', message: 'The planner checks a limited set of plan shapes, so other plans may exist.' });
    }
  }
  return { portfolios: output, feasiblePlanCount: feasible.length, searchLimited, shortfalls };
}
