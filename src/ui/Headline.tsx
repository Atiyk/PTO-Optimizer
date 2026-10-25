import type { Scores } from '../solver/types';
import { efficiencyLine, travelLine, ordinal, barFillClass, barFillWidthPercent } from './scoreFormat';

interface HeadlineProps {
  budgetSpent: number;
  totalDaysOff: number;
  breakCountActual: number;
  scores: Scores | null;
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

export function Headline({ budgetSpent, totalDaysOff, breakCountActual, scores }: HeadlineProps) {
  return (
    <div
      className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-4 py-3 backdrop-blur"
      role="status"
    >
      <p className="text-2xl font-bold leading-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
        {budgetSpent} PTO day{budgetSpent === 1 ? '' : 's'} &rarr; {totalDaysOff} day{totalDaysOff === 1 ? '' : 's'} off
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
