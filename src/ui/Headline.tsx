import type { Scores } from '../solver/types';
import { ordinal } from './scoreFormat';
import { Container } from './Container';

interface HeadlineProps {
  budgetSpent: number;
  totalDaysOff: number;
  breakCountActual: number;
  scores: Scores | null;
  /** Raw total PTO balance, before reserve is subtracted - only needed to render the
   * reserve-aware headline (Phase 3.1); omit entirely elsewhere. */
  budget: number;
  reserveDays: number;
  canPin: boolean;
  onPin: () => void;
  pinnedCount: number;
}

/**
 * Phase 3.1: "12 of 15 days planned · 3 kept in reserve → 26 days off" when a reserve is
 * set - must read as a DELIBERATE choice, never as the unspent-budget warning
 * (PrimaryControls' own "add no days off at any position" message, which is a different
 * thing and compares against the post-reserve budget, not this). Falls back to the plain
 * "N PTO days → M days off" phrasing when reserveDays is 0 - a reserve of zero means the
 * user explicitly chose to plan with their whole balance, so there's nothing to call out.
 */
export function headlineText(budgetSpent: number, budget: number, reserveDays: number, totalDaysOff: number): string {
  const offWord = totalDaysOff === 1 ? 'day' : 'days';
  if (reserveDays > 0) {
    const dayWord = budget === 1 ? 'day' : 'days';
    return `${budgetSpent} of ${budget} ${dayWord} planned · ${reserveDays} kept in reserve → ${totalDaysOff} ${offWord} off`;
  }
  const spentWord = budgetSpent === 1 ? 'day' : 'days';
  return `${budgetSpent} PTO ${spentWord} → ${totalDaysOff} ${offWord} off`;
}

/**
 * The answer, put first: on load the user saw five inputs, two sliders, a legend and
 * three months of calendar before this line - cut off below the fold in small text. This
 * is now the first thing under the tagline, large and sticky (`top-0`, same role the full
 * control bar used to have), so it's never scrolled away while adjusting the plan below.
 *
 * UI density pass: the headline number, break count, and Travel/Efficiency percentiles now
 * sit on ONE flowing line (`items-baseline`, wrapping together as a unit rather than as
 * separate stacked rows) - the headline stays visually largest, the rest reads as normal-
 * size supporting detail beside it, not below it. The old per-score percentile bar blocks
 * (text + a width-coded bar, each its own two-line block) duplicated the exact same numbers
 * this line already states in words and cost two more rows doing it - removed, not moved;
 * the percentile itself is still right here.
 */
export function Headline({ budgetSpent, totalDaysOff, breakCountActual, scores, budget, reserveDays, canPin, onPin, pinnedCount }: HeadlineProps) {
  const pinTitle =
    pinnedCount === 0
      ? 'Pin up to two plans to compare side by side.'
      : canPin
        ? 'Pin this plan'
        : 'Two pinned — remove one to pin another.';
  return (
    <div
      className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur"
      role="status"
    >
      <Container className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-2xl font-bold leading-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
            {headlineText(budgetSpent, budget, reserveDays, totalDaysOff)}
          </span>
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {breakCountActual} break{breakCountActual === 1 ? '' : 's'}
            {scores ? ` · Travel ${ordinal(scores.travel.percentile)} · Efficiency ${ordinal(scores.efficiency.percentile)}` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={onPin}
          disabled={!canPin}
          title={pinTitle}
          className="shrink-0 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Pin this plan
        </button>
      </Container>
    </div>
  );
}
