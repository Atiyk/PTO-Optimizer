import type { SolveInput, SolveResult } from '@daysoff/engine/solver/types';
import { solveConsumer, type ConsumerSolveOptions } from '../planning/optimizer';

export interface PlannerOutcome {
  result: SolveResult;
  issue?: string;
  /** Set when the plan only exists because the minimum break length was set aside for the
   * user's pinned dates: the minimum the person chose, so the UI can say so and offer a
   * way back. Never set silently: App renders a note whenever it is present. */
  relaxedMinimum?: number;
}

/**
 * The consumer solve, plus one honest fallback for pinned days. The engine places a pinned
 * working day as its own break, so a lone pin (for example a Monday after a weekend) can
 * be shorter than the chosen minimum break, and the strict solve then returns an empty
 * plan. Rather than collapsing the whole plan to "0 days off", solve again without the
 * minimum and report that it was relaxed. The solver math itself is unchanged; if the
 * relaxed solve also fails, the original issue stands.
 */
export function solveWithPinFallback(input: SolveInput, options: ConsumerSolveOptions): PlannerOutcome {
  const outcome = solveConsumer(input, options);
  const minimum = options.minimumBreakDays ?? 0;
  const hasPins = (input.mustIncludeDays ?? []).some((date) => date >= input.rangeStart && date <= input.rangeEnd);
  if (!outcome.issue || minimum <= 1 || !hasPins) return outcome;
  const relaxed = solveConsumer(input, { ...options, minimumBreakDays: 0 });
  if (relaxed.issue || relaxed.result.primary.length === 0) return outcome;
  return { ...relaxed, relaxedMinimum: minimum };
}

export interface PinPreview {
  totalDaysOff: number;
  budgetSpent: number;
  relaxedMinimum?: number;
  issue?: string;
}

/** What the plan would actually become if `date` were pinned, from the same call the
 * planner makes - so a hover never promises a gain the solver cannot deliver. */
export function previewPinnedDay(input: SolveInput, options: ConsumerSolveOptions, date: string): PinPreview {
  const pinned: SolveInput = {
    ...input,
    mustIncludeDays: [...new Set([...(input.mustIncludeDays ?? []), date])],
    blackouts: (input.blackouts ?? []).filter((d) => d !== date),
  };
  const outcome = solveWithPinFallback(pinned, options);
  if (outcome.issue) return { totalDaysOff: 0, budgetSpent: 0, issue: outcome.issue };
  // Same total the result line shows (useAppState sums each break's days off).
  const totalDaysOff = outcome.result.primary.reduce((sum, brk) => sum + brk.totalDaysOff, 0);
  return { totalDaysOff, budgetSpent: outcome.result.budgetSpent, relaxedMinimum: outcome.relaxedMinimum };
}

/** One sentence for the day's tooltip and its accessible description. */
export function pinPreviewText(preview: PinPreview, current: { totalDaysOff: number; budgetSpent: number }): string {
  if (preview.issue) return `Pinning this day leaves no valid plan: ${preview.issue}`;
  const delta = preview.totalDaysOff - current.totalDaysOff;
  const change = delta > 0 ? `${delta} more` : delta < 0 ? `${-delta} fewer` : 'no change';
  const ptoWord = preview.budgetSpent === 1 ? 'day' : 'days';
  const base = `Pin it: ${preview.totalDaysOff} days off for ${preview.budgetSpent} PTO ${ptoWord} (${change})`;
  return preview.relaxedMinimum ? `${base}, only without your ${preview.relaxedMinimum}-day minimum break.` : `${base}.`;
}
