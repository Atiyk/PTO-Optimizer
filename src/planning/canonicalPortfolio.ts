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
interface Candidate extends Omit<CanonicalPortfolio, 'objective' | 'explanation'> {
  key: string;
}
const MAX_RANGE_DAYS = 1096;
const MAX_BUDGET = 1096;
const MAX_CALENDAR_EVENTS = 10000;
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
  if (!input || !constraints || !Array.isArray(constraints.dates)
    || constraints.dates.length > MAX_CALENDAR_EVENTS
    || !Array.isArray(constraints.missingSources)
    || !Array.isArray(input.offDays) || !Array.isArray(input.blackouts ?? [])
    || !Array.isArray(input.mustIncludeDays ?? [])
    || (options.earliestNoticeDate !== undefined && !validCalendarDate(options.earliestNoticeDate))
    || !Number.isInteger(input.budget) || input.budget < 0 || input.budget > MAX_BUDGET
    || !validCalendarDate(input.rangeStart) || !validCalendarDate(input.rangeEnd)
    || input.rangeEnd < input.rangeStart
    || isoToSerial(input.rangeEnd) - isoToSerial(input.rangeStart) >= MAX_RANGE_DAYS
    || ![...input.offDays, ...(input.blackouts ?? []), ...(input.mustIncludeDays ?? [])].every(validCalendarDate)
    || !constraints.dates.every(d => d && validCalendarDate(d.date)
      && ['hard-block', 'review-needed', 'context'].includes(d.severity))) return null;
  const workWeek = input.workWeek ?? DEFAULT_WORK_WEEK;
  if (!Array.isArray(workWeek) || workWeek.length !== 7
    || !workWeek.every(day => typeof day === 'boolean')) return null;

  const noticeExcluded = options.earliestNoticeDate
    ? rangeISO(input.rangeStart, input.rangeEnd).filter(date => date < options.earliestNoticeDate!) : [];
  const hard = [...new Set([...(input.blackouts ?? []), ...noticeExcluded,
    ...constraints.dates.filter(d => d.severity === 'hard-block').map(d => d.date)])].sort();
  const hardSet = new Set(hard);
  const review = new Set(constraints.dates.filter(d => d.severity === 'review-needed').map(d => d.date));
  const off = new Set(input.offDays);
  const canonicalInput: SolveInput = { ...input, blackouts: hard, w: 0 };
  if (!validatePtoDates(canonicalInput, input.mustIncludeDays ?? []).valid) return [];

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
      partialCalendarEvidence: Boolean(constraints.partial || constraints.missingSources.length),
      travelSignal: 'not-used',
    });
  }

  for (const count of profiles) {
    if (!Number.isInteger(count) || count < 0 || count > 7) continue;
    const { result } = solveConsumer({ ...canonicalInput, breakCount: count });
    addPlan(result.primary);
    // Each engine alternative is a replacement INSIDE its original whole plan.
    // Never add the alternative as an independent, unfunded vacation.
    for (const replacement of result.alternatives.slice(0, 24)) {
      const remaining = result.primary.filter(brk =>
        brk.start !== replacement.replaces.start || brk.end !== replacement.replaces.end);
      addPlan([...remaining, replacement]);
    }
  }

  const feasible = [...candidates.values()];
  const output: CanonicalPortfolio[] = [];
  const used = new Set<string>();
  for (const objective of objectives) {
    const eligible = objective === 'most-getaways'
      ? feasible.filter(candidate => candidate.getawayCount >= 2) : feasible;
    const ranked = [...eligible].sort((a, b) => comparePortfolioMetrics(a, b, objective)
      || a.ptoDays - b.ptoDays || a.key.localeCompare(b.key));
    // A label describes this objective's actual optimum, not the next unused plan.
    // When optima collide, omit the duplicate objective rather than mislabel a runner-up.
    const chosen = ranked[0];
    if (!chosen || used.has(chosen.key)) continue;
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
      explanation: reasons[objective] + ' ' + facts.getawayCount + ' separate break(s), ' + facts.totalCalendarDays
        + ' calendar days off using ' + facts.ptoDays + ' PTO days; '
        + facts.reviewDates.length + ' advisory date(s) need review. '
        + 'Travel demand did not influence this recommendation.',
    });
  }
  return output;
}
