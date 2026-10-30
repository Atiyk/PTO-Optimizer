import type { Scores } from '@daysoff/engine/solver/types';
import { ordinal } from './scoreFormat';
import { Container } from './Container';
import { ACCENT_BUTTON } from './colorScheme';

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
      className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 backdrop-blur"
      role="status"
    >
      <Container className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {/* Semantic HTML pass (Phase 5): the one h1 on the page - this sentence genuinely
              is the page's main heading ("the answer, put first"), just not previously
              marked as one. m-0 overrides the browser's default h1 margin, which would
              otherwise add unwanted vertical space inside this flex row. */}
          <h1 className="m-0 text-2xl font-bold leading-tight tabular-nums text-slate-900 sm:text-3xl">
            {headlineText(budgetSpent, budget, reserveDays, totalDaysOff)}
          </h1>
          <span className="text-sm tabular-nums text-slate-600">
            {breakCountActual} break{breakCountActual === 1 ? '' : 's'}
            {scores ? ` · Travel ${ordinal(scores.travel.percentile)} · Efficiency ${ordinal(scores.efficiency.percentile)}` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={onPin}
          disabled={!canPin}
          title={pinTitle}
          className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            canPin ? ACCENT_BUTTON : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Pin this plan
        </button>
      </Container>
    </div>
  );
}
