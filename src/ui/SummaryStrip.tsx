import type { Scores } from '../solver/types';
import { efficiencyLine, travelLine, ordinal, barFillClass, barFillWidthPercent } from './scoreFormat';

interface SummaryStripProps {
  budgetSpent: number;
  totalDaysOff: number;
  scores: Scores | null;
}

/**
 * Three independent channels carry each score's meaning, so none of them alone has to:
 * bar fill length (the real percentile, always accurate regardless of colour), fill
 * intensity (colour, reinforcement only), and the gloss text (the meaning spelled out in
 * words). Colour is confined entirely to this strip - never the calendar, the band, a day
 * cell, the legend, or a break card.
 */
function PercentileBar({ percentile }: { percentile: number }) {
  const width = barFillWidthPercent(percentile);
  return (
    <div className="relative h-1 w-16 bg-slate-200" aria-hidden>
      <div className={`h-full ${barFillClass(percentile)}`} style={{ width: `${width}%` }} />
      {/* The 50 tick: mix-blend-difference inverts whatever is beneath it, so it stays
          visible whether it lands on the light track or the dark fill, without needing a
          second colour choice that would only work against one of the two. */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-white mix-blend-difference" />
    </div>
  );
}

function ScoreLine({ text, percentile }: { text: string; percentile: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-slate-600">{text}</p>
      <PercentileBar percentile={percentile} />
    </div>
  );
}

export function SummaryStrip({ budgetSpent, totalDaysOff, scores }: SummaryStripProps) {
  const headline = `${budgetSpent} PTO day${budgetSpent === 1 ? '' : 's'} (${totalDaysOff} day${
    totalDaysOff === 1 ? '' : 's'
  } off)${scores ? ` · Travel ${ordinal(scores.travel.percentile)} · Efficiency ${ordinal(scores.efficiency.percentile)}` : ''}`;

  return (
    <div className="flex flex-col gap-2" role="status">
      <p className="text-sm text-slate-700">{headline}</p>
      {scores && (
        <div className="flex flex-wrap gap-6">
          <ScoreLine text={travelLine(scores)} percentile={scores.travel.percentile} />
          <ScoreLine text={efficiencyLine(scores)} percentile={scores.efficiency.percentile} />
        </div>
      )}
    </div>
  );
}
