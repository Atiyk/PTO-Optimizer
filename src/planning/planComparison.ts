/**
 * Side-by-side data for "which kind of plan do you want?". Pure and deterministic: the same
 * input always returns the same plans in the same order. Every plan returned has passed the
 * same validation the planner applies (validatePtoDates via the style solvers); invalid or
 * empty plans are left out, and plans with identical dates are shown once.
 */
import type { Break, SolveInput } from '@daysoff/engine/solver/types';
import type { PlanningStyle } from './optimizer';
import { validatePtoDates } from './optimizer';
import { seasonsTouched, solveStyled, type PlanStyleOptions, type Season, type StyledOutcome } from './yearPlan';

export interface PlanComparisonInput {
  input: SolveInput;
  minimumBreakDays: number;
  /** Passed to the year-round styles (notice, reserve the person already holds, season). */
  plan?: PlanStyleOptions;
  /** PTO the person set aside before `input.budget` (shown as part of "remaining"). */
  heldReserveDays?: number;
}

export interface PlanComparisonEntry {
  style: PlanningStyle;
  label: string;
  ptoUsed: number;
  totalDaysOff: number;
  longestBreak: number;
  breakCount: number;
  /** YYYY-MM months that hold at least one day of a break, in order. */
  monthsTouched: string[];
  seasonsTouched: Season[];
  /** Balance left unplanned, including any reserve. */
  remainingPto: number;
  reserveKept: number;
  tradeOff: string;
  breaks: Break[];
  note?: string;
}

const LABELS: Partial<Record<PlanningStyle, string>> = {
  year: 'Spread across the year',
  max: 'Most days off',
  season: 'Seasonal priority',
  'long-breaks': 'One big trip',
  'more-breaks': 'Frequent long weekends',
};

function summarise(style: PlanningStyle, outcome: StyledOutcome, cmp: PlanComparisonInput): PlanComparisonEntry {
  const breaks = outcome.result.primary;
  const ptoUsed = validatePtoDates(cmp.input, breaks.flatMap((b) => b.days)).ptoDays.length;
  const totalDaysOff = breaks.reduce((sum, b) => sum + b.totalDaysOff, 0);
  const longestBreak = breaks.reduce((max, b) => Math.max(max, b.totalDaysOff), 0);
  const months = [...new Set(breaks.flatMap((b) => b.days.map((d) => d.slice(0, 7))))].sort();
  const reserveKept = outcome.meta?.reserveKept ?? 0;
  return {
    style,
    label: LABELS[style] ?? style,
    ptoUsed,
    totalDaysOff,
    longestBreak,
    breakCount: breaks.length,
    monthsTouched: months,
    seasonsTouched: seasonsTouched(breaks, cmp.input.country),
    remainingPto: Math.max(0, cmp.input.budget - ptoUsed) + (cmp.heldReserveDays ?? 0),
    reserveKept,
    tradeOff: '',
    breaks,
    ...(outcome.meta?.note ? { note: outcome.meta.note } : {}),
  };
}

function tradeOffFor(entry: PlanComparisonEntry, best: PlanComparisonEntry): string {
  const seasons = entry.seasonsTouched.length;
  const seasonText = `${seasons} ${seasons === 1 ? 'season' : 'seasons'}`;
  const fewer = best.totalDaysOff - entry.totalDaysOff;
  switch (entry.style) {
    case 'year':
      return `Breaks in ${seasonText}${entry.reserveKept ? `, ${entry.reserveKept} ${entry.reserveKept === 1 ? 'day' : 'days'} kept for surprises` : ''}${fewer > 0 ? `; ${fewer} fewer days off than the most possible` : ''}.`;
    case 'max':
      return `The most days off for your PTO, but breaks may bunch together or be mostly long weekends.`;
    case 'season':
      return `A longest break of ${entry.longestBreak} days in your chosen season; the rest is spread out.`;
    case 'long-breaks':
      return `One long trip of ${entry.longestBreak} days; little time off the rest of the year.`;
    default:
      return `${entry.breakCount} breaks across ${seasonText}.`;
  }
}

/** 2-3 genuinely different valid plans: year, max, then a seasonal or one-big-trip plan. */
export function comparePlanStyles(cmp: PlanComparisonInput): PlanComparisonEntry[] {
  const options = { minimumBreakDays: cmp.minimumBreakDays, plan: cmp.plan };
  const candidates: PlanningStyle[] = ['year', 'max', 'season', 'long-breaks'];
  const entries: PlanComparisonEntry[] = [];
  const seen = new Set<string>();
  for (const style of candidates) {
    if (entries.length >= 3) break;
    const outcome = solveStyled(cmp.input, { ...options, style });
    if (outcome.issue || outcome.result.primary.length === 0) continue;
    if (!validatePtoDates(cmp.input, outcome.result.primary.flatMap((b) => b.days)).valid) continue;
    const key = outcome.result.primary.map((b) => b.id).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(summarise(style, outcome, cmp));
  }
  const best = entries.reduce<PlanComparisonEntry | undefined>((top, e) => (!top || e.totalDaysOff > top.totalDaysOff ? e : top), undefined);
  return best ? entries.map((e) => ({ ...e, tradeOff: tradeOffFor(e, best) })) : entries;
}
