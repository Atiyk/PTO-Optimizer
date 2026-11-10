import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { isoToSerial, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { validCalendarDate } from '../personal/employerCalendar';
import { solveConsumer, validatePtoDates } from './optimizer';
import { selectRecommendationAlternatives, type RecommendationAlternative, type RecommendationCandidate } from './recommendationAlternatives';
import type { ConstraintSet } from './constraintRecommendationAdapter';

/**
 * Canonical consumer-only source of recommendation candidates.
 * The caller supplies constraints and PTO policy inputs, NOT claimed costs or durations.
 * Hard exclusions enter solveConsumer before planning. Every displayed interval is
 * re-priced from its actual workdays and observed holidays, independently of solver tags.
 *
 * This bridge intentionally supports whole-day PTO budgets only. Hourly/partial-shift
 * wallets require an explicit policy-aware conversion, never silent unit mixing.
 */
export function selectCanonicalRecommendationAlternatives(
  input: SolveInput,
  constraints: ConstraintSet,
): RecommendationAlternative[] | null {
  if (!input || !constraints || !Array.isArray(constraints.dates)
    || constraints.dates.length > 10000 || !Array.isArray(input.offDays)
    || !Array.isArray(input.blackouts ?? []) || !Number.isInteger(input.budget)
    || input.budget < 0 || input.budget > 1096
    || !validCalendarDate(input.rangeStart) || !validCalendarDate(input.rangeEnd)
    || input.rangeEnd < input.rangeStart
    || isoToSerial(input.rangeEnd) - isoToSerial(input.rangeStart) > 1095
    || !input.offDays.every(validCalendarDate)
    || !(input.blackouts ?? []).every(validCalendarDate)
    || !constraints.dates.every(d => d && validCalendarDate(d.date)
      && ['hard-block', 'review-needed', 'context'].includes(d.severity))) return null;

  const hard = new Set([...(input.blackouts ?? []), ...constraints.dates
    .filter(d => d.severity === 'hard-block').map(d => d.date)]);
  const advisory = new Set(constraints.dates
    .filter(d => d.severity === 'review-needed').map(d => d.date));
  const workWeek = input.workWeek ?? DEFAULT_WORK_WEEK;
  if (!Array.isArray(workWeek) || workWeek.length !== 7
    || !workWeek.every(day => typeof day === 'boolean') || !workWeek.some(Boolean)) return null;

  const canonicalInput = { ...input, blackouts: [...hard], w: 0 };
  const { result } = solveConsumer(canonicalInput);
  const off = new Set(input.offDays);
  const verified: RecommendationCandidate[] = [];
  for (const brk of [...result.primary, ...result.alternatives]) {
    if (!validCalendarDate(brk.start) || !validCalendarDate(brk.end)
      || brk.start > brk.end || brk.start < input.rangeStart
      || brk.end > input.rangeEnd) continue;
    const interval = rangeISO(brk.start, brk.end);
    if (interval.length === 0 || interval.length > 1096 || interval.some(d => hard.has(d))) continue;
    const cost = interval.filter(d => workWeek[mondayIndexedDow(d)] && !off.has(d)).length;
    // A break from a multi-break solution is not automatically a feasible standalone plan.
    // Recheck pinned dates, accrual timing, expiry/carryover and peak caps against
    // this exact displayed interval; never present a replacement as independently funded.
    if (brk.totalDaysOff !== interval.length || brk.ptoCost !== cost
      || cost > input.budget || !validatePtoDates(canonicalInput, interval).valid) continue;
    verified.push({
      start: brk.start, end: brk.end,
      ptoDays: cost, breakDays: interval.length, getawayCount: 1,
      hardExcludedDates: [...hard],
      reviewDates: interval.filter(d => advisory.has(d)),
    });
  }
  return selectRecommendationAlternatives(verified, input.budget);
}
