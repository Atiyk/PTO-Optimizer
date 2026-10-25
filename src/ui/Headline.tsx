import type { Scores } from '../solver/types';
import { efficiencyLine, travelLine, ordinal, barFillClass, barFillWidthPercent } from './scoreFormat';

interface HeadlineProps {
  budgetSpent: number;
  totalDaysOff: number;
  breakCountActual: number;
  scores: Scores | null;
  /** Raw total PTO balance, before reserve is subtracted - only needed to render the
   * reserve-aware headline (Phase 3.1); omit entirely elsewhere. */
  budget: number;
  reserveDays: number;
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
 * Percentiles and break count are deliberately normal-size supporting detail underneath
 * the headline, not competing with it - same three-channel percentile bar as before
 * (width = real value, colour = reinforcement only, text = the meaning in words).
 */
function PercentileBar({ percentile }: { percentile: number }) {
  const width = barFillWidthPercent(percentile);
  return (
    <div className="relative h-1 w-16 bg-[var(--score-track)]" aria-hidden>
      <div className={`h-full ${barFillClass(percentile)}`} style={{ width: `${width}%` }} />
      <div className="absolute inset-y-0 left-1/2 w-px bg-white mix-blend-difference" />
    </div>
  );
}

function ScoreLine({ text, percentile }: { text: string; percentile: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-slate-600 dark:text-slate-300">{text}</p>
      <PercentileBar percentile={percentile} />
    </div>
  );
}

export function Headline({ budgetSpent, totalDaysOff, breakCountActual, scores, budget, reserveDays }: HeadlineProps) {
  return (
    <div
      className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-4 py-3 backdrop-blur"
      role="status"
    >
      <p className="text-2xl font-bold leading-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
        {headlineText(budgetSpent, budget, reserveDays, totalDaysOff)}
      </p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {breakCountActual} break{breakCountActual === 1 ? '' : 's'}
        {scores ? ` · Travel ${ordinal(scores.travel.percentile)} · Efficiency ${ordinal(scores.efficiency.percentile)}` : ''}
      </p>
      {scores && (
        <div className="mt-2 flex flex-wrap gap-6">
          <ScoreLine text={travelLine(scores)} percentile={scores.travel.percentile} />
          <ScoreLine text={efficiencyLine(scores)} percentile={scores.efficiency.percentile} />
        </div>
      )}
    </div>
  );
}
