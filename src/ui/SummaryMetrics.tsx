import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Scores } from '@daysoff/engine/solver/types';
import { intensityBand } from './scoreFormat';

interface SummaryMetricsProps {
  budgetSpent: number;
  totalDaysOff: number;
  /** Kept for API stability: the headline states the break count. */
  breakCountActual: number;
  scores: Scores | null;
  /** 'us': scored on 2025 US airport checkpoint counts. 'estimate': a seasonal rule of thumb
   * with no country data behind it, so the travel tile is hidden (F24). */
  travelBasis?: 'us' | 'estimate';
}

/** A changed figure gets one brief pale-marker pass (150ms), never a loop, never on load;
 * prefers-reduced-motion collapses it (index.css). */
function useChangeFlash(value: string): boolean {
  const prev = useRef(value);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), 150);
    return () => clearTimeout(timer);
  }, [value]);
  return flashing;
}

function Fact({ figure, label, short, children }: { figure: string; label: string; short: string; children: ReactNode }) {
  const flashing = useChangeFlash(figure);
  return (
    <div className="min-w-0">
      <dt className="sr-only">{label}</dt>
      <dd className="m-0">
        <span
          data-figure
          className={`-mx-1 inline-block w-fit rounded-[6px] px-1 text-2xl leading-7 sm:text-[1.75rem] sm:leading-8 tabular-nums text-ink type-display transition-colors duration-150 ${
            flashing ? 'bg-accent-soft' : 'bg-transparent'
          }`}
        >
          {figure}
        </span>
        {/* Phones: the three figures share one row with a short label each; the full
            plain-language reading appears from sm up. */}
        <span aria-hidden="true" className="block text-xs leading-4 text-muted sm:hidden">{short}</span>
        <span className="sr-only sm:not-sr-only sm:mt-1 sm:block sm:text-sm sm:leading-5 sm:text-muted">{children}</span>
      </dd>
    </div>
  );
}

function trimDecimal(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Keep the exact PTO arithmetic separate from broad travel model context.
 * The internal travel percentile only selects an ordinal band for US history.
 */
export function SummaryMetrics({ budgetSpent, totalDaysOff, scores, travelBasis = 'estimate' }: SummaryMetricsProps) {
  const ratio = budgetSpent > 0 ? trimDecimal(totalDaysOff / budgetSpent) : null;
  // Only the US has country-specific travel data. Elsewhere the tile could only say "generic
  // seasonal estimate", which tells the reader nothing, so the ratio tile takes the row (F24).
  const showTravel = travelBasis === 'us';
  const travelFigure = scores ? ['Busier', 'Typical', 'Quieter'][intensityBand(scores.travel.percentile)] : '—';
  return (
    <dl className={`m-0 grid gap-x-4 border-t border-line pt-4 sm:gap-x-8 ${showTravel ? 'grid-cols-2' : 'grid-cols-1'}`}>
      <Fact figure={ratio ? `${ratio}×` : '—'} label="Days off per PTO day" short="days off per PTO day">
        {/* The headline already states the total and its split; this line only says what the
            ratio means, so the same numbers are not read out a third time. */}
        {ratio
          ? <>Days off, weekends and holidays included, for each PTO day you spend.</>
          : <>No PTO placed yet, so there is no ratio to show.</>}
      </Fact>
      {showTravel && (
        <Fact figure={travelFigure} label="Travel estimate" short="travel estimate">
          {scores
            ? <>How busy airports usually are on these dates, from a 7-day average of 2025 US airport checkpoint counts. Not a forecast or a fare price.</>
            : <>Shows once your plan is ready.</>}
        </Fact>
      )}
    </dl>
  );
}
